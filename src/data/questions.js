import { LESSONS } from './lessons.js';

// Diagnostic bank: 4 questions per competency.
// Row: [id, competency, difficulty (1 easy - 3 hard), text, options, correctIndex, explanation, lessonId]
const DIAGNOSTIC_ROWS = [
  // Competency 0: Foundational Knowledge
  ['d01', 0, 1, 'Which of these is hardware?', ['A web browser', 'A phone screen', 'A password', 'A photo editing app'], 1, 'Hardware is the physical part of a device, such as a screen.', 'basics'],
  ['d02', 0, 1, 'Which of these is software?', ['A keyboard', 'A battery', 'A messaging app', 'A charging cable'], 2, 'An app is a program, and programs are software.', 'basics'],
  ['d03', 0, 2, 'What is a browser used for?', ['Opening and viewing web pages', 'Charging a phone', 'Storing a password offline', 'Printing documents'], 0, 'A browser retrieves and displays web pages.', 'basics'],
  ['d04', 0, 2, 'What is an email attachment?', ['A type of Wi-Fi router', 'A file sent along with a message', 'A secret password', 'A search engine'], 1, 'An attachment is a file included with an electronic message.', 'communication'],
  // Competency 1: Conceptual Understanding
  ['d05', 1, 1, 'Why should each account have its own unique password?', ['It makes the internet faster', 'It limits the damage if one password leaks', 'It increases storage', 'It removes advertisements'], 1, 'If a password leaks, a unique password protects your other accounts.', 'safety'],
  ['d06', 1, 2, 'Why is two-factor authentication useful?', ['It adds a second proof of identity beyond the password', 'It deletes viruses', 'It makes your account public', 'It replaces the internet connection'], 0, 'A second factor protects the account even if the password is stolen.', 'safety'],
  ['d07', 1, 2, 'Why should you test only one troubleshooting change at a time?', ['To make the device slower', 'To hide the error message', 'To learn which change fixed the problem', 'To save battery'], 2, 'Changing one thing at a time shows what caused the result.', 'problems'],
  ['d08', 1, 3, 'Why can data stored in a cloud service be reached from a new phone?', ['It is stored on a remote server, not only on the old phone', 'The old phone copies itself', 'All phones share the same storage', 'Passwords are not needed'], 0, 'Cloud data lives on remote servers that you can reach after you log in.', 'basics'],
  // Competency 2: Practical Application
  ['d09', 2, 1, 'You need to email an assignment to your teacher. What should you do?', ['Send a blank message', 'Attach the file and check the recipient address', 'Share your password', 'Leave the subject line out'], 1, 'Add a clear message, attach the file, and check the recipient.', 'communication'],
  ['d10', 2, 1, 'A web page will not load. What is a sensible first step?', ['Delete all your files', 'Check your internet connection', 'Buy a new device', 'Share your login details'], 1, 'Check the simple, reversible things first.', 'problems'],
  ['d11', 2, 2, 'Your teacher asks for a PDF named "Unit2". What do you send?', ['A different image', 'The Unit2 PDF as an attachment', 'Your login code', 'An empty email'], 1, 'Send exactly the requested document as an attachment.', 'communication'],
  ['d12', 2, 3, 'An app stops working after you changed three settings at once. What is the best next step?', ['Change three more settings', 'Undo the changes and re-apply them one at a time', 'Delete the app and give up', 'Ask a stranger for your password'], 1, 'Re-apply changes one at a time to find the cause.', 'problems'],
  // Competency 3: Critical Thinking and Problem-Solving
  ['d13', 3, 1, 'A message says your bank account is blocked and asks for your password now. What should you do?', ['Reply with the password', 'Tap the link quickly', 'Check using the official bank app or phone number', 'Forward the message to friends'], 2, 'Verify through an official channel you find yourself.', 'phishing'],
  ['d14', 3, 2, 'A website looks official but its address is slightly different from the real one. What is safest?', ['Enter your details quickly', 'Leave and open the official site by typing the address yourself', 'Download its file', 'Ignore the browser warning'], 1, 'A lookalike address is a common sign of impersonation.', 'phishing'],
  ['d15', 3, 2, 'A stranger offers a prize if you read out the login code sent to your phone. What should you do?', ['Read out the code', 'Refuse and report the message', 'Send your bank details', 'Open every link they send'], 1, 'Login codes must never be shared with anyone.', 'phishing'],
  ['d16', 3, 3, 'Two online posts give opposite safety advice. Which approach is best?', ['Trust whichever is more popular', 'Compare with official or well-established guidance', 'Share both without checking', 'Pick one at random'], 1, 'Check claims against reliable sources before acting on them.', 'safety'],
];

// Lesson quiz bank: 6 questions per lesson (two per difficulty).
// Row: [difficulty, text, options, correctIndex, explanation]
const LESSON_ROWS = {
  basics: [
    [1, 'A camera on a phone is an example of which?', ['Software', 'Hardware', 'Data', 'A password'], 1, 'The camera is a physical component.'],
    [1, 'A saved photo is an example of which?', ['Data', 'Hardware', 'A network', 'A screen'], 0, 'A photo is information stored on the device.'],
    [2, 'Which pair correctly matches hardware and software?', ['Screen and battery', 'Keyboard and messaging app', 'Browser and calculator app', 'Photo and video'], 1, 'A keyboard is hardware and a messaging app is software.'],
    [2, 'An application is best described as:', ['A physical part of a device', 'Software built for a specific task', 'A kind of cable', 'A secret code'], 1, 'Applications are task-specific software.'],
    [3, 'A notes app saves only on your phone. What is a main risk?', ['Notes are lost if the phone is lost or broken', 'The app becomes hardware', 'Notes cannot be typed', 'The screen turns off'], 0, 'Local-only data has no backup copy elsewhere.'],
    [3, 'Why can a cloud-synced app work on a new phone after login?', ['The data is stored on a remote server', 'The new phone is the same hardware', 'Software cannot move', 'Passwords are copied by Wi-Fi'], 0, 'Cloud data is kept on a server and linked to your account.'],
  ],
  safety: [
    [1, 'Which is the safest thing to do with your password?', ['Share it with a friend', 'Keep it private', 'Write it in a public chat', 'Use your name'], 1, 'A password is a secret and should stay private.'],
    [1, 'What does the internet do?', ['Connects devices around the world', 'Charges phones', 'Makes screens brighter', 'Stores only photos'], 0, 'The internet connects networks and devices.'],
    [2, 'Why is a long password with four unrelated words a good choice?', ['It is hard to guess', 'It is the same everywhere', 'It is short', 'It works without internet'], 0, 'Length and unpredictability make guessing harder.'],
    [2, 'What does two-factor authentication add?', ['A second proof of identity', 'Faster internet', 'More storage', 'A new keyboard'], 0, 'It requires something beyond the password.'],
    [3, 'A shop leaks your password, which you reused on email. What is the most likely result?', ['Nothing happens', 'An attacker may try it on your email account', 'Your phone updates', 'Your Wi-Fi slows'], 1, 'Attackers reuse leaked passwords on other sites.'],
    [3, 'A flashlight app asks for contacts and location. What does this suggest?', ['It needs them to shine light', 'It requests more data than its purpose needs', 'It is safer', 'It is a browser'], 1, 'Permissions should match the purpose of the app.'],
  ],
  phishing: [
    [1, 'A message says "Act now or lose your account!" What should you do?', ['Tap the link', 'Stop and verify it another way', 'Reply with your password', 'Forward it'], 1, 'Urgency is a warning sign. Verify separately.'],
    [1, 'What is phishing?', ['A fake message trying to steal your information', 'A way to charge a phone', 'A kind of keyboard', 'A video format'], 0, 'Phishing impersonates a trusted sender to steal information.'],
    [2, 'Which is the best way to check a message that claims to be from your bank?', ['Tap the link in the message', 'Open the bank app yourself or call the official number', 'Reply asking if it is real', 'Wait a week'], 1, 'Use an official channel you find yourself.'],
    [2, 'Which is a common warning sign in a link?', ['An address that only resembles the real one', 'A padlock on every page', 'A short message', 'A blue button'], 0, 'Lookalike addresses imitate real sites.'],
    [3, 'A message uses your real name and school but asks you to log in via a shortened link. What is the best conclusion?', ['It must be genuine because it knows you', 'Personal details do not prove it is genuine, so verify out of band', 'Ignore the link but share your code', 'Reply with a photo of your ID'], 1, 'Attackers can gather personal details.'],
    [3, 'You typed your password on a fake page. What should you do first?', ['Nothing', 'Change that password, enable two-factor authentication, and report it', 'Delete the browser', 'Wait for a reply'], 1, 'Secure the account and report the attempt.'],
  ],
  communication: [
    [1, 'What should an email subject line do?', ['Say what the email is about', 'Be left blank', 'Contain your password', 'Be very long'], 0, 'A subject summarizes the message topic.'],
    [1, 'Before sending an email with a file, you should:', ['Check the recipient and attachment', 'Delete the message', 'Add your password', 'Turn off Wi-Fi'], 0, 'Check the address and the file first.'],
    [2, 'Which channel suits a quick question to a classmate?', ['A formal printed letter', 'A short chat message', 'An email with a long signature', 'A phone update'], 1, 'Chat suits quick informal questions.'],
    [2, 'You receive an unexpected attachment from an unknown sender. What is best?', ['Open it immediately', 'Do not open it and check with the sender another way', 'Forward it to everyone', 'Reply with your password'], 1, 'Unexpected attachments can contain malware.'],
    [3, 'You must send your identity number to an office. What is the safest choice?', ['Ordinary email to many people', 'A protected or in-person method the office approves', 'A public post', 'A chat group'], 1, 'Sensitive data needs a protected channel.'],
    [3, 'Why can forwarding a long email thread be risky?', ['It may reveal earlier private messages', 'It deletes the attachments', 'It slows the internet', 'It changes the subject'], 0, 'Threads often include earlier content others should not see.'],
  ],
  problems: [
    [1, 'Your phone cannot open websites. What is an easy first check?', ['Whether Wi-Fi or mobile data is on', 'Delete all apps', 'Share your password', 'Buy a new phone'], 0, 'Check the simple basics first.'],
    [1, 'What does troubleshooting mean?', ['Finding why something fails and fixing it', 'Buying new devices', 'Deleting messages', 'Choosing a password'], 0, 'It is the process of diagnosing and fixing problems.'],
    [2, 'Why should you try one fix at a time?', ['To know which fix worked', 'To waste time', 'To hide errors', 'To use more data'], 0, 'One change at a time reveals the cause.'],
    [2, 'Why are software updates useful?', ['They often fix errors and security gaps', 'They remove the screen', 'They make passwords public', 'They always delete data'], 0, 'Updates patch faults and vulnerabilities.'],
    [3, 'A video call fails on home Wi-Fi but works on mobile data. What does this suggest?', ['The problem is likely in the home network', 'The app has been deleted', 'The phone has no screen', 'Mobile data is broken'], 0, 'The change that fixed the symptom points to the home network.'],
    [3, 'A document will not save. Which test best separates an account problem from a network problem?', ['Try saving on a different network and also sign in on another device', 'Reinstall everything immediately', 'Change five settings at once', 'Ignore the error'], 0, 'Comparing across networks and devices isolates variables.'],
  ],
};

const toQuestion = ([id, competency, difficulty, text, options, correct, explanation, lesson]) => ({
  id,
  kind: 'diagnostic',
  competency,
  difficulty,
  text,
  options,
  correct,
  explanation,
  lesson,
});

export const DIAGNOSTIC_QUESTIONS = DIAGNOSTIC_ROWS.map(toQuestion);

export const LESSON_QUESTIONS = LESSONS.flatMap((lesson) =>
  (LESSON_ROWS[lesson.id] || []).map(([difficulty, text, options, correct, explanation], i) => ({
    id: `${lesson.id}-${i + 1}`,
    kind: 'lesson',
    competency: lesson.focus,
    difficulty,
    text,
    options,
    correct,
    explanation,
    lesson: lesson.id,
  })),
);

export const ALL_QUESTIONS = [...DIAGNOSTIC_QUESTIONS, ...LESSON_QUESTIONS];

export const questionById = (id) => ALL_QUESTIONS.find((q) => q.id === id) || null;
