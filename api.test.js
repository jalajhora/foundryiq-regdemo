// Handler-level tests with the Anthropic API stubbed out, so they run
// without a key or network access.
import assert from 'node:assert/strict';
import test from 'node:test';
import formulate from './api/formulate.js';
import assess from './api/assess.js';

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

async function withStubbedFetch(fn) {
  const calls = [];
  const original = globalThis.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' }), { status: 200 });
  };
  try { await fn(calls); } finally {
    globalThis.fetch = original;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
  }
}

const brief = { type: 'text', name: 'Brief', text: 'Brightening serum, fragrance-free' };

test('formulate rejects unknown strategies and product types', async () => {
  await withStubbedFetch(async (calls) => {
    let res = mockRes();
    await formulate({ method: 'POST', body: { strategy: 'cheapest', productType: 'Skincare', files: [brief] } }, res);
    assert.equal(res.statusCode, 400);
    res = mockRes();
    await formulate({ method: 'POST', body: { strategy: 'clean', productType: 'Haircare', files: [brief] } }, res);
    assert.equal(res.statusCode, 400);
    res = mockRes();
    await formulate({ method: 'POST', body: { strategy: 'clean', productType: 'Skincare', files: [] } }, res);
    assert.equal(res.statusCode, 400, 'an empty brief is rejected');
    assert.equal(calls.length, 0);
  });
});

test('formulate sends the brief, strategy and markets to the model', async () => {
  await withStubbedFetch(async (calls) => {
    const res = mockRes();
    await formulate({ method: 'POST', body: { strategy: 'robust', productType: 'Fragrance', markets: ['EU', 'China'], files: [brief] } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    const { system, messages, max_tokens } = calls[0].body;
    assert.match(system, /compliant by design/);
    assert.match(system, /IFRA Category 4/);
    const text = messages[0].content.map((b) => b.text || '').join('\n');
    assert.match(text, /Product type: Fragrance/);
    assert.match(text, /Target markets: EU, China/);
    assert.match(text, /globally registrable/);
    assert.match(text, /Brightening serum/);
    assert.ok(max_tokens >= 3000);
  });
});

test('formulate revise mode sends findings and the current formula, not the brief', async () => {
  await withStubbedFetch(async (calls) => {
    const res = mockRes();
    await formulate({ method: 'POST', body: {
      strategy: 'performance', productType: 'Skincare', markets: ['EU'],
      revise: { formula: { ingredients: [{ name: 'Retinol', concentration: 1 }] }, findings: [{ sev: 'high', ing: 'Retinol', title: 'Over EU limit' }] },
    } }, res);
    assert.equal(res.statusCode, 200);
    const text = calls[0].body.messages[0].content[0].text;
    assert.match(text, /REVISE MODE/);
    assert.match(text, /Over EU limit/);
    assert.match(text, /Retinol/);
  });
});

test('assess flags design-stage formulas so missing supplier paperwork is not a finding', async () => {
  await withStubbedFetch(async (calls) => {
    let res = mockRes();
    await assess({ method: 'POST', body: { stage: 'design', markets: ['EU'], files: [brief] } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(calls[0].body.messages[0].content[0].text, /^DESIGN STAGE/);
    assert.match(calls[0].body.system, /colour cosmetics/);
    res = mockRes();
    await assess({ method: 'POST', body: { markets: ['EU'], files: [brief] } }, res);
    assert.doesNotMatch(calls[1].body.messages[0].content[0].text, /DESIGN STAGE/);
  });
});
