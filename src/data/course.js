export const COURSE = {
  id: 'digital-literacy',
  title: 'Digital Literacy Fundamentals',
  description:
    'Five short lessons on using digital technology safely and confidently. All content is bundled with the app and works offline.',
};

export const COMPETENCIES = [
  {
    id: 0,
    name: 'Foundational Knowledge',
    short: 'Knowledge',
    blurb: 'Recall key terms and facts about digital technology.',
  },
  {
    id: 1,
    name: 'Conceptual Understanding',
    short: 'Concepts',
    blurb: 'Explain why digital tools and safety practices work.',
  },
  {
    id: 2,
    name: 'Practical Application',
    short: 'Application',
    blurb: 'Use what you know to complete everyday digital tasks.',
  },
  {
    id: 3,
    name: 'Critical Thinking and Problem-Solving',
    short: 'Critical thinking',
    blurb: 'Judge information, spot risks, and choose a sound response.',
  },
];

export const LEVELS = ['foundational', 'standard', 'advanced'];

export const LEVEL_LABELS = {
  foundational: 'Foundational',
  standard: 'Standard',
  advanced: 'Advanced',
};

export const LEVEL_DESCRIPTIONS = {
  foundational: 'Simplified explanations, more examples, and easier exercises.',
  standard: 'Standard explanations, guided exercises, and intermediate questions.',
  advanced: 'Advanced examples, challenging questions, and concise review.',
};

export const DIFFICULTY_LABELS = ['', 'Easy', 'Medium', 'Hard'];

export const LEARNING_MODES = [
  {
    id: 'Visual',
    desc: 'Step-by-step diagrams and a concept map of each lesson.',
    status: 'available',
  },
  {
    id: 'Read/Write',
    desc: 'Structured reading, key points, and your own saved notes.',
    status: 'available',
  },
  {
    id: 'Auditory',
    desc: 'Your device reads the lesson aloud, with a transcript you can follow.',
    status: 'available',
  },
  {
    id: 'Kinesthetic',
    desc: 'A hands-on activity for each lesson: sort, order, spot and practise.',
    status: 'available',
  },
];

export const DEFAULT_MODE = 'Read/Write';
