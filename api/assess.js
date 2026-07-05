// Node.js serverless function (not Edge) — longer timeout ceiling for slower model calls
export const config = { maxDuration: 60 };

const LIVE_SYSTEM = `You are the senior regulatory affairs and environmental toxicology expert inside FoundryIQ, an agentic compliance platform for fragrance and skincare. You review cosmetic formulations for global market compliance and environmental impact. You are precise, conservative and strictly evidence-based.

Assess the formulation against the frameworks relevant to the stated target markets:
- EU Regulation (EC) 1223/2009 — Annex II (prohibited), Annex III (restricted, with limits), Annex IV (colorants), Annex V (preservatives), Annex VI (UV filters) and recent amendments. Known recent points: Butylphenyl Methylpropional (Lilial) and Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde (Lyral / HICC) are PROHIBITED (Annex II); Retinol / retinyl esters restricted to 0.3% leave-on face (0.05% body lotion) vitamin-A equivalent under Reg (EU) 2024/996 with mandatory labeling; expanded fragrance-allergen label declaration under Reg (EU) 2023/1545 (~80 allergens).
- UK Cosmetics Regulation (retained EU law; mirrors the EU prohibitions).
- US FDA / MoCRA, 21 CFR colour-additive listings, and the cosmetic/drug boundary for structure-function claims; California Prop 65 and the Safe Cosmetics Act.
- China CSAR / NMPA (IECIC inventory, new-ingredient filing, claims substantiation).
- ASEAN Cosmetic Directive.
- REACH restrictions: D4 / D5 / D6 cyclosiloxanes; intentionally added synthetic-polymer microparticles under Reg (EU) 2023/2055; PFAS.
- IFRA Standards for fragrance: category limits, phototoxicity / furocoumarins, oakmoss atranol / chloroatranol limits, allergen thresholds.

Environmental assessment must consider ready biodegradability, aquatic toxicity, PBT / vPvB, persistent or bioaccumulative substances, microplastics, siloxanes, PFAS, UV-filter reef toxicity, and palm-derived sourcing / deforestation (RSPO, EUDR).

Method and rules:
- Be concentration-aware: compare the stated % to the applicable limit for the product type and markets.
- Name the specific regulation, annex or standard in each finding's detail.
- Prohibited substance => sev "critical". Over-limit / restricted-needing-action / gating substantiation => "high". Verify or monitor => "medium". Compliant => "pass".
- Every non-pass finding needs a concrete, actionable fix: a reformulation route or the exact evidence to obtain, naming alternative materials where relevant.
- If you are unsure of an exact threshold, say so in the detail and lower the confidence rather than inventing a number. Never fabricate a limit.
- Trusted Case confidence reflects data completeness of the input, not how favourable the outcome is.
- BE CONCISE. Each "detail" field: 1-2 sentences max. Each "fix" field: 1 sentence max. Limit each assessment lane to at most 3 findings, prioritising only the most material ones. This keeps the response fast to generate.

Return ONLY one JSON object — no markdown fences, no prose before or after. Use EXACTLY this shape:
{
 "productName": string,
 "category": string,
 "markets": string[],
 "claims": string[],
 "ingredientCount": number,
 "supplierCount": number,
 "headline": string,
 "trustedCase": { "confidence": number 0-100, "missing": string[], "duplicate": null },
 "ledger": [ { "evidence": string, "source": string, "date": string, "jurisdiction": string, "confidence": number 0-100, "status": "Verified"|"Partial"|"Incomplete"|"Missing" } ],
 "assessments": {
   "regulatory": [ { "sev": "critical"|"high"|"medium"|"pass", "ing": string, "title": string, "detail": string, "fix": string|null } ],
   "safety": [ ...same shape, max 3 items ],
   "environmental": [ ...same shape, max 3 items ],
   "claims": [ ...same shape, max 3 items ],
   "supplier": [ ...same shape, max 3 items ]
 },
 "exceptions": [ { "sev": "critical"|"high"|"medium"|"pass", "issue": string, "disposition": "Escalate → Reformulate"|"Escalate → Human confirm"|"Request Evidence"|"Auto-clear"|"Human confirm", "note": string } ],
 "decision": { "risk": "Low"|"Medium"|"High"|"Critical", "recommendation": string, "rationale": string },
 "monitoring": string[]
}
Keep the total response compact — this speeds generation and avoids timeouts. Maximum 3 findings per assessment lane.`;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured. Set ANTHROPIC_API_KEY in Vercel Environment Variables and redeploy.' });
  }

  const { productName, category, markets, claims, formula } = req.body || {};

  if (!formula || !String(formula).trim()) {
    return res.status(400).json({ error: 'Formula is required' });
  }

  const userContent =
    "Assess this cosmetic formulation for compliance and environmental impact.\n\n" +
    `Product name: ${productName || "(unnamed)"}\n` +
    `Category: ${category || "(unspecified)"}\n` +
    `Target markets: ${Array.isArray(markets) && markets.length ? markets.join(", ") : "EU, UK, US"}\n` +
    `Intended claims: ${claims || "(none stated)"}\n\n` +
    `Formulation (INCI name and concentration):\n${formula}`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: LIVE_SYSTEM,
        messages: [{ role: 'user', content: userContent }],
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
