import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles, ShieldCheck, FlaskConical, Leaf, Tag, Truck, Boxes,
  Gavel, Radar, AlertTriangle, CheckCircle2, User, ArrowRight,
  Loader2, Copy, FileWarning, Layers, ScrollText, Workflow, Cpu, Fingerprint,
  Wand2, AlertCircle, Beaker
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  FoundryIQ — Compliance Intelligence                                */
/*  Live agentic workflow demo  (Assistant · Analyst · Tasker ·        */
/*  Guardian · Orchestrator — human over the loop)                     */
/* ------------------------------------------------------------------ */

const C = {
  ink: "#0A1A2F",
  ink2: "#0E2038",
  panel: "#12263F",
  panel2: "#16304E",
  line: "#26415F",
  teal: "#2DD4BF",
  tealDim: "#14B8A6",
  gold: "#D9BE77",
  goldDim: "#C9A85C",
  text: "#EAF0F6",
  mute: "#93A9C2",
  faint: "#6C84A0",
  critical: "#E5484D",
  high: "#E8A13A",
  medium: "#4F9BD9",
  pass: "#3FB68B",
};

const SEV = {
  critical: { c: C.critical, label: "Critical" },
  high: { c: C.high, label: "High" },
  medium: { c: C.medium, label: "Watch" },
  pass: { c: C.pass, label: "Pass" },
};

const serif = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
const sans = "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

/* -------------------------- Agents -------------------------------- */
const AGENTS = {
  orchestrator: { name: "Orchestrator", icon: Cpu, color: C.gold, role: "Routes work, sequences agents, owns the decision packet" },
  assistant: { name: "Assistant", icon: Sparkles, color: C.teal, role: "Extracts & normalizes; builds the Trusted Case + Evidence Ledger" },
  analyst: { name: "Analyst", icon: FlaskConical, color: C.teal, role: "Runs regulatory, safety, environmental & claims assessments" },
  tasker: { name: "Tasker", icon: Boxes, color: C.teal, role: "Chases missing evidence, drafts reformulation options, re-checks" },
  guardian: { name: "Guardian", icon: ShieldCheck, color: C.goldDim, role: "Enforces evidence gate, audit trail, continuous monitoring" },
};

/* ------------------------- Workflow steps ------------------------- */
const STEPS = [
  { id: "case", label: "Trusted Case", sub: "Orchestrator → Assistant + Tasker", icon: Fingerprint, agents: ["orchestrator", "assistant", "tasker"] },
  { id: "ledger", label: "Evidence Ledger", sub: "Assistant", icon: ScrollText, agents: ["assistant"] },
  { id: "assess", label: "Parallel Assessments", sub: "Orchestrator → Analyst + Guardian", icon: Layers, agents: ["orchestrator", "analyst", "guardian"] },
  { id: "triage", label: "Exception Triage", sub: "Analyst + Tasker (human on edge cases)", icon: Workflow, agents: ["analyst", "tasker"] },
  { id: "decision", label: "Risk Decision", sub: "Orchestrator + Guardian → human sign-off", icon: Gavel, agents: ["orchestrator", "guardian"] },
];

/* ============================== DATA ============================== */
/* Findings validated against EU Reg 1223/2009, UK Cosmetics Regs,    */
/* US FDA/MoCRA, REACH, IFRA & current amendments (illustrative demo). */

const LANES = [
  { id: "regulatory", label: "Ingredient / Regulatory", icon: Gavel },
  { id: "safety", label: "Safety & Toxicology", icon: FlaskConical },
  { id: "environmental", label: "Environmental", icon: Leaf },
  { id: "claims", label: "Claims & Labeling", icon: Tag },
  { id: "supplier", label: "Supplier & Documentation", icon: Truck },
];

const FORMULATIONS = [
  {
    id: "serum",
    name: "Rénew Overnight Recovery Serum",
    category: "Leave-on facial serum",
    markets: ["EU", "UK", "US", "China"],
    claims: ["Anti-aging", "Retinol renewal", "Dermatologist tested", "Reduces fine lines"],
    ingredientCount: 38,
    suppliers: 6,
    headline: "Two EU-prohibited fragrance materials — release blocked for EU/UK",
    trustedCase: {
      confidence: 91,
      missing: [
        "Updated IFRA conformity certificate (fragrance compound)",
        "Nitrosamine test report for Triethanolamine batch",
        "Heavy-metal specification for mica colorant",
      ],
      duplicate: { name: "Overnight Recovery Serum Rev 3.2", similarity: 87 },
    },
    ledger: [
      { evidence: "Formula composition", source: "PLM", date: "Current", jurisdiction: "Global", confidence: 98, status: "Verified" },
      { evidence: "Fragrance (parfum) breakdown", source: "Supplier", date: "2024", jurisdiction: "EU/UK", confidence: 72, status: "Incomplete" },
      { evidence: "SDS — actives", source: "Supplier", date: "2025", jurisdiction: "Global", confidence: 95, status: "Verified" },
      { evidence: "TEA nitrosamine COA", source: "Supplier", date: "—", jurisdiction: "EU", confidence: 20, status: "Missing" },
      { evidence: "Retinol spec", source: "Supplier", date: "2025", jurisdiction: "Global", confidence: 94, status: "Verified" },
      { evidence: "Claims substantiation", source: "Brief", date: "Current", jurisdiction: "US/EU", confidence: 61, status: "Partial" },
    ],
    assessments: {
      regulatory: [
        { sev: "critical", ing: "Butylphenyl Methylpropional (Lilial), 0.08%", title: "Prohibited in EU & UK", detail: "CMR 1B (reprotoxic). Listed in Annex II of Reg (EU) 1223/2009; banned from the EU market since 1 Mar 2022. UK retains the prohibition. Presence blocks EU/UK release.", fix: "Remove entirely. Rebuild the muguet facet with Lilial-free materials (e.g. Lilyflore, Mahonial, or a Florol/cyclamen-aldehyde accord) and re-run the allergen profile." },
        { sev: "critical", ing: "Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde (Lyral / HICC), 0.05%", title: "Prohibited in EU & UK", detail: "Sensitizer added to Annex II via Reg (EU) 2017/1410; not permitted on the EU/UK market. Independent EU/UK block.", fix: "Remove. Substitute with a compliant muguet material such as Nympheal or Mahonial to preserve the floral character." },
        { sev: "high", ing: "Retinol, 0.30%", title: "At the new EU concentration limit", detail: "Reg (EU) 2024/996 caps retinol at 0.3% total vitamin-A equivalent in leave-on face products, with mandatory labeling and transition deadlines. Sits exactly at the ceiling.", fix: "Hold total vitamin-A activity ≤0.3% RE (no stacking with retinyl esters); add the required 'contains retinol' labeling; consider 0.25% encapsulated for headroom and reduced irritation." },
        { sev: "high", ing: "Triethanolamine, 1.2%", title: "Annex III restriction — nitrosamine risk", detail: "Permitted with conditions; must not be used with nitrosating systems and N-nitrosamine content must stay <50 µg/kg. No batch COA on file.", fix: "Confirm no nitrite/nitrosating preservatives; require nitrosamine COA. Consider replacing the neutralizer with aminomethyl propanol (AMP) or sodium hydroxide." },
        { sev: "medium", ing: "Benzyl Benzoate, 0.15%", title: "Declarable fragrance allergen", detail: "Above the 0.001% leave-on threshold — must be named on the label. Also IFRA-restricted by category.", fix: "Retain but declare on the INCI label and verify the IFRA face-leave-on limit; log in the allergen table." },
        { sev: "pass", ing: "Phenoxyethanol, 0.90%", title: "Within Annex V limit", detail: "Preservative permitted to a maximum of 1.0%. Compliant.", fix: null },
      ],
      safety: [
        { sev: "high", ing: "Triethanolamine", title: "Nitrosamine formation pathway", detail: "Secondary-amine impurity can nitrosate to form N-nitrosodiethanolamine (NDELA), a potential carcinogen. Requires batch control evidence.", fix: "Enforce nitrosamine COA <50 µg/kg per batch; specify low-secondary-amine grade; avoid co-formulation with nitrosating agents." },
        { sev: "medium", ing: "Retinol", title: "Vitamin-A exposure aggregation", detail: "Consumer may layer multiple vitamin-A products; EU restriction is exposure-driven. Irritation potential at 0.3%.", fix: "Add usage/warning copy; encapsulate to lower peak release; monitor cumulative-exposure guidance." },
        { sev: "pass", ing: "BHT, 0.10%", title: "Supported by SCCS opinion", detail: "SCCS/1636/21 supports safe use in leave-on face products well above this level. Compliant; monitor future endocrine review.", fix: null },
      ],
      environmental: [
        { sev: "high", ing: "Cyclopentasiloxane (D5)", title: "REACH siloxane restriction", detail: "D5 (with D4/D6) is a vPvB-class concern restricted under REACH, with leave-on limits phasing in. Present in the silicone phase.", fix: "Replace with volatile alternatives — Isododecane, C13-16 Isoparaffin, or Coco-Caprylate — to meet the leave-on siloxane restriction." },
        { sev: "medium", ing: "BHT", title: "PBT screening flag", detail: "Moderate aquatic toxicity and bioaccumulation potential; low use level but relevant to the environmental score.", fix: "Consider tocopherol-based antioxidant system; document down-the-drain exposure as negligible for leave-on." },
        { sev: "medium", ing: "Acrylate crosspolymer (rheology)", title: "Microplastic status to confirm", detail: "Reg (EU) 2023/2055 restricts intentionally added synthetic polymer microparticles; swellable/soluble polymers may be exempt.", fix: "Obtain supplier attestation that the grade meets the solubility/degradation exemption; otherwise substitute a natural gum thickener." },
      ],
      claims: [
        { sev: "high", ing: "\"Dermatologist tested\"", title: "Substantiation dossier required", detail: "EU Reg 655/2013 common criteria and rising anti-greenwashing scrutiny require evidence on file before use.", fix: "Attach the dermatological test protocol/results to the Evidence Ledger; keep the claim strictly to what was tested." },
        { sev: "medium", ing: "\"Reduces fine lines\" (US)", title: "Cosmetic/drug boundary", detail: "In the US, structure/function wording can push a product toward drug classification under FDA.", fix: "Frame as appearance-based cosmetic benefit; avoid implying physiological change; align US and EU claim sets." },
        { sev: "medium", ing: "Allergen declaration cascade", title: "Expanded EU allergen list", detail: "Reg (EU) 2023/1545 expands declarable fragrance allergens (~80) with transition deadlines; benzyl benzoate and others must appear.", fix: "Regenerate the label allergen table from the full quantitative fragrance breakdown before artwork lock." },
      ],
      supplier: [
        { sev: "high", ing: "Triethanolamine batch", title: "Missing nitrosamine COA", detail: "Consequential safety evidence absent — Guardian holds the evidence gate.", fix: "Tasker auto-requests the COA from the supplier with a 3-day SLA." },
        { sev: "medium", ing: "Fragrance compound", title: "IFRA certificate not current", detail: "Conformity certificate needed to confirm category limits and allergen quantities.", fix: "Request the current IFRA conformity certificate and quantitative allergen statement." },
        { sev: "pass", ing: "Retinol", title: "Specification current", detail: "Supplier spec verified and within date.", fix: null },
      ],
    },
    exceptions: [
      { sev: "critical", issue: "Lilial present (EU/UK prohibited)", disposition: "Escalate → Reformulate", note: "Human-confirmed block; Tasker opens reformulation scenario." },
      { sev: "critical", issue: "Lyral / HICC present (EU/UK prohibited)", disposition: "Escalate → Reformulate", note: "Independent block; remove before re-check." },
      { sev: "high", issue: "Retinol at 0.3% EU ceiling", disposition: "Escalate → Human confirm", note: "Confirm labeling & no vitamin-A stacking." },
      { sev: "high", issue: "TEA nitrosamine COA missing", disposition: "Request Evidence", note: "Auto-requested from supplier." },
      { sev: "medium", issue: "IFRA certificate not current", disposition: "Request Evidence", note: "Auto-requested; blocks EU allergen table." },
      { sev: "medium", issue: "87% duplicate of Rev 3.2", disposition: "Human confirm", note: "Reviewer confirms whether prior assessment can be reused." },
    ],
    decision: {
      risk: "Critical",
      recommendation: "Do not release for EU/UK. Reformulation required to remove Lilial and Lyral. US/China conditional on claims substantiation and nitrosamine evidence.",
      rationale: "Two Annex II substances create an independent, non-waivable block in EU and UK. Evidence gate also open on nitrosamine COA and IFRA conformity.",
    },
    monitoring: ["EU Annex II/III amendment feed", "IFRA amendment tracker", "Retinol 2024/996 transition deadlines", "TEA supplier certification expiry"],
  },

  {
    id: "moisturizer",
    name: "Hydra-Barrier Daily Moisturizer",
    category: "Leave-on facial cream",
    markets: ["EU", "UK", "US"],
    claims: ["Hydrating", "Barrier repair", "Fragrance-free", "For sensitive skin"],
    ingredientCount: 24,
    suppliers: 4,
    headline: "Clean regulatory profile — clears pending two evidence items",
    trustedCase: {
      confidence: 96,
      missing: ["RSPO / deforestation-free certificate for squalane (if palm-derived)"],
      duplicate: null,
    },
    ledger: [
      { evidence: "Formula composition", source: "PLM", date: "Current", jurisdiction: "Global", confidence: 99, status: "Verified" },
      { evidence: "Squalane origin", source: "Supplier", date: "2025", jurisdiction: "EU", confidence: 68, status: "Partial" },
      { evidence: "Preservative SDS", source: "Supplier", date: "2025", jurisdiction: "Global", confidence: 97, status: "Verified" },
      { evidence: "Sensitive-skin study", source: "Brief", date: "—", jurisdiction: "EU/US", confidence: 40, status: "Missing" },
    ],
    assessments: {
      regulatory: [
        { sev: "pass", ing: "Niacinamide, 4.0%", title: "No concentration restriction", detail: "Well-tolerated active with no Annex III cap; widely used at this level.", fix: null },
        { sev: "pass", ing: "Phenoxyethanol, 0.80%", title: "Within Annex V limit", detail: "Below the 1.0% maximum. Compliant.", fix: null },
        { sev: "medium", ing: "\"Fragrance-free\"", title: "Confirm no masking fragrance", detail: "A masking agent would invalidate the claim and trigger allergen rules.", fix: "Confirm with supplier there is no masking parfum; keep an attestation on file." },
      ],
      safety: [
        { sev: "pass", ing: "Ceramide / Panthenol / HA", title: "Established safe use", detail: "Barrier and humectant actives with strong safety history at use levels.", fix: null },
        { sev: "pass", ing: "Tocopherol", title: "Antioxidant within norms", detail: "No safety concern at formulation level.", fix: null },
      ],
      environmental: [
        { sev: "medium", ing: "Squalane (origin unconfirmed)", title: "Sourcing due diligence", detail: "If palm-derived, deforestation-free / RSPO evidence expected; sugarcane- or olive-derived grades score strongly.", fix: "Require RSPO or bio-based origin certificate; prefer fermentation- or olive-derived squalane." },
        { sev: "pass", ing: "Emollient system", title: "Favourable profile", detail: "Readily biodegradable emollients; low aquatic-toxicity flags.", fix: null },
      ],
      claims: [
        { sev: "high", ing: "\"For sensitive skin\"", title: "Substantiation needed", detail: "Requires patch/clinical evidence under EU common-criteria and US expectations.", fix: "Attach sensitive-skin/patch study to the Evidence Ledger before the claim ships." },
        { sev: "medium", ing: "\"Barrier repair\"", title: "Keep within cosmetic framing", detail: "\"Repair\" can drift toward a medicinal implication; keep to barrier-support wording.", fix: "Reword to 'helps strengthen the skin barrier'; hold supporting data." },
      ],
      supplier: [
        { sev: "medium", ing: "Squalane supplier", title: "Origin certificate missing", detail: "Needed for the sustainability score and any 'sustainably sourced' messaging.", fix: "Tasker requests RSPO / origin attestation." },
        { sev: "pass", ing: "Core actives", title: "Documentation complete", detail: "Specs and SDS current.", fix: null },
      ],
    },
    exceptions: [
      { sev: "high", issue: "Sensitive-skin claim unsubstantiated", disposition: "Request Evidence", note: "Study required before claim ships." },
      { sev: "medium", issue: "Squalane origin certificate missing", disposition: "Request Evidence", note: "Auto-requested from supplier." },
      { sev: "medium", issue: "\"Barrier repair\" wording", disposition: "Human confirm", note: "Claims reviewer approves reworded copy." },
    ],
    decision: {
      risk: "Low",
      recommendation: "Cleared to proceed for EU/UK/US once the sensitive-skin study and squalane origin certificate are attached. No reformulation required.",
      rationale: "No prohibited or restricted-over-limit ingredients. Remaining items are documentation and claim substantiation, not formulation blocks.",
    },
    monitoring: ["Squalane supplier certification", "EU allergen list updates", "Claims-substantiation review cycle"],
  },

  {
    id: "fragrance",
    name: "Fleur de Nuit Eau de Parfum",
    category: "Fine fragrance (leave-on)",
    markets: ["EU", "UK", "US"],
    claims: ["Long-lasting", "Natural florals"],
    ingredientCount: 62,
    suppliers: 3,
    headline: "IFRA & oakmoss limits plus a natural claim to substantiate",
    trustedCase: {
      confidence: 88,
      missing: ["IFRA 51st Amendment conformity certificate", "Quantitative allergen breakdown for the compound"],
      duplicate: null,
    },
    ledger: [
      { evidence: "Compound composition", source: "Supplier", date: "2025", jurisdiction: "Global", confidence: 90, status: "Verified" },
      { evidence: "IFRA conformity certificate", source: "Supplier", date: "—", jurisdiction: "Global", confidence: 25, status: "Missing" },
      { evidence: "Allergen quantitative breakdown", source: "Supplier", date: "—", jurisdiction: "EU/UK", confidence: 45, status: "Partial" },
      { evidence: "Natural-index (ISO 16128)", source: "Brief", date: "—", jurisdiction: "EU/US", confidence: 38, status: "Missing" },
    ],
    assessments: {
      regulatory: [
        { sev: "high", ing: "Oakmoss (Evernia prunastri) extract", title: "Atranol / chloroatranol limit", detail: "EU requires atranol and chloroatranol to be effectively absent (<100 ppm, in practice near-zero). Standard oakmoss exceeds this.", fix: "Switch to atranol/chloroatranol-depleted oakmoss (<2 ppm) or an Evernyl/Orcinyl-based reconstruction." },
        { sev: "high", ing: "IFRA category 4 limits", title: "Restricted materials to verify", detail: "An EdP is IFRA category 4; Citral, Cinnamal, Coumarin, Eugenol and similar must sit within Cat 4 maxima. No conformity certificate on file.", fix: "Obtain IFRA 51 conformity certificate; adjust dosage of any material exceeding Cat 4 limits." },
        { sev: "medium", ing: "Declarable allergens", title: "Expanded EU list", detail: "Under Reg (EU) 2023/1545 many of the ~80 allergens will need declaration; quantitative breakdown incomplete.", fix: "Request full quantitative breakdown; regenerate the label allergen list." },
      ],
      safety: [
        { sev: "high", ing: "Bergamot / citrus oils", title: "Phototoxicity (furocoumarins)", detail: "Bergapten and related furocoumarins must meet IFRA phototoxicity limits for leave-on use.", fix: "Use FCF (furocoumarin-free) bergamot or cap citrus oils to the IFRA phototoxicity limit." },
        { sev: "medium", ing: "High allergen load", title: "Sensitization potential", detail: "Cumulative allergen content raises sensitization risk and label burden.", fix: "Rebalance the accord to reduce total declarable allergens where possible." },
      ],
      environmental: [
        { sev: "medium", ing: "Galaxolide (HHCB) synthetic musk", title: "PBT / bioaccumulation concern", detail: "Polycyclic musks carry persistence and bioaccumulation flags relevant to the environmental score.", fix: "Substitute readily-biodegradable macrocyclic musks — Habanolide or Ambrettolide — to improve the PBT profile." },
      ],
      claims: [
        { sev: "high", ing: "\"Natural florals\"", title: "ISO 16128 substantiation", detail: "'Natural' messaging invites anti-greenwashing scrutiny and needs a calculated natural index.", fix: "Compute the ISO 16128 natural-origin index and keep the claim within what the number supports." },
      ],
      supplier: [
        { sev: "high", ing: "Fragrance house", title: "IFRA certificate missing", detail: "Conformity certificate is the gating evidence for the whole compound.", fix: "Tasker requests IFRA 51 conformity certificate + allergen statement." },
      ],
    },
    exceptions: [
      { sev: "high", issue: "Oakmoss atranol/chloroatranol over limit", disposition: "Escalate → Reformulate", note: "Move to depleted grade or reconstruction." },
      { sev: "high", issue: "IFRA conformity certificate missing", disposition: "Request Evidence", note: "Gating evidence for the compound." },
      { sev: "high", issue: "\"Natural florals\" unsubstantiated", disposition: "Request Evidence", note: "ISO 16128 index required." },
      { sev: "medium", issue: "Allergen breakdown incomplete", disposition: "Request Evidence", note: "Blocks EU label allergen table." },
    ],
    decision: {
      risk: "High",
      recommendation: "Hold pending IFRA 51 conformity, oakmoss constituent limits, and the ISO 16128 natural-claim substantiation. Reformulate oakmoss to a compliant grade.",
      rationale: "Multiple gating items open (IFRA cert, oakmoss limits, natural claim). No absolute Annex II block, so the path is evidence + targeted reformulation rather than a hard stop.",
    },
    monitoring: ["IFRA amendment feed", "EU allergen list transition", "Anti-greenwashing / natural-claim guidance"],
  },
];

/* ============================ HELPERS ============================= */
function Chip({ sev }) {
  const s = SEV[sev];
  return (
    <span style={{
      background: s.c + "22", color: s.c, border: `1px solid ${s.c}55`,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.4, padding: "2px 8px",
      borderRadius: 999, textTransform: "uppercase", whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

function Ring({ value, size = 68, label }) {
  const r = (size - 8) / 2, circ = 2 * Math.PI * r;
  const col = value >= 90 ? C.pass : value >= 75 ? C.teal : value >= 55 ? C.high : C.critical;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.line} strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ - (circ * value) / 100}
          style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{value}<span style={{ fontSize: 10 }}>%</span></span>
        {label && <span style={{ fontSize: 8, color: C.faint, letterSpacing: 0.4 }}>{label}</span>}
      </div>
    </div>
  );
}

function RiskGauge({ risk }) {
  const map = { Low: { v: 22, c: C.pass }, Medium: { v: 50, c: C.medium }, High: { v: 74, c: C.high }, Critical: { v: 94, c: C.critical } };
  const m = map[risk] || map.Medium;
  const w = 220, cx = w / 2, cy = 96, r = 78;
  const a = Math.PI * (1 - m.v / 100);
  const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={w} height={112}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={C.line} strokeWidth="12" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`} fill="none" stroke={m.c} strokeWidth="12" strokeLinecap="round" style={{ transition: "all 1s ease" }} />
        <circle cx={x} cy={y} r="7" fill={m.c} />
      </svg>
      <div style={{ marginTop: -8 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: m.c, fontFamily: serif }}>{risk}</div>
        <div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Overall risk classification</div>
      </div>
    </div>
  );
}

function Section({ title, kicker, icon: Icon, children, live }) {
  return (
    <div style={{
      background: `linear-gradient(180deg, ${C.panel}, ${C.ink2})`,
      border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        {Icon && <Icon size={16} color={C.gold} />}
        <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.gold, fontWeight: 700 }}>{kicker}</span>
        {live && <span style={{ marginLeft: "auto", fontSize: 10, color: C.teal, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: C.teal, boxShadow: `0 0 8px ${C.teal}` }} />always-on</span>}
      </div>
      <h3 style={{ fontFamily: serif, fontSize: 21, color: C.text, margin: "0 0 14px", fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

/* ------------------------- Live AI mode --------------------------- */
const fieldLabel = { fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: C.faint, fontWeight: 700 };
const inputStyle = { width: "100%", boxSizing: "border-box", marginTop: 6, background: C.ink, color: C.text, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 11px", fontSize: 13, fontFamily: sans, outline: "none" };

const LIVE_SAMPLE = {
  name: "Overnight Repair Serum (test)",
  category: "Leave-on facial serum",
  markets: ["EU", "UK", "US", "China"],
  claims: "Anti-aging, Retinol renewal, Brightening",
  formula: [
    "Aqua",
    "Glycerin — 5%",
    "Niacinamide — 5%",
    "Butylphenyl Methylpropional — 0.08%",
    "Triethanolamine — 1.1%",
    "Retinol — 0.3%",
    "Benzyl Salicylate — 0.2%",
    "Cyclopentasiloxane — 4%",
    "Phenoxyethanol — 0.9%",
    "BHT — 0.1%",
    "Tocopherol — 0.2%",
    "Parfum — 0.5%",
  ].join("\n"),
};

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const OK_SEV = ["critical", "high", "medium", "pass"];

function normalizeLive(p) {
  const lanes = ["regulatory", "safety", "environmental", "claims", "supplier"];
  const A = p.assessments || {};
  const assessments = {};
  lanes.forEach((l) => {
    assessments[l] = Array.isArray(A[l]) ? A[l].map((x) => ({
      sev: OK_SEV.includes(x.sev) ? x.sev : "medium",
      ing: x.ing || x.ingredient || "—",
      title: x.title || "Finding",
      detail: x.detail || "",
      fix: x.fix || null,
    })) : [];
  });
  return {
    id: "live",
    name: p.productName || "Live assessment",
    category: p.category || "—",
    markets: Array.isArray(p.markets) ? p.markets : [],
    claims: Array.isArray(p.claims) ? p.claims : [],
    ingredientCount: Number(p.ingredientCount) || 0,
    suppliers: Number(p.supplierCount ?? p.suppliers) || 0,
    headline: p.headline || "",
    trustedCase: {
      confidence: clampPct(p.trustedCase?.confidence),
      missing: Array.isArray(p.trustedCase?.missing) ? p.trustedCase.missing : [],
      duplicate: p.trustedCase?.duplicate || null,
    },
    ledger: Array.isArray(p.ledger) ? p.ledger.map((r) => ({
      evidence: r.evidence || "—", source: r.source || "—", date: r.date || "—",
      jurisdiction: r.jurisdiction || "—", confidence: clampPct(r.confidence), status: r.status || "Partial",
    })) : [],
    assessments,
    exceptions: Array.isArray(p.exceptions) ? p.exceptions.map((e) => ({
      sev: OK_SEV.includes(e.sev) ? e.sev : "medium",
      issue: e.issue || "—", disposition: e.disposition || "Human confirm", note: e.note || "",
    })) : [],
    decision: {
      risk: ["Low", "Medium", "High", "Critical"].includes(p.decision?.risk) ? p.decision.risk : "Medium",
      recommendation: p.decision?.recommendation || "", rationale: p.decision?.rationale || "",
    },
    monitoring: Array.isArray(p.monitoring) ? p.monitoring : [],
  };
}

/* ============================== APP =============================== */
export default function App() {
  const [selected, setSelected] = useState(FORMULATIONS[0]);
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [activeStep, setActiveStep] = useState(-1);
  const [doneSteps, setDoneSteps] = useState(new Set());
  const [openLane, setOpenLane] = useState("regulatory");
  const [mode, setMode] = useState("curated"); // curated | live
  const [liveName, setLiveName] = useState(LIVE_SAMPLE.name);
  const [liveCategory, setLiveCategory] = useState(LIVE_SAMPLE.category);
  const [liveMarkets, setLiveMarkets] = useState(LIVE_SAMPLE.markets);
  const [liveClaims, setLiveClaims] = useState(LIVE_SAMPLE.claims);
  const [liveFormula, setLiveFormula] = useState(LIVE_SAMPLE.formula);
  const [liveResult, setLiveResult] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const reset = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setPhase("idle"); setActiveStep(-1); setDoneSteps(new Set()); setOpenLane("regulatory");
    setLiveResult(null); setLiveError(null);
  };

  const pick = (f) => { if (f.id !== selected.id) { setSelected(f); reset(); } };

  const switchMode = (m) => { if (m !== mode) { setMode(m); reset(); } };

  const toggleMarket = (m) =>
    setLiveMarkets((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  const loadSample = () => {
    setLiveName(LIVE_SAMPLE.name); setLiveCategory(LIVE_SAMPLE.category);
    setLiveMarkets(LIVE_SAMPLE.markets); setLiveClaims(LIVE_SAMPLE.claims);
    setLiveFormula(LIVE_SAMPLE.formula); setLiveError(null);
  };

  const run = () => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gap = reduce ? 120 : 900;
    timers.current.forEach(clearTimeout); timers.current = [];
    setPhase("running"); setActiveStep(0); setDoneSteps(new Set());
    STEPS.forEach((_, i) => {
      timers.current.push(setTimeout(() => {
        setDoneSteps((prev) => new Set([...prev, i]));
        if (i < STEPS.length - 1) setActiveStep(i + 1);
        else { setActiveStep(-1); setPhase("done"); }
      }, gap * (i + 1)));
    });
  };

  const runLive = async () => {
    if (!liveFormula.trim()) { setLiveError("Add a formulation (INCI names and concentrations) to assess."); return; }
    timers.current.forEach(clearTimeout); timers.current = [];
    setLiveError(null); setLiveResult(null); setDoneSteps(new Set()); setPhase("running"); setActiveStep(0);
    [1, 2, 3, 4].forEach((i, idx) => timers.current.push(setTimeout(() => setActiveStep(i), 850 * (idx + 1))));

    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: liveName,
          category: liveCategory,
          markets: liveMarkets,
          claims: liveClaims,
          formula: liveFormula,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`(${res.status}) ${errBody.slice(0, 200) || "request failed"}`);
      }
      const data = await res.json();
      const truncated = data.stop_reason === "max_tokens";
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const s = text.indexOf("{"), e = text.lastIndexOf("}");
      if (s < 0) throw new Error("Model did not return JSON: " + text.slice(0, 200));
      let jsonStr = e >= 0 ? text.slice(s, e + 1) : text.slice(s);
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        // Response was cut off mid-structure (hit max_tokens) — attempt a repair by
        // closing any open strings/arrays/objects before giving up entirely.
        let repaired = jsonStr;
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;
        // Trim any trailing incomplete key/value fragment after the last complete comma or brace
        const lastGoodComma = Math.max(repaired.lastIndexOf('},'), repaired.lastIndexOf('],'), repaired.lastIndexOf('",'));
        if (lastGoodComma > 0 && (openBraces !== closeBraces || openBrackets !== closeBrackets)) {
          repaired = repaired.slice(0, lastGoodComma + 1);
        }
        repaired += ']'.repeat(Math.max(0, (repaired.match(/\[/g) || []).length - (repaired.match(/\]/g) || []).length));
        repaired += '}'.repeat(Math.max(0, (repaired.match(/\{/g) || []).length - (repaired.match(/\}/g) || []).length));
        try {
          parsed = JSON.parse(repaired);
        } catch {
          throw new Error(truncated
            ? "Response was cut off before completing (hit token limit). Try a shorter formulation or fewer target markets, then run again."
            : "Could not parse the model's response as JSON. Run again — this is occasionally transient.");
        }
      }
      timers.current.forEach(clearTimeout); timers.current = [];
      setLiveResult(normalizeLive(parsed));
      setDoneSteps(new Set([0, 1, 2, 3, 4])); setActiveStep(-1); setPhase("done");
    } catch (err) {
      timers.current.forEach(clearTimeout); timers.current = [];
      setLiveError(`Live assessment failed: ${err.message}`);
      setActiveStep(-1); setDoneSteps(new Set()); setPhase("idle");
    }
  };

  const show = (stepId) => phase === "done" || doneSteps.has(STEPS.findIndex((s) => s.id === stepId));
  const f = mode === "live" ? liveResult : selected;
  const MARKET_OPTIONS = ["EU", "UK", "US", "China", "ASEAN"];

  const laneCount = (lane) => {
    const arr = f.assessments[lane] || [];
    const worst = arr.reduce((acc, x) => Math.min(acc, ["critical", "high", "medium", "pass"].indexOf(x.sev)), 3);
    return { n: arr.filter((x) => x.sev !== "pass").length, worst: ["critical", "high", "medium", "pass"][worst] };
  };

  return (
    <div style={{ background: `radial-gradient(1200px 600px at 20% -10%, ${C.panel2}, ${C.ink})`, minHeight: "100%", color: C.text, fontFamily: sans, padding: "26px 20px 48px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        {/* Brand bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 18px ${C.gold}33` }}>
            <Layers size={18} color={C.ink} />
          </div>
          <div>
            <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600, letterSpacing: 0.3 }}>FoundryIQ <span style={{ color: C.gold }}>·</span> Compliance Intelligence</div>
            <div style={{ fontSize: 11.5, color: C.mute, letterSpacing: 0.3 }}>Agentic regulatory & environmental assessment for beauty formulations — human over the loop</div>
          </div>
        </div>

        {/* Agent legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0 22px" }}>
          {Object.entries(AGENTS).map(([k, a]) => {
            const I = a.icon;
            return (
              <div key={k} title={a.role} style={{ display: "flex", alignItems: "center", gap: 7, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 11px" }}>
                <I size={13} color={a.color} />
                <span style={{ fontSize: 12, color: C.text }}>{a.name}</span>
              </div>
            );
          })}
        </div>

        {/* Mode toggle */}
        <div style={{ display: "inline-flex", background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 999, padding: 4, marginBottom: 16 }}>
          {[["curated", "Curated examples", Layers], ["live", "Live AI assessment", Wand2]].map(([m, lbl, Ic]) => {
            const on = mode === m;
            return (
              <button key={m} onClick={() => switchMode(m)} style={{
                display: "flex", alignItems: "center", gap: 7, cursor: "pointer", border: "none",
                background: on ? `linear-gradient(135deg, ${C.gold}, ${C.goldDim})` : "transparent",
                color: on ? C.ink : C.mute, fontWeight: 700, fontSize: 12.5, padding: "8px 15px", borderRadius: 999,
              }}>
                <Ic size={14} /> {lbl}
              </button>
            );
          })}
        </div>

        {/* Formulation picker (curated) */}
        {mode === "curated" && (<>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.gold, fontWeight: 700, marginBottom: 10 }}>Select a formulation to assess</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginBottom: 18 }}>
            {FORMULATIONS.map((x) => {
              const on = x.id === selected.id;
              return (
                <button key={x.id} onClick={() => pick(x)} style={{
                  textAlign: "left", cursor: "pointer", padding: 15, borderRadius: 14,
                  background: on ? `linear-gradient(180deg, ${C.panel2}, ${C.panel})` : C.ink2,
                  border: `1px solid ${on ? C.gold : C.line}`,
                  boxShadow: on ? `0 6px 24px ${C.gold}22` : "none", transition: "all .2s",
                }}>
                  <div style={{ fontFamily: serif, fontSize: 16.5, color: C.text, marginBottom: 4 }}>{x.name}</div>
                  <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>{x.category}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {x.markets.map((m) => <span key={m} style={{ fontSize: 10, color: C.mute, border: `1px solid ${C.line}`, borderRadius: 6, padding: "1px 6px" }}>{m}</span>)}
                  </div>
                </button>
              );
            })}
          </div>
        </>)}

        {/* Live input panel */}
        {mode === "live" && (
          <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.ink2})`, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Beaker size={16} color={C.teal} />
              <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.teal, fontWeight: 700 }}>Live AI assessment</span>
              <button onClick={loadSample} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.line}`, color: C.mute, borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>Load sample</button>
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 14, lineHeight: 1.5 }}>
              Enter any formulation. The Assistant extracts it into a Trusted Case; the Analyst and Guardian assess it live against EU / UK / US / China / REACH / IFRA rules and environmental impact. Output is an AI-generated draft for human validation.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Product name</span>
                <input value={liveName} onChange={(e) => setLiveName(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Category</span>
                <input value={liveCategory} onChange={(e) => setLiveCategory(e.target.value)} style={inputStyle} />
              </label>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={fieldLabel}>Target markets</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 6 }}>
                {MARKET_OPTIONS.map((m) => {
                  const on = liveMarkets.includes(m);
                  return (
                    <button key={m} onClick={() => toggleMarket(m)} style={{
                      cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999,
                      background: on ? C.teal + "22" : "transparent", color: on ? C.teal : C.mute,
                      border: `1px solid ${on ? C.teal : C.line}`,
                    }}>{m}</button>
                  );
                })}
              </div>
            </div>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={fieldLabel}>Intended claims</span>
              <input value={liveClaims} onChange={(e) => setLiveClaims(e.target.value)} placeholder="e.g. Anti-aging, Brightening, Natural" style={inputStyle} />
            </label>

            <label style={{ display: "block" }}>
              <span style={fieldLabel}>Formulation — INCI name and concentration (one per line)</span>
              <textarea value={liveFormula} onChange={(e) => setLiveFormula(e.target.value)} rows={9}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 12.5, lineHeight: 1.5 }} />
            </label>
          </div>
        )}

        {/* Run bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", marginBottom: liveError ? 12 : 22 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{mode === "live" ? (liveName || "Untitled formulation") : f.name}</div>
            <div style={{ fontSize: 11.5, color: C.mute, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {mode === "live" ? "Claude assesses your formulation live as a regulatory & environmental expert" : f.headline}
            </div>
          </div>
          {phase !== "idle" && <button onClick={reset} style={{ background: "transparent", color: C.mute, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 12px", fontSize: 12, cursor: "pointer" }}>Reset</button>}
          <button onClick={mode === "live" ? runLive : run} disabled={phase === "running"} style={{
            display: "flex", alignItems: "center", gap: 8, background: phase === "running" ? C.panel2 : `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`,
            color: phase === "running" ? C.mute : C.ink, border: "none", borderRadius: 10, padding: "10px 16px",
            fontSize: 13, fontWeight: 700, cursor: phase === "running" ? "default" : "pointer", whiteSpace: "nowrap",
          }}>
            {phase === "running" ? <Loader2 size={15} className="spin" /> : mode === "live" ? <Wand2 size={15} /> : <Sparkles size={15} />}
            {phase === "running" ? (mode === "live" ? "Assessing live…" : "Agents working…") : phase === "done" ? "Re-run assessment" : mode === "live" ? "Run live AI assessment" : "Run agentic assessment"}
          </button>
        </div>

        {liveError && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.critical + "14", border: `1px solid ${C.critical}55`, borderRadius: 12, padding: "11px 14px", marginBottom: 22 }}>
            <AlertCircle size={16} color={C.critical} />
            <span style={{ fontSize: 12.5, color: C.text }}>{liveError}</span>
          </div>
        )}

        {/* Orchestration rail */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: 8, marginBottom: 26 }}>
          {STEPS.map((s, i) => {
            const liveProg = mode === "live" && phase === "running" && i < activeStep;
            const isDone = doneSteps.has(i) || liveProg, isActive = activeStep === i;
            const I = s.icon;
            const state = isDone ? "done" : isActive ? "active" : "idle";
            const border = state === "done" ? C.teal : state === "active" ? C.gold : C.line;
            return (
              <div key={s.id} style={{ position: "relative" }}>
                <div style={{
                  background: state === "idle" ? C.ink2 : `linear-gradient(180deg, ${C.panel2}, ${C.panel})`,
                  border: `1px solid ${border}`, borderRadius: 12, padding: "12px 10px", minHeight: 108,
                  boxShadow: state === "active" ? `0 0 0 3px ${C.gold}22` : "none", transition: "all .3s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</span>
                    {isDone ? <CheckCircle2 size={15} color={C.teal} /> : isActive ? <Loader2 size={15} color={C.gold} className="spin" /> : <I size={15} color={C.faint} />}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: state === "idle" ? C.mute : C.text, marginTop: 8, lineHeight: 1.2 }}>{s.label}</div>
                  <div style={{ fontSize: 9.5, color: C.faint, marginTop: 4, lineHeight: 1.3 }}>{s.sub}</div>
                </div>
              </div>
            );
          })}
        </div>

        {phase === "idle" && !liveError && (
          <div style={{ textAlign: "center", color: C.faint, fontSize: 13, padding: "10px 0 30px" }}>
            {mode === "live"
              ? "Enter or load a formulation above, then run it. The five agents assess it live and the same Trusted Case, Evidence Ledger and assessment pack populate below."
              : "The Orchestrator will dispatch the Assistant, Analyst, Tasker and Guardian across five stages. Findings are validated against current EU / UK / US / REACH / IFRA rules."}
          </div>
        )}

        {/* ---------------- Trusted Case ---------------- */}
        {show("case") && (
          <Section kicker="Step 01 — Assistant + Tasker" title="Trusted Formulation Case" icon={Fingerprint}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
              <Ring value={f.trustedCase.confidence} label="EVIDENCE" />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 10 }}>
                  {[["Ingredients", f.ingredientCount], ["Suppliers", f.suppliers], ["Markets", f.markets.length], ["Claims", f.claims.length]].map(([l, v]) => (
                    <div key={l} style={{ background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 11px" }}>
                      <div style={{ fontSize: 20, fontFamily: serif, color: C.text }}>{v}</div>
                      <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {f.claims.map((c) => <span key={c} style={{ fontSize: 11, color: C.mute, background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "3px 9px" }}>{c}</span>)}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginTop: 16 }}>
              <div style={{ background: C.ink2, border: `1px solid ${C.high}44`, borderRadius: 12, padding: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}><FileWarning size={14} color={C.high} /><span style={{ fontSize: 12, fontWeight: 700, color: C.high }}>Missing evidence ({f.trustedCase.missing.length})</span></div>
                {f.trustedCase.missing.map((m, i) => <div key={i} style={{ fontSize: 12, color: C.mute, padding: "3px 0", borderBottom: i < f.trustedCase.missing.length - 1 ? `1px solid ${C.line}` : "none" }}>• {m}</div>)}
              </div>
              <div style={{ background: C.ink2, border: `1px solid ${f.trustedCase.duplicate ? C.medium + "44" : C.line}`, borderRadius: 12, padding: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}><Copy size={14} color={f.trustedCase.duplicate ? C.medium : C.faint} /><span style={{ fontSize: 12, fontWeight: 700, color: f.trustedCase.duplicate ? C.medium : C.faint }}>Duplicate detection</span></div>
                {f.trustedCase.duplicate
                  ? <div style={{ fontSize: 12, color: C.mute }}>Potential match: <b style={{ color: C.text }}>{f.trustedCase.duplicate.name}</b><div style={{ marginTop: 4 }}>Similarity <b style={{ color: C.medium }}>{f.trustedCase.duplicate.similarity}%</b> — routed to human confirm.</div></div>
                  : <div style={{ fontSize: 12, color: C.mute }}>No prior case above threshold. New assessment.</div>}
              </div>
            </div>
          </Section>
        )}

        {/* ---------------- Evidence Ledger ---------------- */}
        {show("ledger") && (
          <Section kicker="Step 02 — Assistant" title="Evidence Ledger" icon={ScrollText}>
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 10 }}>Every downstream conclusion links back to a traceable, versioned source. No judgment runs until evidence is gathered.</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 560 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    {["Evidence", "Source", "Date", "Jurisdiction", "Confidence", "Status"].map((h) => <th key={h} style={{ padding: "6px 8px", fontWeight: 600, borderBottom: `1px solid ${C.line}`, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {f.ledger.map((r, i) => {
                    const sc = r.status === "Verified" ? C.pass : r.status === "Missing" ? C.critical : C.high;
                    return (
                      <tr key={i}>
                        <td style={{ padding: "7px 8px", color: C.text, borderBottom: `1px solid ${C.line}22` }}>{r.evidence}</td>
                        <td style={{ padding: "7px 8px", color: C.mute, borderBottom: `1px solid ${C.line}22` }}>{r.source}</td>
                        <td style={{ padding: "7px 8px", color: C.mute, borderBottom: `1px solid ${C.line}22` }}>{r.date}</td>
                        <td style={{ padding: "7px 8px", color: C.mute, borderBottom: `1px solid ${C.line}22` }}>{r.jurisdiction}</td>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.line}22` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 42, height: 5, borderRadius: 999, background: C.line }}>
                              <div style={{ width: `${r.confidence}%`, height: "100%", borderRadius: 999, background: r.confidence >= 80 ? C.pass : r.confidence >= 55 ? C.high : C.critical }} />
                            </div>
                            <span style={{ color: C.mute, fontSize: 11 }}>{r.confidence}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.line}22` }}><span style={{ color: sc, fontWeight: 700, fontSize: 11.5 }}>{r.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ---------------- Parallel Assessments ---------------- */}
        {show("assess") && (
          <Section kicker="Step 03 — Analyst + Guardian (parallel)" title="Unified Assessment Pack" icon={Layers}>
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 12 }}>Five assessments run in parallel from one controlled evidence base — collapsing sequential reviews and producing explainable findings, each with a Co-Pilot reformulation path.</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {LANES.map((lane) => {
                const { n, worst } = laneCount(lane.id);
                const on = openLane === lane.id;
                const LI = lane.icon;
                return (
                  <button key={lane.id} onClick={() => setOpenLane(lane.id)} style={{
                    display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                    background: on ? `linear-gradient(180deg, ${C.panel2}, ${C.panel})` : C.ink2,
                    border: `1px solid ${on ? C.gold : C.line}`, borderRadius: 10, padding: "8px 11px",
                  }}>
                    <LI size={14} color={on ? C.gold : C.mute} />
                    <span style={{ fontSize: 12, color: on ? C.text : C.mute, fontWeight: on ? 700 : 500 }}>{lane.label}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: n ? SEV[worst].c : C.pass, background: (n ? SEV[worst].c : C.pass) + "22", borderRadius: 999, padding: "1px 7px" }}>{n || "✓"}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {f.assessments[openLane].map((x, i) => (
                <div key={i} style={{ background: C.ink2, border: `1px solid ${SEV[x.sev].c}33`, borderLeft: `3px solid ${SEV[x.sev].c}`, borderRadius: 10, padding: 13 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, justifyContent: "space-between" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{x.title}</div>
                      <div style={{ fontSize: 11.5, color: C.gold, marginTop: 2 }}>{x.ing}</div>
                    </div>
                    <Chip sev={x.sev} />
                  </div>
                  <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.5 }}>{x.detail}</div>
                  {x.fix && (
                    <div style={{ marginTop: 9, background: C.teal + "12", border: `1px solid ${C.teal}33`, borderRadius: 8, padding: "8px 10px", display: "flex", gap: 8 }}>
                      <FlaskConical size={14} color={C.teal} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.45 }}><b style={{ color: C.teal }}>Co-Pilot fix — </b>{x.fix}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ---------------- Exception Triage ---------------- */}
        {show("triage") && (
          <Section kicker="Step 04 — Analyst + Tasker" title="Exception Triage" icon={Workflow}>
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 12 }}>Routine flags resolve by rule; ambiguous or high-risk items route to a human. Nothing consequential proceeds on the agent's own authority.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {f.exceptions.map((e, i) => {
                const human = /Escalate|Human/i.test(e.disposition);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", flexWrap: "wrap" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 999, background: SEV[e.sev].c, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{e.issue}</div>
                      <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{e.note}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, background: human ? C.gold + "18" : C.teal + "15", border: `1px solid ${human ? C.gold : C.teal}44`, borderRadius: 999, padding: "5px 11px" }}>
                      {human ? <User size={13} color={C.gold} /> : <ArrowRight size={13} color={C.teal} />}
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: human ? C.gold : C.teal }}>{e.disposition}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ---------------- Risk Decision ---------------- */}
        {show("decision") && (
          <Section kicker="Step 05 — Orchestrator + Guardian" title="Risk Decision & Release Recommendation" icon={Gavel}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <RiskGauge risk={f.decision.risk} />
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.gold, fontWeight: 700, marginBottom: 6 }}>Recommendation</div>
                <div style={{ fontSize: 14, color: C.text, lineHeight: 1.55 }}>{f.decision.recommendation}</div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 10, lineHeight: 1.5 }}><b style={{ color: C.mute }}>Rationale:</b> {f.decision.rationale}</div>
              </div>
            </div>
            <div style={{ marginTop: 16, background: `linear-gradient(90deg, ${C.gold}18, transparent)`, border: `1px solid ${C.gold}44`, borderRadius: 12, padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: C.gold + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><User size={18} color={C.gold} /></div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>Human sign-off required — release is never autonomous</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>Regulatory Affairs, Toxicology and Quality accept or reject risk. The agent presents evidence and a recommendation; the human decides and owns the record.</div>
              </div>
            </div>
          </Section>
        )}

        {/* ---------------- Continuous Monitoring ---------------- */}
        {phase === "done" && (
          <Section kicker="Guardian — post-approval" title="Continuous Monitoring & Market Surveillance" icon={Radar} live>
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 12 }}>One-time approval is replaced by always-on watch. Only affected products re-enter the workflow when something changes.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              {f.monitoring.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: C.teal, boxShadow: `0 0 8px ${C.teal}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.text }}>{m}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Governance rail */}
        {phase === "done" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginTop: 4 }}>
            {[
              { t: "Evidence before intelligence", d: "No agent analyzes or recommends without sufficient, current, traceable evidence." },
              { t: "Human accountability", d: "AI recommends; humans remain accountable for approvals, safety and market release." },
              { t: "Never more certain than the evidence", d: "Confidence and risk always reflect evidence quality and uncertainty." },
            ].map((g, i) => (
              <div key={i} style={{ background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><ShieldCheck size={15} color={C.goldDim} /><span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{g.t}</span></div>
                <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>{g.d}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10.5, color: C.faint, textAlign: "center", marginTop: 26, lineHeight: 1.6 }}>
          Demonstration environment. Findings are drawn from current EU 1223/2009, UK Cosmetics Regulations, US FDA / MoCRA, REACH and IFRA requirements and are illustrative — every conclusion carries evidence and requires human validation against official sources before any release decision.
        </div>
      </div>

      <style>{`
        .spin { animation: sp 1s linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
        button:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 2px; }
      `}</style>
    </div>
  );
}
