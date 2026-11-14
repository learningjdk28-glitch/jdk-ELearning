import networkingTerms from '../content/networking-basics/glossary.json' with { type: 'json' };

// Each entry: [technical definition, ELI5 explanation, real-world example]
// Networking Basics terms live in src/content/networking-basics/glossary.json and are merged below.
const BASE_GLOSSARY = {
  hardware: [
    'The physical components of a computing device, such as the processor, memory, screen, and keyboard.',
    'The parts of a device that you can touch.',
    'The screen, battery, and camera of a phone.',
  ],
  software: [
    'Programs and instructions that tell hardware what to do.',
    'The apps and instructions that make a device useful.',
    'A calculator app or a web browser.',
  ],
  data: [
    'Information stored in a form a computer can process, such as text, numbers, images, or sound.',
    'Facts and pictures that a device keeps and uses.',
    'A photo, a saved contact, or a school grade.',
  ],
  application: [
    'A software program designed to help a user perform a specific task.',
    'An app: a tool on your device built to do one job.',
    'A messaging app used to chat with a friend.',
  ],
  internet: [
    'A global system of interconnected networks that exchange data using shared communication rules.',
    'A giant web of connected computers that lets you share information with people far away.',
    'Opening a video call with a relative in another country.',
  ],
  network: [
    'A group of connected devices that can exchange data.',
    'Devices that are linked so they can talk to each other.',
    'The Wi-Fi in a home that connects a phone and a laptop.',
  ],
  browser: [
    'Software used to retrieve, display, and navigate web pages.',
    'The app that opens websites for you.',
    'Chrome, Firefox, or Safari.',
  ],
  password: [
    'A secret string of characters used to prove that you are allowed to access an account.',
    'A secret word that proves you are really you.',
    'A long phrase such as "blue-mango-river-42" used for one account only.',
  ],
  authentication: [
    'The process of verifying a user identity before granting access.',
    'Checking that you are who you say you are.',
    'Typing a password and then a code sent to your phone.',
  ],
  privacy: [
    'The ability to control what personal information is collected, shared, and who can see it.',
    'Deciding who gets to know things about you.',
    'Keeping your home address off public profiles.',
  ],
  phishing: [
    'A form of social engineering in which attackers impersonate a trusted party to steal information.',
    'A fake message that pretends to be someone you trust so you will give away secrets.',
    'A text that claims to be your bank and asks for your PIN.',
  ],
  scam: [
    'A deceptive scheme intended to obtain money, goods, or information through false claims.',
    'A trick used to get your money or your private details.',
    'A message saying you won a prize but must pay a fee first.',
  ],
  link: [
    'A clickable reference that opens another web page or file.',
    'Something you tap that takes you to another page.',
    'A web address inside a text message.',
  ],
  malware: [
    'Malicious software designed to damage, disrupt, or gain unauthorized access to a system.',
    'A harmful program that sneaks onto a device.',
    'A fake "free game" file that secretly steals saved passwords.',
  ],
  email: [
    'A system for sending messages and files electronically between mailboxes over a network.',
    'A letter that travels over the internet in seconds.',
    'Sending homework to a teacher.',
  ],
  attachment: [
    'A file sent together with an electronic message.',
    'A file that rides along with your email.',
    'A PDF assignment attached to an email.',
  ],
  troubleshooting: [
    'A systematic process of identifying the cause of a problem and testing fixes.',
    'Finding out why something is not working and fixing it one step at a time.',
    'Restarting a router and then checking whether a page loads.',
  ],
  update: [
    'A new version of software that adds features or fixes errors and security flaws.',
    'A newer, better version of an app.',
    'Installing a phone update that patches a security hole.',
  ],
  'two-factor authentication': [
    'A login method that requires two different proofs of identity, such as a password and a one-time code.',
    'Using two locks instead of one on your account.',
    'Entering your password and then a six-digit code from your phone.',
  ],
  encryption: [
    'Converting data into an unreadable form that only someone with the correct key can reverse.',
    'Scrambling a message so only the right person can unscramble it.',
    'A messaging app that hides your chat from anyone who intercepts it.',
  ],
};

export const GLOSSARY = { ...BASE_GLOSSARY, ...networkingTerms };

export const GLOSSARY_TERMS = Object.keys(GLOSSARY);

// Display groups for the Glossary page. Every term belongs to exactly one group (checked by tests).
export const GLOSSARY_CATEGORIES = [
  { id: 'computing', title: 'Computers and Software', terms: ['hardware', 'software', 'application', 'data', 'browser'] },
  { id: 'network', title: 'Network Basics', terms: ['network', 'lan', 'wan', 'internet', 'isp', 'server'] },
  { id: 'devices', title: 'Devices and Connections', terms: ['router', 'modem', 'switch', 'access point', 'gateway', 'ethernet', 'wi-fi'] },
  { id: 'communication', title: 'Internet Communication', terms: ['ip address', 'dns', 'packet', 'email', 'attachment', 'link'] },
  { id: 'security', title: 'Security and Safety', terms: ['password', 'authentication', 'two-factor authentication', 'encryption', 'https', 'wpa2', 'privacy', 'phishing', 'scam', 'malware'] },
  { id: 'fixing', title: 'Troubleshooting and Updates', terms: ['troubleshooting', 'update'] },
];
