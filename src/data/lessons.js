// Each lesson has the same learning objectives at every level.
// Only the depth, examples, and exercises change with the learner level.
export const LESSONS = [
  {
    id: 'basics',
    title: 'Introduction to Digital Technology',
    focus: 0,
    summary: 'Devices, apps, and the information they handle.',
    objectives: [
      'Name common digital devices.',
      'Tell hardware and software apart.',
      'Explain what data is and where it is kept.',
    ],
    terms: ['hardware', 'software', 'application', 'data'],
    levels: {
      foundational: {
        body: [
          'A digital device is a tool that works with information. Phones, computers, and tablets are digital devices.',
          'Every device has two kinds of parts. Hardware is the part you can touch, such as the screen. Software is the set of instructions that runs inside, such as an app.',
          'Data is the information a device keeps, such as photos, messages, and contacts.',
        ],
        steps: [
          { t: 'Device', d: 'A phone, tablet, or computer.' },
          { t: 'Hardware', d: 'The parts you can touch: screen, battery, camera.' },
          { t: 'Software', d: 'Apps and instructions that make the hardware work.' },
          { t: 'Data', d: 'Photos, messages, and files that the device saves.' },
        ],
        example:
          'You take a photo. The camera and screen are hardware. The camera app is software. The saved picture is data.',
        practice:
          'Look at your phone. Write down two things you can touch (hardware), two apps you use (software), and two things it saves for you (data).',
      },
      standard: {
        body: [
          'Digital technology uses electronic devices to create, store, process, and share information. A device works when hardware, software, and data cooperate.',
          'Hardware is the physical equipment. Software is the program code that tells the hardware what to do. An application is software built for a specific task, such as messaging or writing.',
          'Data is the information software reads and writes. It can be stored on the device or in a remote service reached over the internet.',
        ],
        steps: [
          { t: 'Input', d: 'You tap, type, or speak to the device.' },
          { t: 'Software', d: 'An application interprets the request.' },
          { t: 'Hardware', d: 'Processor and memory carry out the work.' },
          { t: 'Data', d: 'Results are stored or shown on the screen.' },
        ],
        example:
          'When you send a voice note, the microphone (hardware) records sound, a messaging application (software) packages it, and the audio file (data) is stored and sent.',
        practice:
          'Pick a task you do on your phone. Describe which hardware, which application, and which data are involved.',
      },
      advanced: {
        body: [
          'Every digital system combines hardware, software, and data, and a fault in one layer can look like a fault in another. Understanding the layers helps you diagnose problems and judge tools.',
          'Applications run on an operating system that manages hardware resources. Data can live locally or in a cloud service, which changes who can access it and whether it works offline.',
        ],
        steps: [
          { t: 'Hardware layer', d: 'Processor, memory, storage, sensors.' },
          { t: 'Operating system', d: 'Shares hardware among applications.' },
          { t: 'Application', d: 'Task-specific software that uses the system.' },
          { t: 'Data location', d: 'Local storage or cloud: affects access and privacy.' },
        ],
        example:
          'A note-taking app that saves only on your phone keeps working offline but is lost if the phone breaks. A cloud-synced one survives a broken phone but needs internet to sync.',
        practice:
          'Choose one app you use. Decide whether its data is stored locally, in the cloud, or both, and list one advantage and one risk of that choice.',
      },
    },
  },
  {
    id: 'safety',
    title: 'Internet and Online Safety',
    focus: 1,
    summary: 'Passwords, privacy, and safe browsing.',
    objectives: [
      'Explain what the internet is.',
      'Describe why strong, unique passwords and a second check protect accounts.',
      'Recognize what personal information should be kept private.',
    ],
    terms: ['internet', 'password', 'authentication', 'two-factor authentication', 'privacy'],
    levels: {
      foundational: {
        body: [
          'The internet connects computers and phones all over the world so they can share information.',
          'A password is a secret that proves an account is yours. Never share it, and use a different password for each account.',
          'Privacy means you decide who can see your personal information, such as your address and phone number.',
        ],
        steps: [
          { t: 'Connect', d: 'Your device joins the internet.' },
          { t: 'Log in', d: 'You use a private password.' },
          { t: 'Protect', d: 'Share personal details only with people you trust.' },
        ],
        example:
          'If you use one password everywhere and one website leaks it, a stranger can open all of your accounts. A different password for each account stops that.',
        practice:
          'Make up a password phrase of four unrelated words. Do not use it anywhere real. Why is a phrase better than your name or birthday?',
      },
      standard: {
        body: [
          'The internet is a global network of networks that exchange data using shared rules. Anything you send can pass through many systems before it arrives.',
          'Strong passwords are long and unique. Unique matters because attackers reuse stolen passwords on other sites. Two-factor authentication adds a second proof, such as a code sent to your phone, so a stolen password alone is not enough.',
          'Privacy settings control which personal details are visible. Share the minimum needed.',
        ],
        steps: [
          { t: 'Create', d: 'Choose a long, unique password.' },
          { t: 'Add a second check', d: 'Turn on two-factor authentication.' },
          { t: 'Review privacy', d: 'Limit who sees your details.' },
          { t: 'Check the address', d: 'Confirm the website before logging in.' },
        ],
        example:
          'A shop account is leaked. Because your email uses a different password and two-factor authentication, the attacker cannot get into your email.',
        practice:
          'List three accounts you use. For each, say whether it has a unique password and whether two-factor authentication is available.',
      },
      advanced: {
        body: [
          'Account security rests on layers: a unique password limits the damage of a breach, two-factor authentication limits the damage of a stolen password, and encryption limits what an eavesdropper can read.',
          'Privacy is also a trade-off. Services collect data in exchange for convenience, so evaluate what a service asks for compared with what it needs.',
        ],
        steps: [
          { t: 'Threat', d: 'Identify what could go wrong: leak, guess, eavesdrop.' },
          { t: 'Control', d: 'Match a control: unique password, second factor, encryption.' },
          { t: 'Trade-off', d: 'Weigh convenience against exposure.' },
        ],
        example:
          'A flashlight app that asks for your contacts and location requests far more data than it needs. That mismatch is a warning sign.',
        practice:
          'Pick an app you use. List the permissions it requests, mark which are needed for its purpose, and decide which you would deny.',
      },
    },
  },
  {
    id: 'phishing',
    title: 'Identifying Phishing and Online Scams',
    focus: 3,
    summary: 'Spot suspicious messages and respond safely.',
    objectives: [
      'Define phishing and scams.',
      'Identify warning signs in a message or link.',
      'Choose a safe response and verify through an official channel.',
    ],
    terms: ['phishing', 'scam', 'link', 'malware'],
    levels: {
      foundational: {
        body: [
          'Phishing is a fake message that pretends to be from someone you trust, such as a bank, so you will give away secrets.',
          'A scam is a trick to get your money or your information.',
          'Warning signs: the message is urgent, asks for a password or code, or has a strange link. If you see them, do not tap the link.',
        ],
        steps: [
          { t: 'Stop', d: 'Do not tap or reply right away.' },
          { t: 'Look', d: 'Is it urgent? Does it ask for secrets?' },
          { t: 'Verify', d: 'Open the real app or call the official number.' },
        ],
        example:
          'A text says: "Your account is blocked. Tap here to log in now." Instead of tapping, you open your bank app yourself and see there is no problem.',
        practice:
          'A message says you won a phone but must pay a small fee. List two warning signs and say what you would do.',
      },
      standard: {
        body: [
          'Phishing uses deceptive messages or websites to steal information. Scams more broadly use false promises, threats, or urgency to take money.',
          'Check the sender, the wording, and the link destination. Urgent tone, requests for passwords or one-time codes, unexpected attachments, and web addresses that only look similar to the real one are common signs.',
          'Verify unexpected requests through an official channel you find yourself, not through the message.',
        ],
        steps: [
          { t: 'Inspect sender', d: 'Does the address match the real organization?' },
          { t: 'Inspect content', d: 'Urgency, threats, or too-good offers?' },
          { t: 'Inspect link', d: 'Does the address match the official site?' },
          { t: 'Verify', d: 'Contact the organization through an official channel.' },
        ],
        example:
          'An email from "support@bank-secure-login.example" asks you to confirm your PIN. The real bank would never ask for a PIN by email, and the domain is not the bank domain.',
        practice:
          'Write three questions you would ask about any unexpected message before acting on it.',
      },
      advanced: {
        body: [
          'Phishing is social engineering: it exploits trust, urgency, and fear rather than technical flaws. Attackers study targets and tailor messages, so familiar details do not prove authenticity.',
          'Evaluate each signal independently: sender identity, link destination, requested action, and channel. When signals conflict, treat the message as untrusted and verify out of band.',
          'If you act on a scam, change the affected password, enable two-factor authentication, and report the message.',
        ],
        steps: [
          { t: 'Assess signals', d: 'Sender, link, action, channel.' },
          { t: 'Resolve conflicts', d: 'Any mismatch means treat as untrusted.' },
          { t: 'Verify out of band', d: 'Use a separate, trusted channel.' },
          { t: 'Respond', d: 'Report, and secure the account if you acted.' },
        ],
        example:
          'A message quotes your real name and your school but asks you to log in through a shortened link. Knowing personal details does not prove it is genuine: the shortened link hides the destination.',
        practice:
          'Describe how you would respond if you entered your password on a fake page. List your first three actions in order.',
      },
    },
  },
  {
    id: 'communication',
    title: 'Digital Communication',
    focus: 2,
    summary: 'Email, attachments, and respectful messages.',
    objectives: [
      'Write a clear email with a subject line.',
      'Attach and check files before sending.',
      'Choose a suitable channel and tone.',
    ],
    terms: ['email', 'attachment', 'browser', 'encryption'],
    levels: {
      foundational: {
        body: [
          'Email is like a letter that travels over the internet. You write who it is for, what it is about, and your message.',
          'The subject line says what the email is about. An attachment is a file sent with the email.',
          'Before you press send, check the address of the person, your message, and the attachment.',
        ],
        steps: [
          { t: 'To', d: 'Type the correct address.' },
          { t: 'Subject', d: 'Say what the email is about.' },
          { t: 'Message', d: 'Be clear and polite.' },
          { t: 'Attach and send', d: 'Add the file, check it, then send.' },
        ],
        example:
          'To send homework: write the teacher address, use the subject "Homework: Unit 2", write "Hello, my homework is attached. Thank you.", attach the file, and send.',
        practice:
          'Write a short email to a teacher that asks for an extra day. Include a subject line and a greeting.',
      },
      standard: {
        body: [
          'Email supports messages and files between people. A good email has a specific subject, a short greeting, a clear request, and a polite closing.',
          'Check recipients before sending, and open attachments only from senders you expect. Large files may need compression or a sharing link.',
          'Pick the channel that suits the message: a quick chat for a simple question, email for formal or lasting records.',
        ],
        steps: [
          { t: 'Choose channel', d: 'Chat for quick; email for formal.' },
          { t: 'Draft', d: 'Subject, greeting, request, closing.' },
          { t: 'Check', d: 'Recipient, tone, attachment.' },
          { t: 'Send and confirm', d: 'Confirm that it arrived if it matters.' },
        ],
        example:
          'Sending an application: use the subject "Application: Digital Skills Course", state your request in two sentences, attach your document as a PDF, and confirm the recipient.',
        practice:
          'Draft an email to apply for a course. Include a subject, a two-sentence request, and name the attachment.',
      },
      advanced: {
        body: [
          'Choosing a channel is a decision about audience, sensitivity, and record keeping. Sensitive information such as identity numbers should not travel by ordinary email; use a service with encryption or deliver it in person.',
          'Tone adds meaning that text lacks, so be concise and unambiguous. Reply-all and forwarded threads can expose information to people who should not see it.',
        ],
        steps: [
          { t: 'Audience', d: 'Who needs to read this?' },
          { t: 'Sensitivity', d: 'Is any information private?' },
          { t: 'Channel', d: 'Match the channel and protections.' },
          { t: 'Review', d: 'Check recipients and thread history.' },
        ],
        example:
          'Forwarding a long thread to a new contact may reveal earlier private messages. Copy only the part that is needed.',
        practice:
          'You must send a document containing your identity number to an office. Compare two ways to send it and choose the safer one.',
      },
    },
  },
  {
    id: 'problems',
    title: 'Basic Digital Problem-Solving',
    focus: 2,
    summary: 'Troubleshooting everyday technology.',
    objectives: [
      'Describe a step-by-step troubleshooting method.',
      'Test one change at a time.',
      'Know when to update, restart, or ask for help.',
    ],
    terms: ['troubleshooting', 'network', 'update', 'browser'],
    levels: {
      foundational: {
        body: [
          'Troubleshooting means finding out why something is not working and fixing it.',
          'Start with the easy steps: check that the device is on, charged, and connected. Try one fix at a time and see if it helped.',
          'If nothing works, ask someone you trust or contact support.',
        ],
        steps: [
          { t: 'Notice', d: 'What exactly is wrong?' },
          { t: 'Check basics', d: 'Power, battery, Wi-Fi.' },
          { t: 'Try one fix', d: 'For example, restart.' },
          { t: 'Check result', d: 'Did it work? If not, try the next one.' },
        ],
        example:
          'A web page will not open. First check that Wi-Fi is on, then try another website, then restart the browser.',
        practice:
          'Your phone will not connect to Wi-Fi. List three easy steps you would try, in order.',
      },
      standard: {
        body: [
          'Troubleshooting is a method: describe the problem, list likely causes, test the simplest cause first, and check whether the fix worked.',
          'Change one thing at a time. If you change several at once, you cannot tell which one solved the problem.',
          'Keeping software updated fixes many errors and security gaps. Write down what you tried so you can explain it if you need help.',
        ],
        steps: [
          { t: 'Describe', d: 'What happens and when?' },
          { t: 'List causes', d: 'Connection, app, device, or account.' },
          { t: 'Test one cause', d: 'Simplest and reversible first.' },
          { t: 'Verify', d: 'Confirm it works, and note what fixed it.' },
        ],
        example:
          'A page fails on your phone. Other sites work, so the network is fine. You clear the browser data for that site and reload: it works. The cause was the stored site data.',
        practice:
          'An app keeps closing. List three possible causes and the order you would test them, with a reason.',
      },
      advanced: {
        body: [
          'Systematic diagnosis treats a problem as a set of hypotheses. Observe the symptom, isolate variables by changing one at a time, and record each result.',
          'Narrow the problem by comparison: does it fail on another network, another device, or another account? The comparison that changes the outcome points to the cause.',
        ],
        steps: [
          { t: 'Observe', d: 'Record exact symptoms and error messages.' },
          { t: 'Hypothesize', d: 'Rank likely causes.' },
          { t: 'Isolate', d: 'Change one variable; compare devices or networks.' },
          { t: 'Document', d: 'Record what worked so you can repeat it.' },
        ],
        example:
          'A video call fails on home Wi-Fi but works on mobile data. The device and app are fine; the fault is in the home network, so test the router.',
        practice:
          'A shared document will not save. Design three tests that separate a network problem, an account problem, and an app problem.',
      },
    },
  },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id) || null;
