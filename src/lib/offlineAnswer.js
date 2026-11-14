// Offline fallback for the learning assistant: local FAQs plus glossary explanations.
// Pure functions so they can be tested without a browser.

export const FAQS = [
  {
    id: 'explain-topic',
    keywords: ['explain a topic', 'explain topic', 'explain something'],
    answer:
      'I can explain any glossary term while you are offline. Type a term such as "router", "IP address", "DNS" or "LAN". You can also open Glossary in the menu to browse all terms.',
  },
  {
    id: 'quiz-help',
    keywords: ['help with a quiz', 'quiz', 'test', 'exam', 'assessment'],
    answer:
      'Quiz tips: read the whole question first, rule out answers you know are wrong, then pick the best one. If you are unsure, skip it and come back. After the quiz, review the lesson for the competency with your lowest score. Quizzes work offline.',
  },
  {
    id: 'study-tips',
    keywords: ['study tips', 'give study tips', 'how to study', 'study', 'revise', 'remember', 'memorize'],
    answer:
      'Study tips:\n1. Study in short sessions of 20 to 25 minutes.\n2. Review a lesson again after one day and after one week.\n3. Explain each idea in your own words, out loud.\n4. Use the "explain like I am five" text for hard terms.\n5. Take the module quiz, then revisit the weakest competency.',
  },
  {
    id: 'networking-basics',
    keywords: ['networking basics', 'tell me about networking', 'modules', 'course'],
    answer:
      'Networking Basics has four short modules:\n1. Introduction to Computer Networks (LAN, WAN, the internet)\n2. Networking Devices and Connections (routers, switches, modems, Wi-Fi, Ethernet)\n3. IP Addresses and Internet Communication (IP, DNS, packets, web requests)\n4. Network Safety and Basic Troubleshooting\nStart with module 1 and take the quiz at the end of each one.',
  },
  {
    id: 'offline',
    keywords: ['offline', 'no internet', 'internet connection', 'sync'],
    answer:
      'Lessons, quizzes and the glossary work offline. Your results are saved on this device and sync when you are online again. The AI assistant needs internet, so I answer from saved FAQs and the glossary for now.',
  },
  {
    id: 'level',
    keywords: ['level', 'foundational', 'standard', 'advanced', 'adaptive'],
    answer:
      'Your level comes from a fixed rule, not a trained AI model: under 50 percent is foundational, 50 to 79 percent is standard, and 80 percent or more is advanced.',
  },
];

const norm = (s) => String(s).toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hasPhrase = (text, phrase) => ` ${text} `.includes(` ${phrase} `);

/** Find the longest glossary term mentioned in the text. Returns the term key or null. */
export function findTerm(text, glossary) {
  const q = norm(text);
  let best = null;
  for (const key of Object.keys(glossary)) {
    const term = norm(key);
    if (term && hasPhrase(q, term) && (!best || term.length > norm(best).length)) best = key;
  }
  return best;
}

export function describeTerm(key, glossary) {
  const [definition, simple, example] = glossary[key];
  const plain = key.replace(/[_-]+/g, ' ');
  const title = plain.length <= 4 ? plain.toUpperCase() : plain.charAt(0).toUpperCase() + plain.slice(1);
  return `${title}: ${definition}\n\nIn simple words: ${simple}\n\nExample: ${example}`;
}

/** Offline answer for a question. Always returns text; never throws. */
export function offlineAnswer(question, glossary = {}) {
  const q = norm(question);
  // FAQ phrases win over single glossary words, so "give study tips" does not become a glossary lookup.
  const faq = FAQS.find((f) => f.keywords.some((k) => hasPhrase(q, norm(k))));
  const key = findTerm(question, glossary);
  if (key && !(faq && FAQS.some((f) => f.keywords.some((k) => norm(k) === q)))) return describeTerm(key, glossary);
  if (faq) return faq.answer;
  const sample = Object.keys(glossary).slice(0, 5).map((k) => k.replace(/[_-]+/g, ' ')).join(', ');
  return `I am offline, so I can only answer from saved FAQs and the glossary. Try a term${sample ? ` such as ${sample}` : ''}, or ask for study tips, quiz help, or the Networking Basics modules.`;
}
