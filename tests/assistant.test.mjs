import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineAnswer, findTerm } from '../src/lib/offlineAnswer.js';

const GLOSSARY = {
  lan: ['Local Area Network definition.', 'A small network.', 'Home Wi-Fi.'],
  router: ['Forwards data between networks.', 'A traffic director.', 'The box from your internet provider.'],
  ip_address: ['A number that identifies a device.', 'A home address for a device.', '192.168.1.5'],
};

test('explains a glossary term with simple words and an example', () => {
  const a = offlineAnswer('What is a router?', GLOSSARY);
  assert.match(a, /Forwards data/);
  assert.match(a, /In simple words/);
  assert.match(a, /Example/);
});

test('matches multi word terms written with spaces', () => {
  assert.equal(findTerm('explain an IP address please', GLOSSARY), 'ip_address');
});

test('does not match a term inside another word', () => {
  assert.equal(findTerm('the island is lovely', GLOSSARY), null);
});

test('quick prompts get FAQ answers, not glossary lookups', () => {
  assert.match(offlineAnswer('Give study tips', GLOSSARY), /Study tips/);
  assert.match(offlineAnswer('Help with a quiz', GLOSSARY), /Quiz tips/);
  assert.match(offlineAnswer('Tell me about Networking Basics', GLOSSARY), /four short modules/);
  assert.match(offlineAnswer('Explain a topic', GLOSSARY), /glossary term/);
});

test('unknown question returns a helpful fallback and never throws', () => {
  const a = offlineAnswer('what is the weather', GLOSSARY);
  assert.match(a, /offline/i);
  assert.doesNotThrow(() => offlineAnswer('', {}));
  assert.doesNotThrow(() => offlineAnswer(undefined, GLOSSARY));
});
