// Hands-on activities for Kinesthetic mode, one per lesson. They are practice only:
// they never change competency scores (a mode changes presentation, not measurement).
//
// Types:
//   sort     tap an item, then tap the group it belongs to
//   order    put steps in the right order with the move buttons
//   spot     tap every suspicious part of a message
//   password type a practice password and see which rules it meets (never stored or sent)

export const ACTIVITIES = {
  basics: {
    type: 'sort',
    title: 'Sort it out',
    prompt: 'Is each item hardware, software, or data? Tap an item, then tap its group.',
    groups: ['Hardware', 'Software', 'Data'],
    items: [
      { id: 'a', label: 'Phone screen', group: 'Hardware' },
      { id: 'b', label: 'Web browser', group: 'Software' },
      { id: 'c', label: 'Saved photo', group: 'Data' },
      { id: 'd', label: 'Battery', group: 'Hardware' },
      { id: 'e', label: 'Messaging app', group: 'Software' },
      { id: 'f', label: 'Contact list', group: 'Data' },
      { id: 'g', label: 'Camera', group: 'Hardware' },
      { id: 'h', label: 'Calculator app', group: 'Software' },
      { id: 'i', label: 'Text message', group: 'Data' },
    ],
  },
  safety: {
    type: 'password',
    title: 'Build a strong password',
    prompt:
      'Type a practice password and watch the checklist. It stays in this box: it is not saved or sent anywhere. Never test a real password.',
  },
  phishing: {
    type: 'spot',
    title: 'Spot the red flags',
    prompt: 'Tap every part of this message that looks suspicious, then press Check.',
    segments: [
      { id: 's1', text: 'From: support@bank-secure-login.example', flag: true, why: 'The sender address is not the real bank domain.' },
      { id: 's2', text: 'Dear customer,', flag: true, why: 'A generic greeting. A real bank uses your name.' },
      { id: 's3', text: 'URGENT: your account will be closed in 1 hour!', flag: true, why: 'Urgency and threats are used to stop you thinking.' },
      { id: 's4', text: 'Click here to verify: http://bank-login-verify.example/secure', flag: true, why: 'The link goes to a lookalike site, not the official one.' },
      { id: 's5', text: 'Reply with your PIN and password to keep access.', flag: true, why: 'A real bank never asks for your PIN or password.' },
      { id: 's6', text: 'Thank you for banking with us.', flag: false, why: 'A polite closing is not a warning sign on its own.' },
    ],
  },
  communication: {
    type: 'order',
    title: 'Send an email in the right order',
    prompt: 'Use the arrows to put these steps in the correct order, then press Check.',
    steps: [
      'Press Send',
      'Write a clear subject line',
      'Open a new message',
      'Attach the file',
      'Type the recipient address',
      'Write a short, polite message',
      'Check the recipient and the attachment',
    ],
    answer: [
      'Open a new message',
      'Type the recipient address',
      'Write a clear subject line',
      'Write a short, polite message',
      'Attach the file',
      'Check the recipient and the attachment',
      'Press Send',
    ],
  },
  problems: {
    type: 'order',
    title: 'Fix it step by step',
    prompt: 'A web page will not load. Put the troubleshooting steps in the best order, then press Check.',
    steps: [
      'Check whether it worked',
      'Try one simple fix, such as reloading or restarting',
      'If it still fails, try the next fix or ask for help',
      'Check the basics: power, Wi-Fi or mobile data',
      'Notice and describe exactly what is wrong',
    ],
    answer: [
      'Notice and describe exactly what is wrong',
      'Check the basics: power, Wi-Fi or mobile data',
      'Try one simple fix, such as reloading or restarting',
      'Check whether it worked',
      'If it still fails, try the next fix or ask for help',
    ],
  },
};

/** Rules shown by the password activity. Pure function so it can be tested. */
export function passwordChecks(password) {
  const words = password.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 3);
  const common = /^(password|123456|qwerty|letmein|welcome|iloveyou|admin|abc123)/i;
  return [
    { id: 'len', label: 'At least 12 characters', ok: password.length >= 12 },
    { id: 'mix', label: 'Mixes letters with numbers or symbols, or is a phrase of 4 or more words', ok: (/[a-z]/i.test(password) && /[0-9]/.test(password) && /[^a-z0-9]/i.test(password)) || words.length >= 4 },
    { id: 'common', label: 'Does not start with a very common password', ok: password.length > 0 && !common.test(password) },
    { id: 'repeat', label: 'Not just repeated characters', ok: password.length > 0 && !/^(.)\1+$/.test(password) },
  ];
}
