// Formulation Co-Pilot. Takes a new product development (NPD) brief and
// designs ONE starting formulation for a given design strategy. The client
// runs the three strategies in parallel, then sends each formula through
// /api/assess (the same regulatory workflow used for uploaded PIFs). When
// that assessment raises blocking findings, the client calls this endpoint
// again in revise mode with those findings.
import { handlePreflight, missingKeyError, filesToContent, relayClaude } from './_shared.js';

export const config = { maxDuration: 60 };

export const STRATEGIES = {
  performance: 'Hero performance: maximise efficacy and sensorial delivery of the brief\'s key claims, using best-in-class actives or materials at the highest compliant, evidence-based levels.',
  clean: 'Clean and sustainable: highest ISO 16128 natural origin index, readily biodegradable materials, fewest declarable fragrance allergens, no controversial ingredients, certified sustainable sourcing.',
  robust: 'Robust and globally registrable: proven, long-established ingredients listed on every target market inventory (especially China IECIC), simple manufacturing, strong stability and cost efficiency.',
};
const PRODUCT_TYPES = ['Fragrance', 'Skincare', 'Cosmetics'];

const FORMULATE_SYSTEM = `You are the principal formulation chemist and regulatory affairs lead inside Formulyx by FoundryIQ, a formulation intelligence platform for fragrance, skincare and colour cosmetics. From a new product development (NPD) brief you design ONE complete, lab-ready starting formulation that is compliant by design in every target market, following the design strategy you are given. A separate assessment agent then audits your formula against the same frameworks, so design it to pass.

Read the brief (documents, images and typed text) and honour: product type and format, target consumer, claims, texture and sensorial targets, price positioning, target markets and any free-from or exclusion list. If the brief asks for something that would breach a regulation in a target market (for example an over-limit active), design to the strictest applicable limit and say so in designNotes.

Compliance-by-design rules (always apply the strictest rule across the target markets):
- EU Regulation (EC) 1223/2009 and UK: no Annex II substances (e.g. Butylphenyl Methylpropional/Lilial, Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde/Lyral, Atranol, Chloroatranol, Isopropylparaben, Isobutylparaben, Phenylparaben, Benzylparaben, Pentylparaben, Zinc Pyrithione). Respect Annex III limits (e.g. Retinol 0.3% retinol equivalent face leave-on and 0.05% body lotion; Kojic Acid 1% face; Alpha-Arbutin 2% face cream and 0.5% body lotion). Preservatives only from Annex V within limits (e.g. Phenoxyethanol max 1%; Sodium Benzoate 0.5% leave-on, 2.5% rinse-off; no Methylisothiazolinone in leave-on). Colorants only from Annex IV for the intended application area. UV filters only from Annex VI within limits. Avoid formaldehyde releasers.
- Fragrance allergens: assume the expanded declarable allergen list of Reg (EU) 2023/1545 (labelling above 0.001% leave-on, 0.01% rinse-off). Keep the fragrance compound within current IFRA Standards for the product's IFRA category and list the allergens that will need labelling.
- US FDA and MoCRA: colour additives only where permitted for the use (batch-certified where required). No drug claims (SPF, acne treatment, hair growth) unless the brief explicitly accepts an OTC drug route, and flag it. Talc only if specified as asbestos-tested. Avoid California Prop 65 listed substances and intentionally added PFAS (state bans).
- China CSAR / NMPA: use ingredients on the IECIC inventory and avoid new cosmetic ingredients that need NMPA registration or filing. Whitening, sunscreen, anti-hair-loss and hair-dye claims make it a special cosmetic, so note it.
- ASEAN Cosmetic Directive annexes (broadly aligned with the EU).
- REACH: no D4, D5 or D6 cyclosiloxanes, no intentionally added synthetic polymer microparticles (Reg (EU) 2023/2055), no PFAS.
- Environmental: prefer readily biodegradable materials (OECD 301), avoid PBT/vPvB substances, prefer RSPO-certified palm derivatives and reef-safe UV filters, and estimate the ISO 16128 natural origin index.

Category rules:
- Fragrance: hydroalcoholic base (Alcohol Denat. with a denaturant accepted in the target markets) or an oil base. Show the fragrance compound as one line, Parfum, at a level matching the concentration (Eau de Toilette about 8-12%, Eau de Parfum about 15-20%, Parfum 20-30%). Give an olfactive pyramid. Fine fragrance is IFRA Category 4. No preservative is needed above about 60% ethanol. Consider an antioxidant or UV stabiliser that is permitted in every target market.
- Skincare: a complete system (emulsion, serum or gel) with phases, a pH target, a broad-spectrum preservative system, a chelator and an antioxidant. Actives at evidence-based levels within limits.
- Cosmetics (colour): pigments and colorants valid in ALL target markets (EU Annex IV, US 21 CFR 73/74 and China's permitted colorants), plus binders and film formers. Preserve water-containing systems; use an antioxidant in anhydrous systems. No microplastic glitter.

Formula rules:
- Percentages w/w with two decimals summing to exactly 100.00. Exactly one balancing ingredient flagged qs true (usually Aqua or Alcohol Denat.).
- INCI names only, realistic use levels, at most 18 ingredients.
- rationale: at most 12 words per ingredient.
- BE CONCISE. Keep every string on one line. Do not use double quotes inside strings. No trailing commas.

Return ONLY one JSON object, with no markdown fences and no prose:
{
 "optionName": string (2-4 word working name),
 "productName": string, "productType": "Fragrance"|"Skincare"|"Cosmetics", "category": string, "format": string,
 "summary": string (max 30 words),
 "claims": string[] (max 5), "pH": string, "ifraCategory": string ("n/a" if unfragranced), "costTier": "€"|"€€"|"€€€", "naturalOriginPct": number,
 "ingredients": [ { "name": string, "concentration": number, "function": string, "phase": string, "qs": boolean, "rationale": string } ],
 "fragrance": { "top": string, "heart": string, "base": string, "allergens": string[] } or null,
 "process": string[] (max 6 steps, max 18 words each),
 "designNotes": string[] (max 4, how this formula is compliant by design, max 20 words each),
 "testingPlan": string[] (max 4, max 14 words each)
}`;

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return missingKeyError(res);

  const { productName, productType, category, markets, claims, strategy, files, revise } = req.body || {};
  if (!STRATEGIES[strategy]) return res.status(400).json({ error: `Unknown strategy. Use one of: ${Object.keys(STRATEGIES).join(', ')}.` });
  if (!PRODUCT_TYPES.includes(productType)) return res.status(400).json({ error: `productType must be one of: ${PRODUCT_TYPES.join(', ')}.` });

  const marketList = Array.isArray(markets) && markets.length ? markets.join(', ') : 'EU, UK, US';
  const header =
    `Product type: ${productType}\n` +
    `Working product name (if provided): ${productName || '(propose one)'}\n` +
    `Category / format (if provided): ${category || '(infer from the brief)'}\n` +
    `Target markets: ${marketList}\n` +
    `Intended claims (if provided): ${claims || '(infer from the brief)'}\n` +
    `Design strategy: ${STRATEGIES[strategy]}\n`;

  const content = [];
  if (revise && typeof revise === 'object') {
    // Revise mode: the brief has already been interpreted into the formula,
    // so only the formula and the findings to resolve are sent.
    const findings = Array.isArray(revise.findings) ? revise.findings.slice(0, 10) : [];
    content.push({
      type: 'text',
      text: header +
        '\nREVISE MODE. The assessment agent audited the formula below and raised these blocking findings. ' +
        'Return the complete revised formula in the same JSON schema. Resolve every finding, keep the design strategy and the brief intent, ' +
        'keep the total at exactly 100.00, and make the first designNotes item summarise what you changed.\n\n' +
        `Findings to resolve:\n${JSON.stringify(findings).slice(0, 6000)}\n\n` +
        `Current formula:\n${JSON.stringify(revise.formula || {}).slice(0, 8000)}`,
    });
  } else {
    content.push({ type: 'text', text: header + `\nThe NPD brief is made up of the following ${Array.isArray(files) ? files.length : 0} item(s):` });
    content.push(...filesToContent(files, 20000));
    if (content.length <= 1) return res.status(400).json({ error: 'No readable brief was provided.' });
  }

  return relayClaude(res, { apiKey, system: FORMULATE_SYSTEM, content, maxTokens: 4000 });
}
