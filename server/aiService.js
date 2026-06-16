export async function streamCompletion({ systemPrompt, userMessage, contextData }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY not configured');
    err.isFallback = true;
    throw err;
  }

  let Anthropic;
  try {
    const mod = await import('@anthropic-ai/sdk');
    Anthropic = mod.default;
  } catch (error) {
    const err = new Error('Anthropic SDK not installed');
    err.isFallback = true;
    throw err;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const fullSystemPrompt = contextData
    ? `${systemPrompt}\n\nCurrent operational data:\n${JSON.stringify(contextData, null, 2)}`
    : systemPrompt;

  return client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: fullSystemPrompt,
    messages: Array.isArray(userMessage)
      ? userMessage
      : [{ role: 'user', content: userMessage }]
  });
}
