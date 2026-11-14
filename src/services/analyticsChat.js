import { z } from 'zod';
import { supabase } from '../lib/supabase.js';

// The chatbot is a separate service (see the ChatBot folder). The app only needs its public address.
// The learner's Supabase sign-in token is sent along, and the service lets administrators in only.
export const CHATBOT_URL = (import.meta.env.VITE_CHATBOT_URL || '').replace(/\/+$/, '');
export const isChatbotConfigured = Boolean(CHATBOT_URL);

const replySchema = z.object({ reply: z.string() });

export class ChatError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

const STATUS_TEXT = {
  401: 'Your sign-in expired. Log in again.',
  403: 'Analytics is for administrators only.',
  429: 'Too many questions. Wait a minute and try again.',
  422: 'That message could not be sent. Try a shorter question.',
};

/** history: [{ role: 'user' | 'assistant', content: string }], newest last. Returns the reply text. */
export async function askAnalytics(history) {
  if (!isChatbotConfigured) throw new ChatError('The analytics service address is not set (VITE_CHATBOT_URL).');
  const { data } = (await supabase?.auth.getSession()) ?? { data: null };
  const token = data?.session?.access_token;
  if (!token) throw new ChatError(STATUS_TEXT[401], 401);

  let res;
  try {
    res = await fetch(`${CHATBOT_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: history.slice(-20) }),
    });
  } catch {
    throw new ChatError('Could not reach the analytics service. Check your internet connection.');
  }
  if (!res.ok) throw new ChatError(STATUS_TEXT[res.status] || `The analytics service returned an error (${res.status}).`, res.status);
  const parsed = replySchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ChatError('The analytics service sent an unexpected answer.');
  return parsed.data.reply;
}
