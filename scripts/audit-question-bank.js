import { readFileSync, writeFileSync } from 'node:fs';

process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'deterministic';

const { resolveRetrievalAnswer } = await import('../server/retrievalEngine.js');

const questionBankPath = 'ASK_AI_QUESTION_BANK.md';
const auditPath = 'ASK_AI_QUESTION_BANK_AUDIT.json';

const questions = readFileSync(questionBankPath, 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.startsWith('- '))
  .map((line) => line.slice(2).trim())
  .filter(Boolean);

const weakPatterns = [
  /\bno .* records matched\b/i,
  /\bcould not\b/i,
  /\bnot found\b/i,
  /\bno data found\b/i,
  /\bno metric rows matched\b/i,
  /\bno rows matched\b/i,
  /\bmissing from the history table\b/i
];

function isWeakAnswer(answer) {
  const text = String(answer ?? '').trim();
  if (!text) return true;
  return weakPatterns.some((pattern) => pattern.test(text));
}

const results = [];
for (const [index, question] of questions.entries()) {
  const started = Date.now();
  let result = null;
  let error = null;
  try {
    result = await resolveRetrievalAnswer({ query: question, shiftName: 'Shift A' });
  } catch (caught) {
    error = caught?.message ?? String(caught);
  }

  const answer = result?.answer ?? '';
  const status = error || !result ? 'unanswered' : isWeakAnswer(answer) ? 'weak' : 'answered';
  results.push({
    index: index + 1,
    question,
    status,
    source: result?.source ?? null,
    queryType: result?.queryType ?? null,
    answerPreview: String(answer).slice(0, 260),
    latencyMs: Date.now() - started,
    error
  });

  if ((index + 1) % 50 === 0) {
    console.log(`audited ${index + 1}/${questions.length}`);
  }
}

const summary = results.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] ?? 0) + 1;
  const key = `${item.source ?? 'none'}:${item.queryType ?? 'none'}`;
  acc.byPath[key] = (acc.byPath[key] ?? 0) + 1;
  return acc;
}, { total: results.length, answered: 0, weak: 0, unanswered: 0, byPath: {} });

writeFileSync(auditPath, JSON.stringify({ summary, results }, null, 2));

console.log(JSON.stringify(summary, null, 2));
console.log('Weak/unanswered examples:');
for (const item of results.filter((entry) => entry.status !== 'answered').slice(0, 80)) {
  console.log(`${item.index}. [${item.status}] ${item.question} -> ${item.answerPreview || item.error || 'no result'}`);
}
