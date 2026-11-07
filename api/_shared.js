// Helpers shared by the serverless handlers. The leading underscore keeps
// Vercel from exposing this file as its own /api route.

export const MODEL = process.env.FORMULYX_MODEL || 'claude-haiku-4-5';

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

// Handles the CORS preflight and method check. Returns true when the
// request has already been answered.
export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return true;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }
  return false;
}

export function missingKeyError(res) {
  return res.status(500).json({ error: 'API key not configured. Set ANTHROPIC_API_KEY in your hosting runtime environment and redeploy.' });
}

// Turns the client's uploaded-file payload (PDFs and images as base64,
// Word/Excel/CSV pre-extracted to text) into Anthropic content blocks.
export function filesToContent(files, maxTextChars = 24000) {
  const blocks = [];
  if (!Array.isArray(files)) return blocks;
  for (const f of files) {
    if (f.type === 'pdf' && f.data) {
      blocks.push({ type: 'text', text: `\n--- Document: ${f.name} (PDF) ---` });
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
    } else if (f.type === 'image' && f.data) {
      blocks.push({ type: 'text', text: `\n--- Document: ${f.name} (image) ---` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: f.mediaType || 'image/jpeg', data: f.data } });
    } else if (f.type === 'text' && f.text) {
      blocks.push({ type: 'text', text: `\n--- Document: ${f.name} ---\n${String(f.text).slice(0, maxTextChars)}` });
    }
  }
  return blocks;
}

// Calls the Messages API and relays the raw response to the client, which
// owns JSON parsing and repair.
export async function relayClaude(res, { apiKey, system, content, maxTokens }) {
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
    });
    cors(res);
    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(upstream.status).json({ error: 'Upstream API error', detail: err });
    }
    return res.status(200).json(await upstream.json());
  } catch (err) {
    cors(res);
    return res.status(500).json({ error: 'Proxy error', detail: err.message });
  }
}
