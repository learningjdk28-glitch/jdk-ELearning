import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { CHATBOT_URL, ChatError, isChatbotConfigured } from './analyticsChat.js';

// Learning assistant: same secure backend, different endpoint. Any signed-in learner may use it.
const replySchema = z.object({ reply: z.string() });

const STATUS_TEXT = {
  401: 'Your sign-in expired. Log in again.',
  404: 'The learning assistant is not enabled on the server.',
  429: 'Too many questions. Wait a minute and try again.',
  422: 'That message could not be sent. Try a shorter question.',
};

export const isAssistantConfigured = isChatbotConfigured;

/** history: [{ role: 'user' | 'assistant', content: string }], newest last. Returns the reply text. */
export async function askAssistant(history) {
  if (!isChatbotConfigured) throw new ChatError('The assistant address is not set (VITE_CHATBOT_URL).');
  const { data } = (await supabase?.auth.getSession()) ?? { data: null };
  const token = data?.session?.access_token;
  if (!token) throw new ChatError(STATUS_TEXT[401], 401);

  let res;
  try {
    res = await fetch(`${CHATBOT_URL}/api/assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: history.slice(-20) }),
    });
  } catch {
    throw new ChatError('Could not reach the assistant. Check your internet connection.');
  }
  if (!res.ok) throw new ChatError(STATUS_TEXT[res.status] || `The assistant returned an error (${res.status}).`, res.status);
  const parsed = replySchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ChatError('The assistant sent an unexpected answer.');
  return parsed.data.reply;
}
