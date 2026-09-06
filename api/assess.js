// Node.js serverless function. Accepts an uploaded Product Information File
// (PDFs + images sent as native content blocks; Word/Excel pre-extracted to
// text on the client) and returns a structured compliance assessment plus
// the raw ingredient table used by the registration-document generators.
// Vercel Hobby caps function duration at 10s regardless of maxDuration, so
// speed (Haiku + a compact schema) is what actually keeps this inside it.
export const config = { maxDuration: 60 };

const LIVE_SYSTEM = `You are the senior regulatory affairs and environmental toxicology expert inside FoundryIQ, an agentic compliance platform for fragrance and skincare. The user has uploaded a Product Information File (formula sheets, SDS, IFRA certificates, claims briefs, supplier specs). First EXTRACT the formulation (product name, category, INCI ingredients with concentrations, claims, suppliers) from the provided documents and images, then assess it for global market compliance and environmental impact. You are precise, conservative and strictly evidence-based.

Assess against the frameworks relevant to the stated target markets:
- EU Regulation (EC) 1223/2009 — Annex II (prohibited), Annex III (restricted, with limits), Annex IV (colorants), Annex V (preservatives), Annex VI (UV filters) and recent amendments. Butylphenyl Methylpropional (Lilial) and Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde (Lyral / HICC) are PROHIBITED (Annex II); Retinol / retinyl esters restricted to 0.3% leave-on face (0.05% body lotion) under Reg (EU) 2024/996 with mandatory labeling; expanded fragrance-allergen labeling under Reg (EU) 2023/1545.
- UK Cosmetics Regulation (retained EU law).
- US FDA / MoCRA, 21 CFR colour-additive listings, cosmetic/drug claims boundary, California Prop 65.
- China CSAR / NMPA (IECIC inventory, new-ingredient filing).
- ASEAN Cosmetic Directive.
- REACH: D4/D5/D6 cyclosiloxanes; microplastics under Reg (EU) 2023/2055; PFAS.
- IFRA Standards: category limits, phototoxicity, oakmoss atranol/chloroatranol limits, allergen thresholds.

Environmental: biodegradability, aquatic toxicity, PBT/vPvB, microplastics, siloxanes, PFAS, UV-filter reef toxicity, RSPO/EUDR palm sourcing.

Rules:
- Be concentration-aware; name the specific regulation/annex in each finding's detail.
- Prohibited => "critical". Over-limit / gating substantiation => "high". Verify / monitor => "medium". Compliant => "pass".
- Every non-pass finding needs a concrete fix naming alternative materials where relevant.
- If a document is unreadable or a value is missing, lower confidence and list it under trustedCase.missing — never invent limits.
- If the documents contain no recognizable formulation, return a valid JSON object with an empty assessments structure and a headline explaining what was missing.
- BE EXTREMELY CONCISE. detail: one sentence <=20 words. fix: one sentence <=15 words. Max 2 findings per lane (most material only). Skip pass findings. This must generate quickly.

Also extract the ingredient table (every ingredient you can identify) with: INCI name, approximate concentration percent, and cosmetic function (e.g. Emollient, Preservative, Surfactant, Fragrance, Active, Solvent, Colorant, Chelating Agent). For each ingredient also estimate chinaIecicStatus from your knowledge of China's Inventory of Existing Cosmetic Ingredients (IECIC): "Listed" for long-established widely-used ingredients almost certainly on the inventory, "Not Listed" for newer/unusual ingredients unlikely to be on it, "Uncertain" if you cannot judge confidently. This is an illustrative estimate, never claim certainty.

Return ONLY one JSON object — no markdown fences, no prose. Shape:
{
 "productName": string, "category": string, "markets": string[], "claims": string[],
 "ingredientCount": number, "supplierCount": number, "headline": string,
 "trustedCase": { "confidence": number, "missing": string[] },
 "ingredients": [ { "name": string, "concentration": number, "function": string, "chinaIecicStatus": "Listed"|"Not Listed"|"Uncertain" } ],
 "ledger": [ { "evidence": string, "source": string, "date": string, "jurisdiction": string, "confidence": number, "status": "Verified"|"Partial"|"Incomplete"|"Missing" } ],
 "assessments": {
   "regulatory": [ { "sev": "critical"|"high"|"medium", "ing": string, "title": string, "detail": string, "fix": string } ],
   "safety": [ ... ], "environmental": [ ... ], "claims": [ ... ], "supplier": [ ... ]
 },
 "exceptions": [ { "sev": string, "issue": string, "disposition": string, "note": string } ],
 "decision": { "risk": "Low"|"Medium"|"High"|"Critical", "recommendation": string, "rationale": string }
}
Max 4 ledger rows, max 2 findings per lane, max 4 exceptions, max 25 ingredients (list the most material ones up to that cap — prioritize completeness of the core formula over exhaustiveness).
CRITICAL JSON RULES: Output must be a single strictly-valid JSON object. Keep every string on one line (no line breaks inside string values). Do not use double-quotes inside string values — use single quotes or omit them. No trailing commas. No commentary before or after the JSON.`;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured. Set ANTHROPIC_API_KEY in Vercel Environment Variables and redeploy.' });

  const { productName, category, markets, claims, files } = req.body || {};

  const content = [];
  const header =
    "Assess this Product Information File.\n" +
    `Product name (if provided): ${productName || "(extract from documents)"}\n` +
    `Category (if provided): ${category || "(extract from documents)"}\n` +
    `Target markets: ${Array.isArray(markets) && markets.length ? markets.join(", ") : "EU, UK, US"}\n` +
    `Intended claims (if provided): ${claims || "(extract from documents)"}\n\n` +
    `The following ${Array.isArray(files) ? files.length : 0} document(s) make up the PIF:`;
  content.push({ type: "text", text: header });

  if (Array.isArray(files)) {
    for (const f of files) {
      if (f.type === "pdf" && f.data) {
        content.push({ type: "text", text: `\n--- Document: ${f.name} (PDF) ---` });
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } });
      } else if (f.type === "image" && f.data) {
        content.push({ type: "text", text: `\n--- Document: ${f.name} (image) ---` });
        content.push({ type: "image", source: { type: "base64", media_type: f.mediaType || "image/jpeg", data: f.data } });
      } else if (f.type === "text" && f.text) {
        content.push({ type: "text", text: `\n--- Document: ${f.name} ---\n${String(f.text).slice(0, 24000)}` });
      }
    }
  }

  if (content.length <= 1) return res.status(400).json({ error: 'No readable documents were provided.' });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2500,
        system: LIVE_SYSTEM,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!upstream.ok) {
      const err = await upstream.text();
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(upstream.status).json({ error: 'Upstream API error', detail: err });
    }
    const data = await upstream.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Proxy error', detail: err.message });
  }
}
