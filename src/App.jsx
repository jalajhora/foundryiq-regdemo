import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  UploadCloud, FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon,
  X, Loader2, FlaskConical, Leaf, Tag, Truck, Gavel,
  AlertCircle, CheckCircle2, User, Fingerprint, Layers, Sparkles, Beaker, Download,
  SprayCan, Droplets, Palette, Wand2, FlaskRound, ListChecks,
} from "lucide-react";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";

// Point the pdf.js worker at a CDN build matching whatever version got
// installed, so this works regardless of bundler config. To self-host
// instead: copy node_modules/pdfjs-dist/build/pdf.worker.min.mjs into
// /public and set this to that local path.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/* ------------------------------------------------------------------ */
/*  FoundryIQ — PIF Assessment (in-Claude test build)                 */
/*  Calls the model directly via the in-artifact API — no Vercel.     */
/* ------------------------------------------------------------------ */

const C = {
  ink: "#0A1A2F", ink2: "#0E2038", panel: "#12263F", panel2: "#16304E",
  line: "#26415F", teal: "#2DD4BF", gold: "#D9BE77", goldDim: "#C9A85C",
  text: "#EAF0F6", mute: "#93A9C2", faint: "#6C84A0",
  critical: "#E5484D", high: "#E8A13A", medium: "#4F9BD9", pass: "#3FB68B",
};
const SEV = {
  critical: { c: C.critical, label: "Critical" }, high: { c: C.high, label: "High" },
  medium: { c: C.medium, label: "Watch" }, pass: { c: C.pass, label: "Pass" },
};
const serif = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
const sans = "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const MARKET_OPTIONS = ["EU", "UK", "US", "China", "ASEAN"];
const LANES = [
  { id: "regulatory", label: "Regulatory", icon: Gavel },
  { id: "safety", label: "Safety & Toxicology", icon: FlaskConical },
  { id: "environmental", label: "Environmental", icon: Leaf },
  { id: "claims", label: "Claims & Labeling", icon: Tag },
  { id: "supplier", label: "Supplier & Docs", icon: Truck },
];
const STEPS = [
  { id: "extract", label: "Extract PIF", sub: "Assistant reads documents" },
  { id: "case", label: "Trusted Case", sub: "Assistant + Tasker" },
  { id: "assess", label: "Assessments", sub: "Analyst + Guardian" },
  { id: "decision", label: "Risk Decision", sub: "Orchestrator + Guardian" },
];

// New product development (NPD) — the Formulation Co-Pilot designs one
// option per strategy. Keys must match STRATEGIES in api/formulate.js.
const PRODUCT_TYPES = [
  { id: "Fragrance", icon: SprayCan, placeholder: "e.g. Eau de parfum, 50 ml spray" },
  { id: "Skincare", icon: Droplets, placeholder: "e.g. Leave-on facial serum" },
  { id: "Cosmetics", icon: Palette, placeholder: "e.g. Long-wear liquid foundation" },
];
const STRATEGIES = [
  { key: "performance", letter: "A", label: "Hero performance", blurb: "Maximum efficacy within compliant limits" },
  { key: "clean", letter: "B", label: "Clean & sustainable", blurb: "Natural origin, biodegradable, low allergen" },
  { key: "robust", letter: "C", label: "Robust & registrable", blurb: "Globally listed, stable, cost-efficient" },
];
const NPD_STATUS = {
  generating: "Designing formula…",
  assessing: "Running regulatory assessment…",
  revising: "Co-Pilot revising to resolve findings…",
  reassessing: "Re-assessing revised formula…",
};
// Lanes where a "high" finding means the formula itself must change. Claims
// and supplier "high" findings at design stage are usually missing evidence.
const FORMULA_LANES = ["regulatory", "safety", "environmental"];

/* System prompts live server-side in api/ — never shipped to the browser. */

/* ---------- file helpers ---------- */
const iconFor = (name) => {
  const n = name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp)$/.test(n)) return ImageIcon;
  if (/\.(xlsx|xls|csv)$/.test(n)) return FileSpreadsheet;
  if (/\.(pdf|docx?|txt)$/.test(n)) return FileText;
  return FileIcon;
};
const kindFor = (name) => {
  const n = name.toLowerCase();
  if (/\.pdf$/.test(n)) return "pdf";
  if (/\.(png|jpe?g|gif|webp)$/.test(n)) return "image";
  if (/\.docx$/.test(n)) return "docx";
  if (/\.(xlsx|xls)$/.test(n)) return "xlsx";
  if (/\.(csv|txt)$/.test(n)) return "text";
  return "unsupported";
};
const readAsBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1]);
  r.onerror = () => rej(new Error("Could not read " + file.name));
  r.readAsDataURL(file);
});
const readAsText = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(new Error("Could not read " + file.name));
  r.readAsText(file);
});
const fmtSize = (b) => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB";

// Extracts the embedded text layer from a PDF entirely in the browser —
// same idea as the mammoth/xlsx extraction below, just for PDFs. Returns
// "" for a scanned/flattened PDF with no text layer (caller falls back to
// sending it as a raw document block, size permitting).
const readPdfAsText = async (file) => {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
    if (text.length > 60000) break; // plenty for the assess prompt's cap; stop reading early
  }
  return text.trim();
};

// Downscales + recompresses an image client-side before it's ever sent
// anywhere, so a multi-MB artwork/packaging file doesn't blow the request
// payload. Claude's vision read doesn't need print resolution.
const downscaleImage = (file, maxDim = 1800, quality = 0.82) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("Could not compress " + file.name)); return; }
      const r = new FileReader();
      r.onload = () => resolve({ data: String(r.result).split(",")[1], mediaType: "image/jpeg" });
      r.onerror = () => reject(new Error("Could not read compressed " + file.name));
      r.readAsDataURL(blob);
    }, "image/jpeg", quality);
  };
  img.onerror = () => reject(new Error("Could not load image " + file.name));
  img.src = url;
});

// Below this many extracted characters, treat a PDF as effectively
// textless (scanned/flattened with no text layer).
const PDF_TEXT_MIN_CHARS = 200;
// Raw-fallback ceiling for a textless PDF sent as a document block: stays
// well under Vercel's fixed 4.5MB function request-body limit once
// base64-encoded (~33% inflation).
const RAW_PDF_FALLBACK_MAX_BYTES = 3.5 * 1024 * 1024;

/* ---------- normalize + parse-with-repair ---------- */
const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const OK_SEV = ["critical", "high", "medium", "pass"];
function parseLoose(text) {
  const s = text.indexOf("{");
  if (s < 0) throw new Error("No JSON found in the model response.");
  const raw = text.slice(s);

  const sanitize = (v) => v
    // strip markdown fences if any slipped in
    .replace(/```json/gi, "").replace(/```/g, "")
    // remove raw control chars (literal newlines/tabs inside strings break JSON.parse)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    // collapse literal newlines to spaces (model sometimes wraps long detail strings)
    .replace(/\r?\n/g, " ")
    // remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, "$1");

  const attempts = [raw, sanitize(raw)];
  for (const candidate of attempts) {
    try { return JSON.parse(candidate); } catch (_) { /* fall through to repair */ }
  }

  // Stack-based repair for a truncated response (hit max_tokens mid-object).
  // Scans the text tracking string state (with escape handling) and bracket
  // nesting, recording every point where a comma appears outside a string
  // together with the exact bracket stack at that moment. It then cuts at
  // the most recent such point and closes every open bracket in the correct
  // reverse order — a naive "count brackets, then append closers" approach
  // produces invalid JSON for anything nested beyond one level, since it
  // ignores nesting order.
  const text2 = sanitize(raw);
  const stack = [];
  let inString = false, escapeNext = false;
  const safeCuts = [];

  for (let i = 0; i < text2.length; i++) {
    const c = text2[i];
    if (inString) {
      if (escapeNext) { escapeNext = false; }
      else if (c === "\\") { escapeNext = true; }
      else if (c === '"') { inString = false; }
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{" || c === "[") { stack.push(c); continue; }
    if (c === "}" || c === "]") { stack.pop(); continue; }
    if (c === ",") { safeCuts.push({ index: i, stack: stack.slice() }); }
  }

  for (let k = safeCuts.length - 1; k >= 0; k--) {
    const { index, stack: snap } = safeCuts[k];
    let candidate = text2.slice(0, index);
    for (let j = snap.length - 1; j >= 0; j--) candidate += snap[j] === "{" ? "}" : "]";
    try { return JSON.parse(candidate); } catch (_) { /* try an earlier cut point */ }
  }

  throw new Error("The model's response wasn't valid JSON. Run it again — this is usually transient.");
}
function normalize(p) {
  const lanes = ["regulatory", "safety", "environmental", "claims", "supplier"];
  const A = p.assessments || {};
  const assessments = {};
  lanes.forEach((l) => {
    assessments[l] = Array.isArray(A[l]) ? A[l].map((x) => ({
      sev: OK_SEV.includes(x.sev) ? x.sev : "medium",
      ing: x.ing || x.ingredient || "—", title: x.title || "Finding",
      detail: x.detail || "", fix: x.fix || null,
    })) : [];
  });
  const IECIC_OK = ["Listed", "Not Listed", "Uncertain"];
  const ingredients = Array.isArray(p.ingredients) ? p.ingredients.map((i) => ({
    name: i.name || "—",
    concentration: Number(i.concentration) || 0,
    function: i.function || "—",
    chinaIecicStatus: IECIC_OK.includes(i.chinaIecicStatus) ? i.chinaIecicStatus : "Uncertain",
  })) : [];
  return {
    name: p.productName || "Assessed formulation", category: p.category || "—",
    markets: Array.isArray(p.markets) ? p.markets : [],
    claims: Array.isArray(p.claims) ? p.claims : [],
    ingredientCount: Number(p.ingredientCount) || ingredients.length,
    suppliers: Number(p.supplierCount ?? p.suppliers) || 0,
    headline: p.headline || "",
    ingredients,
    trustedCase: {
      confidence: clampPct(p.trustedCase?.confidence),
      missing: Array.isArray(p.trustedCase?.missing) ? p.trustedCase.missing : [],
    },
    ledger: Array.isArray(p.ledger) ? p.ledger.map((r) => ({
      evidence: r.evidence || "—", source: r.source || "—", date: r.date || "—",
      jurisdiction: r.jurisdiction || "—", confidence: clampPct(r.confidence), status: r.status || "Partial",
    })) : [],
    assessments,
    decision: {
      risk: ["Low", "Medium", "High", "Critical"].includes(p.decision?.risk) ? p.decision.risk : "Medium",
      recommendation: p.decision?.recommendation || "", rationale: p.decision?.rationale || "",
    },
  };
}

/* ---------- UI atoms ---------- */
const fieldLabel = { fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: C.faint, fontWeight: 700 };
const inputStyle = { width: "100%", boxSizing: "border-box", marginTop: 6, background: C.ink, color: C.text, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 11px", fontSize: 13, fontFamily: sans, outline: "none" };
function Chip({ sev }) {
  const s = SEV[sev];
  return <span style={{ background: s.c + "22", color: s.c, border: `1px solid ${s.c}55`, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", whiteSpace: "nowrap" }}>{s.label}</span>;
}
function Ring({ value }) {
  const r = 30, circ = 2 * Math.PI * r;
  const col = value >= 90 ? C.pass : value >= 75 ? C.teal : value >= 55 ? C.high : C.critical;
  return (
    <div style={{ position: "relative", width: 68, height: 68, flexShrink: 0 }}>
      <svg width="68" height="68" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="34" cy="34" r={r} fill="none" stroke={C.line} strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ - (circ * value) / 100} style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{value}<span style={{ fontSize: 10 }}>%</span></span>
        <span style={{ fontSize: 8, color: C.faint }}>EVIDENCE</span>
      </div>
    </div>
  );
}
function RiskGauge({ risk }) {
  const map = { Low: { v: 22, c: C.pass }, Medium: { v: 50, c: C.medium }, High: { v: 74, c: C.high }, Critical: { v: 94, c: C.critical } };
  const m = map[risk] || map.Medium;
  const w = 220, cx = w / 2, cy = 96, r = 78, a = Math.PI * (1 - m.v / 100);
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
        <div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Overall risk</div>
      </div>
    </div>
  );
}
function Section({ title, kicker, icon: Icon, children }) {
  return (
    <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.ink2})`, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        {Icon && <Icon size={16} color={C.gold} />}
        <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.gold, fontWeight: 700 }}>{kicker}</span>
      </div>
      <h3 style={{ fontFamily: serif, fontSize: 21, color: C.text, margin: "0 0 14px", fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

const toFileItems = (list) => Array.from(list).map((file) => ({
  id: Math.random().toString(36).slice(2), name: file.name,
  size: file.size, kind: kindFor(file.name), file,
}));

function FileList({ files, onRemove }) {
  if (!files.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      {files.map((f) => {
        const I = iconFor(f.name);
        const bad = f.kind === "unsupported";
        return (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.ink, border: `1px solid ${bad ? C.critical + "66" : C.line}`, borderRadius: 10, padding: "8px 10px" }}>
            <I size={17} color={bad ? C.critical : C.teal} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
              <div style={{ fontSize: 10.5, color: bad ? C.critical : C.faint }}>{bad ? "Unsupported type" : `${f.kind.toUpperCase()} · ${fmtSize(f.size)}`}</div>
            </div>
            <button aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.faint, display: "flex" }}><X size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}

// One upload window: numbered heading, optional controls, drop target, file list.
function UploadWindow({ step, kicker, title, description, dropTitle, dropHint, accent, icon: Icon, files, onAdd, onRemove, children, footer }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.ink2})`, border: `1px solid ${C.line}`, borderTop: `3px solid ${accent}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.ink, background: accent, borderRadius: 6, padding: "1px 7px" }}>{step}</span>
        <Icon size={15} color={accent} />
        <span style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: accent, fontWeight: 700 }}>{kicker}</span>
      </div>
      <h2 style={{ fontFamily: serif, fontSize: 19, color: C.text, margin: "4px 0 4px", fontWeight: 600 }}>{title}</h2>
      <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, marginBottom: 12 }}>{description}</div>
      {children}
      <div
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files?.length) onAdd(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{ cursor: "pointer", borderRadius: 12, padding: "22px 14px", textAlign: "center", background: over ? C.panel2 : C.ink2, border: `1.5px dashed ${over ? accent : C.line}`, transition: "all .2s" }}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp" style={{ display: "none" }}
          onChange={(e) => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ""; }} />
        <UploadCloud size={26} color={over ? accent : C.gold} />
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginTop: 8 }}>{dropTitle}</div>
        <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>{dropHint}</div>
      </div>
      <FileList files={files} onRemove={onRemove} />
      {footer}
    </div>
  );
}

/* ---------- NPD helpers ---------- */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const strList = (v, n) => Array.isArray(v) ? v.filter(Boolean).map(String).slice(0, n) : [];

function normalizeFormula(p, strat) {
  let ings = Array.isArray(p.ingredients) ? p.ingredients.filter((i) => i && i.name).slice(0, 25).map((i) => ({
    name: String(i.name), concentration: round2(i.concentration), function: i.function || "—",
    phase: i.phase || "—", qs: !!i.qs, rationale: i.rationale || "",
  })) : [];
  if (!ings.length) throw new Error("The formulation agent returned no ingredients.");
  // Exactly one q.s. ingredient carries the balance to 100%.
  const qsIdx = ings.findIndex((i) => i.qs);
  ings = ings.map((i, k) => ({ ...i, qs: k === qsIdx }));
  if (qsIdx >= 0) {
    const others = ings.reduce((s, i, k) => (k === qsIdx ? s : s + i.concentration), 0);
    const balance = round2(100 - others);
    if (balance > 0) ings[qsIdx].concentration = balance;
  }
  const fr = p.fragrance && typeof p.fragrance === "object" && (p.fragrance.top || p.fragrance.heart || p.fragrance.base) ? p.fragrance : null;
  return {
    strategy: strat.key, letter: strat.letter, strategyLabel: strat.label,
    optionName: p.optionName || strat.label,
    productName: p.productName || "New product",
    productType: PRODUCT_TYPES.some((t) => t.id === p.productType) ? p.productType : "Skincare",
    category: p.category || "—", format: p.format || "", summary: p.summary || "",
    claims: strList(p.claims, 5), pH: p.pH || "", ifraCategory: p.ifraCategory || "",
    costTier: ["€", "€€", "€€€"].includes(p.costTier) ? p.costTier : "",
    naturalOriginPct: p.naturalOriginPct == null || p.naturalOriginPct === "" ? null : clampPct(p.naturalOriginPct),
    ingredients: ings,
    total: round2(ings.reduce((s, i) => s + i.concentration, 0)),
    fragrance: fr ? { top: fr.top || "", heart: fr.heart || "", base: fr.base || "", allergens: strList(fr.allergens, 15) } : null,
    process: strList(p.process, 6), designNotes: strList(p.designNotes, 4), testingPlan: strList(p.testingPlan, 4),
  };
}

// The generated formula expressed as a design-stage PIF, so it goes through
// exactly the same assessment as an uploaded Product Information File.
function formulaAsPif(f, markets) {
  const lines = [
    `DESIGN-STAGE FORMULATION generated by the Formulyx Formulation Co-Pilot from an NPD brief`,
    `Option ${f.letter}: ${f.optionName} (${f.strategyLabel})`,
    `Product: ${f.productName}`,
    `Product type: ${f.productType}; Category: ${f.category}; Format: ${f.format || "—"}`,
    `Target markets: ${markets.join(", ")}`,
    `Intended claims: ${f.claims.join(", ") || "—"}`,
    `Target pH: ${f.pH || "—"}; IFRA category: ${f.ifraCategory || "—"}`,
    ``, `Formula (INCI | % w/w | Function | Phase):`,
    ...f.ingredients.map((i) => `${i.name} | ${i.qs ? "q.s. to 100 (" + i.concentration.toFixed(2) + ")" : i.concentration.toFixed(2)} | ${i.function} | ${i.phase}`),
    `Total: ${f.total.toFixed(2)}%`,
  ];
  if (f.fragrance) lines.push("", `Fragrance concept: top ${f.fragrance.top}; heart ${f.fragrance.heart}; base ${f.fragrance.base}`, `Expected declarable allergens: ${f.fragrance.allergens.join(", ") || "—"}`);
  if (f.process.length) lines.push("", "Manufacturing process:", ...f.process.map((s, k) => `${k + 1}. ${s}`));
  return lines.join("\n");
}

const compactFormula = (f) => ({
  productName: f.productName, productType: f.productType, category: f.category, format: f.format,
  claims: f.claims, pH: f.pH, ifraCategory: f.ifraCategory, fragrance: f.fragrance,
  ingredients: f.ingredients.map(({ name, concentration, function: fn, phase, qs }) => ({ name, concentration, function: fn, phase, qs })),
});

const blockingFindings = (a) => Object.entries(a.assessments).flatMap(([lane, xs]) =>
  xs.filter((x) => x.sev === "critical" || (x.sev === "high" && FORMULA_LANES.includes(lane))).map((x) => ({ lane, ...x })));

function readinessOf(a) {
  const b = blockingFindings(a);
  if (b.some((x) => x.sev === "critical")) return { label: "Blocked — critical finding", c: C.critical };
  if (b.length) return { label: "Conditional — resolve high findings", c: C.high };
  return { label: "Compliance-cleared for lab work", c: C.pass };
}

async function postModel(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let msg = t;
    try { const j = JSON.parse(t); msg = j.error + (j.detail ? ": " + String(j.detail).slice(0, 120) : ""); } catch (_) { /* plain text error */ }
    throw new Error(`(${res.status}) ${String(msg).slice(0, 200) || "request failed"}`);
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

/* ============================== APP =============================== */
export default function App() {
  const [files, setFiles] = useState([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [markets, setMarkets] = useState(["EU", "UK", "US"]);
  const [claims, setClaims] = useState("");
  const [phase, setPhase] = useState("idle");
  const [activeStep, setActiveStep] = useState(-1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [openLane, setOpenLane] = useState("regulatory");
  const [rawDump, setRawDump] = useState(null);
  // "pif" = assess an uploaded formulation; "npd" = design from a brief.
  const [mode, setMode] = useState("pif");
  const [npdFiles, setNpdFiles] = useState([]);
  const [npdBrief, setNpdBrief] = useState("");
  const [npdType, setNpdType] = useState("Skincare");
  const [npdOptions, setNpdOptions] = useState([]);
  const [npdRunning, setNpdRunning] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);

  // Convert the FileList before queuing the state update: the input is
  // cleared right after onAdd, and React may run the updater later.
  const addFiles = useCallback((list) => { const items = toFileItems(list); setFiles((prev) => [...prev, ...items]); setError(null); }, []);
  const addNpdFiles = useCallback((list) => { const items = toFileItems(list); setNpdFiles((prev) => [...prev, ...items]); setError(null); }, []);
  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const removeNpdFile = (id) => setNpdFiles((prev) => prev.filter((f) => f.id !== id));
  const toggleMarket = (m) => setMarkets((p) => p.includes(m) ? p.filter((x) => x !== m) : [...p, m]);
  const clearRegState = () => { setRegOverride(false); setRegLog([]); setRegFiles([]); };
  const reset = () => {
    setPhase("idle"); setActiveStep(-1); setResult(null); setError(null); setOpenLane("regulatory"); setRawDump(null);
    setRegJurisdictions([]); setRegAseanStates([]); clearRegState();
    setMode("pif"); setNpdOptions([]); setSelectedKey(null);
  };

  async function buildFilesPayload(list = files) {
    const payload = [];
    for (const f of list) {
      if (f.kind === "pdf") {
        let text = "";
        try { text = await readPdfAsText(f.file); } catch (_) { /* fall through to raw handling below */ }
        if (text.length >= PDF_TEXT_MIN_CHARS) {
          payload.push({ type: "text", name: f.name, text: text.slice(0, 40000) });
        } else if (f.file.size <= RAW_PDF_FALLBACK_MAX_BYTES) {
          // No usable text layer (scanned/flattened) but small enough to send as-is for a vision read.
          payload.push({ type: "pdf", name: f.name, data: await readAsBase64(f.file) });
        } else {
          throw new Error(`${f.name} looks like a scanned PDF with no extractable text and is too large (${fmtSize(f.file.size)}) to send as-is. Re-export it with a text layer, or split/compress it below ~3.5MB.`);
        }
      } else if (f.kind === "image") {
        const { data, mediaType } = await downscaleImage(f.file);
        payload.push({ type: "image", name: f.name, data, mediaType });
      } else if (f.kind === "docx") {
        const { value } = await mammoth.extractRawText({ arrayBuffer: await f.file.arrayBuffer() });
        payload.push({ type: "text", name: f.name, text: value.slice(0, 20000) });
      } else if (f.kind === "xlsx") {
        const wb = XLSX.read(await f.file.arrayBuffer(), { type: "array" });
        const csv = wb.SheetNames.map((s) => `# ${s}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[s])).join("\n\n");
        payload.push({ type: "text", name: f.name, text: csv.slice(0, 20000) });
      } else if (f.kind === "text") {
        payload.push({ type: "text", name: f.name, text: (await readAsText(f.file)).slice(0, 20000) });
      }
    }
    return payload;
  }

  const run = async () => {
    if (!files.length) { setError("Add at least one Product Information File to assess."); return; }
    const bad = files.find((f) => f.kind === "unsupported");
    if (bad) { setError(`Unsupported file type: ${bad.name}. Use PDF, DOCX, XLSX, CSV, TXT or images.`); return; }

    setError(null); setResult(null); setRawDump(null); setPhase("running"); setActiveStep(0);
    setMode("pif"); setSelectedKey(null); clearRegState();
    const tick = setInterval(() => setActiveStep((s) => (s < STEPS.length - 1 ? s + 1 : s)), 1600);

    try {
      const filesPayload = await buildFilesPayload();
      const approxBytes = filesPayload.reduce((sum, f) => sum + (f.data ? f.data.length * 0.75 : (f.text ? f.text.length : 0)), 0);
      if (approxBytes > 4 * 1024 * 1024) {
        throw new Error(`This PIF is still ~${(approxBytes / 1048576).toFixed(1)}MB after extraction/compression — trim or split the largest document(s) before assessing.`);
      }
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: name, category, markets, claims,
          files: filesPayload,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`(${res.status}) ${t.slice(0, 160) || "request failed"}`);
      }
      const data = await res.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      let parsed;
      try {
        parsed = parseLoose(text);
      } catch (perr) {
        // Keep the raw output visible so the failure is diagnosable rather than opaque.
        setRawDump({ stopReason: data.stop_reason || "unknown", length: text.length, text });
        throw new Error(`${perr.message} (stop_reason: ${data.stop_reason || "?"}, ${text.length} chars)`);
      }
      clearInterval(tick);
      setResult(normalize(parsed));
      setActiveStep(-1); setPhase("done");
    } catch (err) {
      clearInterval(tick);
      setError(`Assessment failed: ${err.message}`);
      setActiveStep(-1); setPhase("idle");
    }
  };

  /* ---------------- NPD: brief → 3 compliant formulations ---------------- */
  async function assessFormula(f) {
    const text = await postModel("/api/assess", {
      stage: "design", productName: f.productName, category: `${f.productType} — ${f.category}`,
      markets, claims: f.claims.join(", "),
      files: [{ type: "text", name: `Formulyx design — Option ${f.letter}`, text: formulaAsPif(f, markets) }],
    });
    const a = normalize(parseLoose(text));
    // The generated formula is the authoritative ingredient table; keep the
    // assessor's China IECIC estimate for each ingredient.
    const iecic = new Map(a.ingredients.map((i) => [i.name.toLowerCase(), i.chinaIecicStatus]));
    a.ingredients = f.ingredients.map((i) => ({ name: i.name, concentration: i.concentration, function: i.function, chinaIecicStatus: iecic.get(i.name.toLowerCase()) || "Uncertain" }));
    a.ingredientCount = f.ingredients.length;
    a.name = `${f.productName} — Option ${f.letter}`;
    a.category = `${f.productType} · ${f.category}`;
    if (!a.markets.length) a.markets = [...markets];
    if (!a.claims.length) a.claims = f.claims;
    a.formula = f;
    return a;
  }

  const selectOption = (o) => {
    if (!o?.assessment) return;
    setSelectedKey(o.key); setResult(o.assessment); setPhase("done"); setOpenLane("regulatory");
    setRegOverride(false); setRegLog([]);
  };

  const generateNpd = async () => {
    if (!npdFiles.length && !npdBrief.trim()) { setError("Add a new product development brief: upload documents or describe the product in the brief box."); return; }
    const bad = npdFiles.find((f) => f.kind === "unsupported");
    if (bad) { setError(`Unsupported file type: ${bad.name}. Use PDF, DOCX, XLSX, CSV, TXT or images.`); return; }
    if (!markets.length) { setError("Select at least one target market so formulas can be designed to its rules."); return; }

    setError(null); setRawDump(null); setMode("npd"); setResult(null); setPhase("idle"); setActiveStep(-1);
    setSelectedKey(null); clearRegState(); setNpdRunning(true);
    setNpdOptions(STRATEGIES.map((s) => ({ ...s, status: "generating", formula: null, assessment: null, revised: false, revisionFailed: false, error: null })));
    const patch = (key, upd) => setNpdOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...upd } : o)));

    let briefFiles;
    try {
      briefFiles = await buildFilesPayload(npdFiles);
      if (npdBrief.trim()) briefFiles.push({ type: "text", name: "Brief (typed)", text: npdBrief.trim().slice(0, 12000) });
      const approxBytes = briefFiles.reduce((sum, f) => sum + (f.data ? f.data.length * 0.75 : (f.text ? f.text.length : 0)), 0);
      if (approxBytes > 4 * 1024 * 1024) throw new Error(`the brief is ~${(approxBytes / 1048576).toFixed(1)}MB after extraction. Trim or split the largest document.`);
    } catch (err) {
      setError(`Could not read the brief: ${err.message}`); setNpdOptions([]); setNpdRunning(false); return;
    }

    const ctx = { productName: name, productType: npdType, category, markets, claims };
    const outcomes = await Promise.all(STRATEGIES.map(async (s) => {
      try {
        let formula = normalizeFormula(parseLoose(await postModel("/api/formulate", { ...ctx, strategy: s.key, files: briefFiles })), s);
        patch(s.key, { status: "assessing", formula });
        let assessment = await assessFormula(formula);
        let revised = false, revisionFailed = false;
        const blockers = blockingFindings(assessment);
        if (blockers.length) {
          // One automatic Co-Pilot revision, then the same assessment again.
          patch(s.key, { status: "revising", assessment });
          try {
            const findings = blockers.map(({ lane, sev, ing, title, detail, fix }) => ({ lane, sev, ing, title, detail, fix }));
            const f2 = normalizeFormula(parseLoose(await postModel("/api/formulate", { ...ctx, strategy: s.key, revise: { formula: compactFormula(formula), findings } })), s);
            patch(s.key, { status: "reassessing", formula: f2 });
            const a2 = await assessFormula(f2);
            formula = f2; assessment = a2; revised = true;
          } catch (_) {
            revisionFailed = true; // keep the first, fully assessed version
          }
        }
        const done = { status: "done", formula, assessment, revised, revisionFailed };
        patch(s.key, done);
        return { ...s, ...done };
      } catch (err) {
        patch(s.key, { status: "error", error: err.message });
        return null;
      }
    }));
    setNpdRunning(false);

    // Open the strongest option: fewest blocking findings, then lowest risk.
    const riskRank = { Low: 0, Medium: 1, High: 2, Critical: 3 };
    const best = outcomes.filter(Boolean).sort((a, b) =>
      blockingFindings(a.assessment).length - blockingFindings(b.assessment).length ||
      riskRank[a.assessment.decision.risk] - riskRank[b.assessment.decision.risk])[0];
    if (best) selectOption(best);
    else setError("No formulation could be generated. Check the brief and try again.");
  };

  const laneCount = (lane) => {
    const arr = result?.assessments[lane] || [];
    const worst = arr.reduce((acc, x) => Math.min(acc, OK_SEV.indexOf(x.sev)), 3);
    return { n: arr.filter((x) => x.sev !== "pass").length, worst: OK_SEV[worst] };
  };

  // window.print() is blocked inside the artifact's sandboxed iframe (no
  // permission to open the native print dialog), so instead we build a
  // complete, self-contained HTML report and download it as a file. The
  // person opens that file in their own browser and uses Print > Save as
  // PDF there, where printing isn't sandboxed.
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const reportHeading = (t) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="width:3px;height:16px;background:#C9A85C"></div><div style="font-size:13px;font-weight:700;color:#0B1B30">${esc(t)}</div></div>`;
  const reportList = (title, items) => items.length ? `<div style="page-break-inside:avoid"><div style="font-size:10.5px;font-weight:700;color:#0B1B30;margin-bottom:4px">${esc(title)}</div>${items.map((s) => `<div style="font-size:10px;color:#1B2A3D;padding:1.5px 0;line-height:1.45">• ${esc(s)}</div>`).join("")}</div>` : "";

  // Formula table, fragrance concept, process and notes for a generated option.
  function formulaReportHtml(f) {
    const meta = [["Strategy", `Option ${f.letter} · ${f.strategyLabel}`], ["Format", f.format], ["Target pH", f.pH], ["IFRA category", f.ifraCategory],
      ["Natural origin (ISO 16128, est.)", f.naturalOriginPct == null ? "" : f.naturalOriginPct + "%"], ["Cost tier", f.costTier]]
      .filter(([, v]) => v).map(([l, v]) => `<span style="display:inline-block;margin:0 6px 6px 0;border:0.75px solid #D8DEE6;border-radius:4px;padding:3px 8px;font-size:9.5px;color:#1B2A3D"><span style="color:#5F7183">${esc(l)}:</span> ${esc(v)}</span>`).join("");
    const rows = f.ingredients.map((i, k) => `<tr style="background:${k % 2 ? "#F5F7FA" : "#fff"}"><td style="padding:5px 8px;font-size:9.5px;color:#5F7183">${esc(i.phase)}</td><td style="padding:5px 8px;font-size:10px;color:#1B2A3D;font-weight:600">${esc(i.name)}</td><td style="padding:5px 8px;font-size:10px;color:#1B2A3D;text-align:right;white-space:nowrap">${i.qs ? "q.s. " : ""}${i.concentration.toFixed(2)}</td><td style="padding:5px 8px;font-size:9.5px;color:#5F7183">${esc(i.function)}</td><td style="padding:5px 8px;font-size:9.5px;color:#5F7183">${esc(i.rationale)}</td></tr>`).join("");
    const totalOk = Math.abs(f.total - 100) < 0.011;
    const fragHtml = f.fragrance ? `<div style="margin-top:12px;font-size:10px;color:#1B2A3D;line-height:1.55"><b>Olfactive pyramid</b> — Top: ${esc(f.fragrance.top)} · Heart: ${esc(f.fragrance.heart)} · Base: ${esc(f.fragrance.base)}${f.fragrance.allergens.length ? `<br/><b>Expected declarable allergens:</b> ${esc(f.fragrance.allergens.join(", "))}` : ""}</div>` : "";
    return `
      <div style="padding:0 28px 18px">
        ${reportHeading(`Proposed formulation — ${f.optionName}`)}
        ${f.summary ? `<div style="font-size:10.5px;color:#1B2A3D;line-height:1.5;margin-bottom:8px">${esc(f.summary)}</div>` : ""}
        <div>${meta}</div>
        <table style="width:100%;border-collapse:collapse;margin-top:6px">
          <thead><tr style="background:#0B1B30">${["Phase", "INCI", "% w/w", "Function", "Rationale"].map((h) => `<th style="color:#fff;text-align:${h === "% w/w" ? "right" : "left"};padding:6px 8px;font-size:8.5px;text-transform:uppercase">${h}</th>`).join("")}</tr></thead>
          <tbody>${rows}<tr><td></td><td style="padding:6px 8px;font-size:10px;font-weight:700;color:#0B1B30">Total</td><td style="padding:6px 8px;font-size:10px;font-weight:700;text-align:right;color:${totalOk ? "#2E7D52" : "#C0392B"}">${f.total.toFixed(2)}</td><td colspan="2"></td></tr></tbody>
        </table>
        ${fragHtml}
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:12px">
          ${reportList("Manufacturing process", f.process.map((s, k) => `${k + 1}. ${s}`))}
          ${reportList("Compliance by design", f.designNotes)}
          ${reportList("Testing plan", f.testingPlan)}
        </div>
      </div>`;
  }

  function buildReportHTML(r) {
    const riskColor = { Critical: "#C0392B", High: "#B9770E", Medium: "#2C6FA6", Low: "#2E7D52" }[r.decision.risk] || "#2C6FA6";
    const sevColor = { critical: "#C0392B", high: "#B9770E", medium: "#2C6FA6", pass: "#2E7D52" };
    const sevLabel = { critical: "CRITICAL", high: "HIGH", medium: "WATCH", pass: "PASS" };

    const statsHtml = [["Ingredients", r.ingredientCount], ["Suppliers", r.suppliers], ["Markets", r.markets.length], ["Claims", r.claims.length]]
      .map(([l, v]) => `<div style="border:0.75px solid #D8DEE6;border-radius:5px;padding:8px 10px"><div style="font-size:17px;font-weight:700;color:#0B1B30">${v}</div><div style="font-size:8.5px;color:#5F7183;text-transform:uppercase">${esc(l)}</div></div>`).join("");

    const missingHtml = r.trustedCase.missing.length
      ? `<div style="margin-top:12px"><div style="font-size:10px;font-weight:700;color:#B9770E">Missing evidence (${r.trustedCase.missing.length})</div>${r.trustedCase.missing.map((m) => `<div style="font-size:10.5px;color:#1B2A3D;padding:2px 0">• ${esc(m)}</div>`).join("")}</div>`
      : "";

    const ledgerHtml = r.ledger.length ? `
      <div style="padding:0 28px 18px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="width:3px;height:16px;background:#C9A85C"></div><div style="font-size:13px;font-weight:700;color:#0B1B30">Evidence ledger</div></div>
        <table style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr style="background:#0B1B30">${["Evidence", "Source", "Date", "Jurisdiction", "Conf.", "Status"].map((h) => `<th style="color:#fff;text-align:left;padding:6px 8px;font-size:8.5px;text-transform:uppercase">${h}</th>`).join("")}</tr></thead>
          <tbody>${r.ledger.map((row, i) => {
            const sc = row.status === "Verified" ? "#2E7D52" : row.status === "Missing" ? "#C0392B" : "#B9770E";
            return `<tr style="background:${i % 2 ? "#F5F7FA" : "#fff"}"><td style="padding:6px 8px;color:#1B2A3D">${esc(row.evidence)}</td><td style="padding:6px 8px;color:#5F7183">${esc(row.source)}</td><td style="padding:6px 8px;color:#5F7183">${esc(row.date)}</td><td style="padding:6px 8px;color:#5F7183">${esc(row.jurisdiction)}</td><td style="padding:6px 8px;color:#5F7183">${row.confidence}%</td><td style="padding:6px 8px;color:${sc};font-weight:700">${esc(row.status)}</td></tr>`;
          }).join("")}</tbody>
        </table>
      </div>` : "";

    const lanesHtml = LANES.map((lane) => {
      const items = r.assessments[lane.id] || [];
      const findingsHtml = items.length === 0
        ? `<div style="font-size:10px;font-style:italic;color:#5F7183">No material issues identified in this lane.</div>`
        : items.map((x) => {
            const sc = sevColor[x.sev] || sevColor.medium;
            const fixHtml = x.fix ? `<div style="margin-top:5px;background:#E8F5F1;border-radius:4px;padding:6px 9px;font-size:9.5px;color:#0E7C63"><b>Co-Pilot fix — </b>${esc(x.fix)}</div>` : "";
            return `<div style="border-left:3px solid ${sc};padding-left:10px;margin-bottom:9px;page-break-inside:avoid">
              <div style="display:flex;justify-content:space-between;gap:8px">
                <div style="font-size:10.5px;font-weight:700;color:#0B1B30">${esc(x.title)}</div>
                <span style="font-size:7.5px;font-weight:700;color:#fff;background:${sc};border-radius:3px;padding:2px 6px;height:fit-content;white-space:nowrap">${sevLabel[x.sev] || "WATCH"}</span>
              </div>
              <div style="font-size:9.5px;color:#B08D2E;margin-top:1px">${esc(x.ing)}</div>
              <div style="font-size:10px;color:#1B2A3D;margin-top:4px;line-height:1.5">${esc(x.detail)}</div>
              ${fixHtml}
            </div>`;
          }).join("");
      return `<div style="margin-bottom:14px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;border-bottom:0.75px solid #D8DEE6;padding-bottom:4px;margin-bottom:8px">
          <span style="font-size:11px;font-weight:700;color:#0E7C63">${esc(lane.label)}</span>
          <span style="font-size:9.5px;color:#5F7183">${items.length ? `${items.length} finding${items.length > 1 ? "s" : ""}` : "No findings"}</span>
        </div>
        ${findingsHtml}
      </div>`;
    }).join("");

    const signOffHtml = ["Regulatory Affairs", "Toxicology / Safety", "Quality"]
      .map((role) => `<div><div style="border-top:0.75px solid #5F7183;padding-top:4px"></div><div style="font-size:8.5px;color:#5F7183;margin-top:2px">${role} — signature / date</div></div>`).join("");

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>FoundryIQ Compliance Report — ${esc(r.name)}</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background: #fff; color: #1B2A3D; }
  table { width: 100%; }
</style></head>
<body>
  <div style="background:#0B1B30;color:#fff;padding:22px 28px;border-bottom:4px solid #C9A85C">
    <div style="font-size:20px;font-weight:700">FoundryIQ <span style="color:#D9BE77;font-weight:400">· Compliance Intelligence</span></div>
    <div style="font-size:11px;color:#B7C4D6;margin-top:4px">Regulatory &amp; Environmental Assessment — ${r.formula ? "Design-stage formulation from an NPD brief" : "Product Information File"}</div>
    <div style="font-size:9.5px;color:#8FA0B8;margin-top:8px">Generated ${esc(new Date().toLocaleString())} · Confidential — for internal regulatory review</div>
  </div>

  <div style="padding:20px 28px 4px">
    <div style="font-size:19px;font-weight:700;color:#0B1B30">${esc(r.name)}</div>
    <div style="font-size:11px;color:#5F7183;margin-top:4px">${esc(r.category)} · Markets: ${esc(r.markets.join(", ") || "—")}</div>
    ${r.claims.length ? `<div style="font-size:11px;color:#5F7183;margin-top:2px">Claims: ${esc(r.claims.join(", "))}</div>` : ""}
  </div>

  <div style="margin:14px 28px;padding:14px 18px;border-radius:6px;color:#fff;background:${riskColor};display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
    <div>
      <div style="font-size:9px;letter-spacing:1px;font-weight:700">OVERALL RISK CLASSIFICATION</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${esc(r.decision.risk.toUpperCase())}</div>
    </div>
    <div style="text-align:right;font-size:10px;max-width:280px">
      <div>Evidence confidence: ${r.trustedCase.confidence}%</div>
      <div style="margin-top:4px;opacity:0.9">${esc(r.headline)}</div>
    </div>
  </div>

  <div style="padding:0 28px 18px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="width:3px;height:16px;background:#C9A85C"></div><div style="font-size:13px;font-weight:700;color:#0B1B30">Trusted formulation case</div></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${statsHtml}</div>
    ${missingHtml}
  </div>

  ${r.formula ? formulaReportHtml(r.formula) : ""}

  ${ledgerHtml}

  <div style="padding:0 28px 18px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="width:3px;height:16px;background:#C9A85C"></div><div style="font-size:13px;font-weight:700;color:#0B1B30">Unified assessment pack</div></div>
    ${lanesHtml}
  </div>

  <div style="padding:0 28px 18px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="width:3px;height:16px;background:#C9A85C"></div><div style="font-size:13px;font-weight:700;color:#0B1B30">Risk decision &amp; release recommendation</div></div>
    <div style="font-size:10.5px;font-weight:700;color:#0B1B30;margin-bottom:4px">Recommendation</div>
    <div style="font-size:10.5px;color:#1B2A3D;line-height:1.55;margin-bottom:10px">${esc(r.decision.recommendation)}</div>
    <div style="font-size:10.5px;font-weight:700;color:#0B1B30;margin-bottom:4px">Rationale</div>
    <div style="font-size:10px;color:#5F7183;line-height:1.5">${esc(r.decision.rationale)}</div>

    <div style="margin-top:16px;border:1px solid #C9A85C;border-radius:6px;padding:14px 16px;page-break-inside:avoid">
      <div style="font-size:10.5px;font-weight:700;color:#0B1B30">Human sign-off required — release is never autonomous</div>
      <div style="font-size:9.5px;color:#5F7183;margin-top:4px;line-height:1.5">Regulatory Affairs, Toxicology and Quality accept or reject risk. The agent presents evidence; the human decides and owns the record.</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:26px">${signOffHtml}</div>
    </div>
  </div>

  <div style="padding:10px 28px 24px;font-size:8px;color:#8FA0B8;border-top:0.75px solid #D8DEE6">
    FoundryIQ · Compliance Intelligence — AI-generated draft. Requires human validation against official sources before any release decision.
  </div>
</body></html>`;
  }

  const safeName = (s) => (s || "assessment").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 50) || "assessment";
  const triggerDownload = (filename, html) => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadReport = () => {
    if (!result) return;
    triggerDownload(`FoundryIQ_Compliance_${safeName(result.name)}.html`, buildReportHTML(result));
  };

  // All three options side by side, for the NPD review meeting.
  function buildNpdPackHTML(opts) {
    const done = opts.filter((o) => o.status === "done");
    const sevColor = { critical: "#C0392B", high: "#B9770E", medium: "#2C6FA6" };
    const compare = done.map((o, k) => {
      const a = o.assessment, rd = readinessOf(a);
      const counts = ["critical", "high", "medium"].map((s) => `<span style="color:${sevColor[s]};font-weight:700">${Object.values(a.assessments).flat().filter((x) => x.sev === s).length}</span>`).join(" / ");
      return `<tr style="background:${k % 2 ? "#F5F7FA" : "#fff"}"><td style="padding:6px 8px;font-size:10px;font-weight:700;color:#0B1B30">Option ${o.letter} — ${esc(o.formula.optionName)}</td><td style="padding:6px 8px;font-size:10px;color:#5F7183">${esc(o.label)}</td><td style="padding:6px 8px;font-size:10px;font-weight:700">${esc(a.decision.risk)}</td><td style="padding:6px 8px;font-size:10px">${esc(rd.label)}${o.revised ? " (revised once)" : ""}</td><td style="padding:6px 8px;font-size:10px">${counts}</td><td style="padding:6px 8px;font-size:10px;color:#5F7183">${o.formula.naturalOriginPct == null ? "—" : o.formula.naturalOriginPct + "%"}</td><td style="padding:6px 8px;font-size:10px;color:#5F7183">${esc(o.formula.costTier || "—")}</td></tr>`;
    }).join("");
    const sections = done.map((o) => {
      const findings = Object.entries(o.assessment.assessments).flatMap(([lane, xs]) => xs.map((x) => ({ lane, ...x })));
      const fHtml = findings.length ? findings.map((x) => `<div style="border-left:3px solid ${sevColor[x.sev] || "#2C6FA6"};padding-left:9px;margin-bottom:7px;page-break-inside:avoid"><div style="font-size:10px;font-weight:700;color:#0B1B30">${esc(x.title)} <span style="font-weight:400;color:#5F7183">· ${esc(x.lane)} · ${esc(x.ing)}</span></div><div style="font-size:9.5px;color:#1B2A3D">${esc(x.detail)}</div>${x.fix ? `<div style="font-size:9.5px;color:#0E7C63">Fix — ${esc(x.fix)}</div>` : ""}</div>`).join("") : `<div style="font-size:10px;color:#5F7183;font-style:italic">No findings raised.</div>`;
      return `<div style="page-break-before:always;padding-top:18px">${formulaReportHtml(o.formula)}<div style="padding:0 28px 18px">${reportHeading("Assessment findings")}${fHtml}<div style="font-size:10px;color:#1B2A3D;margin-top:8px"><b>Recommendation:</b> ${esc(o.assessment.decision.recommendation)}</div></div></div>`;
    }).join("");
    const first = done[0]?.formula;
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Formulyx NPD Formulation Pack — ${esc(first?.productName || "New product")}</title>
<style>@page{margin:14mm} *{box-sizing:border-box} body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;background:#fff;color:#1B2A3D}</style></head>
<body>
  <div style="background:#0B1B30;color:#fff;padding:22px 28px;border-bottom:4px solid #C9A85C">
    <div style="font-size:20px;font-weight:700">Formulyx <span style="color:#D9BE77;font-weight:400">· Formulation Intelligence</span></div>
    <div style="font-size:11px;color:#B7C4D6;margin-top:4px">New product development — three compliant-by-design starting formulations</div>
    <div style="font-size:9.5px;color:#8FA0B8;margin-top:8px">Generated ${esc(new Date().toLocaleString())} · Confidential — for internal R&amp;D and regulatory review</div>
  </div>
  <div style="padding:18px 28px 6px">
    <div style="font-size:18px;font-weight:700;color:#0B1B30">${esc(first?.productName || "New product")}</div>
    <div style="font-size:11px;color:#5F7183;margin-top:4px">${esc(npdType)} · Markets: ${esc(markets.join(", "))}</div>
  </div>
  <div style="padding:10px 28px 18px">
    ${reportHeading("Option comparison")}
    <table style="width:100%;border-collapse:collapse"><thead><tr style="background:#0B1B30">${["Option", "Strategy", "Risk", "Readiness", "Crit / High / Watch", "Natural origin", "Cost"].map((h) => `<th style="color:#fff;text-align:left;padding:6px 8px;font-size:8.5px;text-transform:uppercase">${h}</th>`).join("")}</tr></thead><tbody>${compare}</tbody></table>
    <div style="font-size:9.5px;color:#5F7183;margin-top:8px;line-height:1.5">Each option was assessed by the same regulatory workflow used for submitted Product Information Files. Options with critical or high formula findings were revised once by the Co-Pilot and re-assessed.</div>
  </div>
  ${sections}
  <div style="margin:20px 28px;border:1px solid #C9A85C;border-radius:6px;padding:12px 16px">
    <div style="font-size:10.5px;font-weight:700;color:#0B1B30">Starting formulations for laboratory development — not approved for launch</div>
    <div style="font-size:9.5px;color:#5F7183;margin-top:4px;line-height:1.5">Each option needs bench work, stability, compatibility and safety assessment, supplier documentation and sign-off by Regulatory Affairs, Toxicology and Quality before any launch decision.</div>
  </div>
</body></html>`;
  }

  const downloadNpdPack = () => {
    const done = npdOptions.filter((o) => o.status === "done");
    if (!done.length) return;
    triggerDownload(`Formulyx_NPD_Pack_${safeName(done[0].formula.productName)}.html`, buildNpdPackHTML(npdOptions));
  };

  /* ================================================================ */
  /*  Regulatory Registration Document Generation                      */
  /*  One drafting-aid generator per jurisdiction. Every generator      */
  /*  returns an array of {filename, html} so multi-document           */
  /*  jurisdictions (US, ASEAN) can produce more than one file.         */
  /* ================================================================ */

  // Common declarable fragrance allergens (EU/ASEAN). Illustrative name
  // match against the extracted ingredient list — not a substitute for a
  // full quantitative allergen breakdown from the fragrance supplier.
  const ALLERGENS = [
    "amyl cinnamal", "benzyl alcohol", "cinnamyl alcohol", "citral", "eugenol",
    "hydroxycitronellal", "isoeugenol", "amylcinnamyl alcohol", "benzyl salicylate",
    "cinnamal", "coumarin", "geraniol", "anisyl alcohol", "benzyl benzoate",
    "benzyl cinnamate", "farnesol", "butylphenyl methylpropional", "linalool",
    "citronellol", "hexyl cinnamal", "limonene", "methyl heptin carbonate",
    "gamma-methylionone", "alpha-isomethyl ionone", "evernia prunastri", "evernia furfuracea",
  ];
  const detectAllergens = (ingredients) =>
    ingredients.filter((i) => ALLERGENS.some((a) => i.name.toLowerCase().includes(a)));

  // EU CPNP-style concentration-range banding (notifications disclose
  // ranges, not exact percentages).
  const concRange = (pct) => {
    if (pct <= 0.1) return "≤ 0.1%";
    if (pct <= 1) return "0.1 – 1%";
    if (pct <= 5) return "1 – 5%";
    if (pct <= 10) return "5 – 10%";
    if (pct <= 25) return "10 – 25%";
    if (pct <= 50) return "25 – 50%";
    return "> 50%";
  };

  const escR = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const REQ = `<span style="background:#FFF3CD;border:1px solid #E8A13A;color:#8A5A00;font-size:8.5px;font-weight:700;padding:2px 6px;border-radius:3px;white-space:nowrap">[REQUIRES INPUT]</span>`;
  const field = (label, value) => `<div style="margin-bottom:9px"><div style="font-size:8.5px;color:#5F7183;text-transform:uppercase;letter-spacing:0.4px">${escR(label)}</div><div style="font-size:11px;color:#1B2A3D;margin-top:2px">${value ? escR(value) : REQ}</div></div>`;

  const regDocShell = (docTitle, jurisdictionLabel, bodyHtml, r, jurisdictionCode) => {
    const badgeColor = { EU: "#0E7C63", UK: "#2C6FA6", US: "#B08D2E", China: "#C0392B", ASEAN: "#B9770E" }[jurisdictionCode] || "#5F7183";
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${escR(docTitle)} — ${escR(r.name)}</title>
<style>@page{margin:14mm} *{box-sizing:border-box} body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;background:#fff;color:#1B2A3D} table{width:100%;border-collapse:collapse}</style>
</head><body>
  <div style="background:#0B1B30;color:#fff;padding:20px 28px;border-bottom:4px solid #C9A85C">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div style="font-size:19px;font-weight:700">FoundryIQ <span style="color:#D9BE77;font-weight:400">· Compliance Intelligence</span></div>
      <div style="background:${badgeColor};color:#fff;font-size:13px;font-weight:800;letter-spacing:0.5px;padding:7px 16px;border-radius:5px">${escR(jurisdictionCode || jurisdictionLabel)}</div>
    </div>
    <div style="display:inline-block;margin-top:10px;background:#B9770E;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.5px;padding:4px 10px;border-radius:3px">DRAFT — REGULATORY SUBMISSION SUPPORT DOCUMENT</div>
    <div style="font-size:11px;color:#B7C4D6;margin-top:10px">${escR(docTitle)} · ${escR(jurisdictionLabel)}</div>
    <div style="font-size:9.5px;color:#8FA0B8;margin-top:6px">Generated ${escR(new Date().toLocaleString())} from FoundryIQ Trusted Case &amp; Assessment</div>
  </div>
  <div style="padding:16px 28px 0"><div style="font-size:17px;font-weight:700;color:#0B1B30">${escR(r.name)}</div><div style="font-size:10.5px;color:#5F7183;margin-top:2px">${escR(r.category)}</div></div>
  ${bodyHtml}
  <div style="margin:20px 28px;border:1.5px solid #C0392B;border-radius:6px;padding:12px 16px;background:#FDEDEC">
    <div style="font-size:10px;font-weight:700;color:#C0392B">This is an AI-generated drafting aid, not a regulatory filing.</div>
    <div style="font-size:9.5px;color:#7B241C;margin-top:4px;line-height:1.5">It must be reviewed and completed by a qualified Regulatory Affairs professional and submitted through the applicable official portal before it has any legal effect. Fields marked ${REQ} must be completed before submission.</div>
  </div>
  <div style="padding:0 28px 24px;font-size:8px;color:#8FA0B8;border-top:0.75px solid #D8DEE6;padding-top:10px">FoundryIQ · Compliance Intelligence</div>
</body></html>`;
  };

  const criticalRegFindings = () => (result?.assessments.regulatory || []).filter((x) => x.sev === "critical" || x.sev === "high");

  const substanceDeclarationHtml = (r) => {
    const items = criticalRegFindings();
    if (!items.length) return `<div style="font-size:10.5px;color:#5F7183;font-style:italic">No prohibited or restricted substances flagged by the assessment.</div>`;
    return `<table><thead><tr style="background:#0B1B30">${["Ingredient", "Finding", "Detail"].map((h) => `<th style="color:#fff;text-align:left;padding:6px 8px;font-size:8.5px;text-transform:uppercase">${h}</th>`).join("")}</tr></thead><tbody>${items.map((x, i) => `<tr style="background:${i % 2 ? "#F5F7FA" : "#fff"}"><td style="padding:6px 8px;font-size:10px;color:#1B2A3D">${escR(x.ing)}</td><td style="padding:6px 8px;font-size:10px;color:${x.sev === "critical" ? "#C0392B" : "#B9770E"};font-weight:700">${escR(x.title)}</td><td style="padding:6px 8px;font-size:9.5px;color:#5F7183">${escR(x.detail)}</td></tr>`).join("")}</tbody></table>`;
  };

  const allergenTableHtml = (r) => {
    const found = detectAllergens(r.ingredients);
    if (!found.length) return `<div style="font-size:10.5px;color:#5F7183;font-style:italic">No declarable fragrance allergens matched against the ingredient list. Confirm with the fragrance supplier's quantitative allergen statement.</div>`;
    return `<table><thead><tr style="background:#0B1B30">${["Allergen", "Approx. Concentration"].map((h) => `<th style="color:#fff;text-align:left;padding:6px 8px;font-size:8.5px;text-transform:uppercase">${h}</th>`).join("")}</tr></thead><tbody>${found.map((i, idx) => `<tr style="background:${idx % 2 ? "#F5F7FA" : "#fff"}"><td style="padding:6px 8px;font-size:10px;color:#1B2A3D">${escR(i.name)}</td><td style="padding:6px 8px;font-size:10px;color:#5F7183">${i.concentration}%</td></tr>`).join("")}</tbody></table><div style="font-size:8.5px;color:#8FA0B8;margin-top:6px">Detected by name-matching against the EU/ASEAN declarable allergen list — confirm exact values against the supplier's fragrance IFRA certificate.</div>`;
  };

  const frameFormulationHtml = (r) => {
    if (!r.ingredients.length) return `<div style="font-size:10.5px;color:#5F7183;font-style:italic">Ingredient table not available from this assessment run.</div>`;
    return `<table><thead><tr style="background:#0B1B30">${["INCI Name", "Function", "Concentration Range"].map((h) => `<th style="color:#fff;text-align:left;padding:6px 8px;font-size:8.5px;text-transform:uppercase">${h}</th>`).join("")}</tr></thead><tbody>${r.ingredients.map((i, idx) => `<tr style="background:${idx % 2 ? "#F5F7FA" : "#fff"}"><td style="padding:6px 8px;font-size:10px;color:#1B2A3D">${escR(i.name)}</td><td style="padding:6px 8px;font-size:10px;color:#5F7183">${escR(i.function)}</td><td style="padding:6px 8px;font-size:10px;color:#5F7183">${concRange(i.concentration)}</td></tr>`).join("")}</tbody></table>`;
  };

  const ingredientListingHtml = (r) => {
    if (!r.ingredients.length) return `<div style="font-size:10.5px;color:#5F7183;font-style:italic">Ingredient table not available from this assessment run.</div>`;
    const sorted = [...r.ingredients].sort((a, b) => b.concentration - a.concentration);
    return `<div style="font-size:10.5px;color:#1B2A3D;line-height:1.7">${sorted.map((i) => escR(i.name)).join(", ")}</div>`;
  };

  /* ---------------------------- EU ---------------------------- */
  function buildEUDoc(r) {
    const body = `
      <div style="padding:0 28px 18px 28px;margin-top:14px">
        ${sectionTitle("Responsible Person & notification details")}
        ${field("Responsible Person (name & EU address)")}
        ${field("Country of origin (if imported)")}
        ${field("Product photograph / original labelling")}
      </div>
      <div style="padding:0 28px 18px">${sectionTitle("Frame formulation")}${frameFormulationHtml(r)}</div>
      <div style="padding:0 28px 18px">${sectionTitle("Declarable fragrance allergens")}${allergenTableHtml(r)}</div>
      <div style="padding:0 28px 18px">${sectionTitle("CMR / restricted substance declaration (Annex II/III cross-check)")}${substanceDeclarationHtml(r)}</div>
      <div style="padding:0 28px 18px">
        ${sectionTitle("Nanomaterial declaration")}
        <div style="font-size:10.5px;color:#1B2A3D">No nanomaterial declared by default — verify against supplier particle-size data before submission. ${REQ}</div>
      </div>
      <div style="padding:0 28px 18px">
        ${sectionTitle("Cosmetic Product Safety Report (CPSR) reference")}
        <div style="font-size:10.5px;color:#1B2A3D">Part A (safety information) and Part B (safety assessment conclusion) must be completed by a qualified Safety Assessor and referenced here. ${REQ}</div>
      </div>`;
    return [{ filename: `FoundryIQ_Registration_EU_${safeName(r.name)}.html`, jurisdiction: "EU", docLabel: "CPNP Notification & PIF Cover Sheet", html: regDocShell("CPNP Notification & PIF Cover Sheet", "European Union", body, r, "EU") }];
  }

  /* ---------------------------- UK ---------------------------- */
  function buildUKDoc(r) {
    const body = `
      <div style="padding:0 28px 18px 28px;margin-top:14px">
        ${sectionTitle("Responsible Person & notification details")}
        ${field("Responsible Person (name & UK address)")}
        ${field("Import route: Great Britain or Northern Ireland")}
      </div>
      <div style="margin:0 28px 18px;padding:10px 14px;background:#FFF8E6;border:1px solid #E8A13A;border-radius:5px;font-size:9.5px;color:#8A5A00;line-height:1.5">
        A UK OPSS SCPN notification is separate from an EU CPNP notification and does not satisfy it, or vice versa. Products sold in both the EU and Great Britain require both notifications. Northern Ireland follows EU rules under the Windsor Framework.
      </div>
      <div style="padding:0 28px 18px">${sectionTitle("Frame formulation")}${frameFormulationHtml(r)}</div>
      <div style="padding:0 28px 18px">${sectionTitle("Declarable fragrance allergens")}${allergenTableHtml(r)}</div>
      <div style="padding:0 28px 18px">${sectionTitle("Restricted substance declaration")}${substanceDeclarationHtml(r)}</div>`;
    return [{ filename: `FoundryIQ_Registration_UK_${safeName(r.name)}.html`, jurisdiction: "UK", docLabel: "OPSS SCPN Notification Support Document", html: regDocShell("OPSS SCPN Notification Support Document", "United Kingdom", body, r, "UK") }];
  }

  /* ---------------------------- US ---------------------------- */
  function buildUSDocs(r) {
    const facility = `
      <div style="padding:0 28px 18px 28px;margin-top:14px">
        ${sectionTitle("Facility details (MoCRA Facility Registration)")}
        ${field("Facility name")}
        ${field("Facility address")}
        ${field("Facility contact (name, phone, email)")}
        ${field("FEI number (if already registered)")}
      </div>
      <div style="margin:0 28px 18px;padding:10px 14px;background:#F0F6FB;border:1px solid #4F9BD9;border-radius:5px;font-size:9.5px;color:#2C5A7A;line-height:1.5">
        Facility Registration and Cosmetic Product Listing are two separate FDA submissions under MoCRA. Both are required; this document covers facility registration only — see the companion Cosmetic Product Listing document for the product-level submission.
      </div>`;
    const listing = `
      <div style="padding:0 28px 18px 28px;margin-top:14px">
        ${sectionTitle("Responsible person")}
        ${field("Responsible person (name & US contact)")}
      </div>
      <div style="padding:0 28px 18px">
        ${sectionTitle("Ingredient list (descending order of predominance)")}
        ${ingredientListingHtml(r)}
      </div>
      <div style="padding:0 28px 18px">${sectionTitle("Restricted substance / claims boundary review")}${substanceDeclarationHtml(r)}</div>
      <div style="margin:0 28px 18px;padding:10px 14px;background:#F0F6FB;border:1px solid #4F9BD9;border-radius:5px;font-size:9.5px;color:#2C5A7A;line-height:1.5">
        Reminder: MoCRA requires adverse event record-keeping and, once FDA's fragrance allergen disclosure rule is in force, allergen labeling on the product listing — confirm current rule status before submission.
      </div>`;
    return [
      { filename: `FoundryIQ_Registration_US_FacilityRegistration_${safeName(r.name)}.html`, jurisdiction: "US", docLabel: "MoCRA Facility Registration", html: regDocShell("MoCRA Facility Registration", "United States", facility, r, "US") },
      { filename: `FoundryIQ_Registration_US_ProductListing_${safeName(r.name)}.html`, jurisdiction: "US", docLabel: "MoCRA Cosmetic Product Listing", html: regDocShell("MoCRA Cosmetic Product Listing", "United States", listing, r, "US") },
    ];
  }

  /* --------------------------- China --------------------------- */
  function buildChinaDoc(r) {
    const specialKeywords = ["hair dye", "hair perm", "freckle", "whitening", "sunscreen", "spf", "uv filter", "anti-hair-loss", "anti hair loss", "hair growth"];
    const haystack = (r.category + " " + r.claims.join(" ")).toLowerCase();
    const isSpecial = specialKeywords.some((k) => haystack.includes(k));
    const pathway = isSpecial ? "Special Cosmetic — Registration (注册)" : "Ordinary Cosmetic — Notification (备案)";

    const notListed = r.ingredients.filter((i) => i.chinaIecicStatus === "Not Listed");
    const uncertain = r.ingredients.filter((i) => i.chinaIecicStatus === "Uncertain");

    const gateHtml = notListed.length
      ? `<div style="margin:0 28px 18px;padding:12px 16px;background:#FDEDEC;border:1.5px solid #C0392B;border-radius:5px">
          <div style="font-size:10.5px;font-weight:700;color:#C0392B">Blocking: ${notListed.length} ingredient(s) not on the IECIC inventory</div>
          <div style="font-size:9.5px;color:#7B241C;margin-top:4px;line-height:1.5">These require a New Cosmetic Ingredient (NCI) registration or filing with NMPA before this product's notification/registration can proceed: ${notListed.map((i) => escR(i.name)).join(", ")}.</div>
        </div>`
      : `<div style="margin:0 28px 18px;padding:10px 14px;background:#EAF7F0;border:1px solid #2E7D52;border-radius:5px;font-size:9.5px;color:#1E5E3A">No ingredients flagged as definitively absent from the IECIC inventory.</div>`;

    const uncertainHtml = uncertain.length
      ? `<div style="margin:0 28px 18px;padding:10px 14px;background:#FFF8E6;border:1px solid #E8A13A;border-radius:5px;font-size:9.5px;color:#8A5A00;line-height:1.5">IECIC status could not be confidently determined for: ${uncertain.map((i) => escR(i.name)).join(", ")}. Verify directly against the current NMPA inventory before proceeding.</div>`
      : "";

    const body = `
      <div style="padding:0 28px 18px 28px;margin-top:14px">
        ${sectionTitle("Registration pathway")}
        <div style="display:inline-block;font-size:11px;font-weight:700;color:#0B1B30;background:#EEF2F6;border:1px solid #D8DEE6;border-radius:5px;padding:6px 12px">${escR(pathway)}</div>
        <div style="font-size:9px;color:#8FA0B8;margin-top:6px">Determined from product category and claims — confirm with China regulatory counsel, especially for any new-efficacy claim.</div>
      </div>
      ${gateHtml}
      ${uncertainHtml}
      <div style="padding:0 28px 18px">
        ${sectionTitle("Domestic responsible person / China-based agent")}
        ${field("China-based Domestic Responsible Person or agent")}
      </div>
      <div style="padding:0 28px 18px">${sectionTitle("Frame formulation")}${frameFormulationHtml(r)}</div>
      <div style="padding:0 28px 18px">
        ${sectionTitle("Animal testing exemption")}
        <div style="font-size:10.5px;color:#1B2A3D">Exemption available only for ordinary cosmetics meeting GMP criteria from an approved country/region. Decision required: ${REQ}</div>
      </div>
      <div style="padding:0 28px 18px">
        ${sectionTitle("Labelling")}
        <div style="font-size:10.5px;color:#1B2A3D">Chinese-language labelling is required and is a downstream task, not covered by this document.</div>
      </div>`;
    return [{ filename: `FoundryIQ_Registration_China_${safeName(r.name)}.html`, jurisdiction: "China", docLabel: `NMPA Support Document (${isSpecial ? "Special/Registration" : "Ordinary/Notification"})`, html: regDocShell("NMPA Notification / Registration Support Document", "China", body, r, "China") }];
  }

  /* --------------------------- ASEAN --------------------------- */
  const ASEAN_STATES = ["Singapore", "Malaysia", "Thailand", "Indonesia", "Philippines", "Vietnam", "Brunei", "Cambodia", "Laos", "Myanmar"];
  function buildASEANDocs(r, states) {
    const list = states && states.length ? states : ["(no member state selected)"];
    return list.map((state) => {
      const body = `
        <div style="padding:0 28px 18px 28px;margin-top:14px">
          ${sectionTitle("Notifying entity")}
          ${field("Responsible Person / local notifying entity in " + state)}
        </div>
        <div style="margin:0 28px 18px;padding:10px 14px;background:#F0F6FB;border:1px solid #4F9BD9;border-radius:5px;font-size:9.5px;color:#2C5A7A;line-height:1.5">
          The ASEAN Cosmetic Directive technical dossier is harmonized, but notification is submitted per member state to that state's own authority (e.g. Singapore's HSA, Malaysia's NPRA). This document is for ${escR(state)} specifically — a separate notification is required for each additional member state.
        </div>
        <div style="padding:0 28px 18px">${sectionTitle("Frame formulation")}${frameFormulationHtml(r)}</div>
        <div style="padding:0 28px 18px">${sectionTitle("Declarable fragrance allergens")}${allergenTableHtml(r)}</div>
        <div style="padding:0 28px 18px">${sectionTitle("ASEAN Cosmetic Ingredient List (ACIL) cross-check")}${substanceDeclarationHtml(r)}</div>`;
      return { filename: `FoundryIQ_Registration_ASEAN_${state}_${safeName(r.name)}.html`, jurisdiction: "ASEAN", docLabel: `ASEAN Cosmetic Directive Notification — ${state}`, html: regDocShell(`ASEAN Cosmetic Directive Notification — ${state}`, `ASEAN — ${state}`, body, r, "ASEAN") };
    });
  }

  function sectionTitle(t) {
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="width:3px;height:16px;background:#C9A85C"></div><div style="font-size:12.5px;font-weight:700;color:#0B1B30">${escR(t)}</div></div>`;
  }

  /* ---------------------- generation UI state ---------------------- */
  const [regJurisdictions, setRegJurisdictions] = useState([]);
  const [regAseanStates, setRegAseanStates] = useState([]);
  const [regOverride, setRegOverride] = useState(false);
  const [regLog, setRegLog] = useState([]);
  const [regFiles, setRegFiles] = useState([]);

  const toggleRegJurisdiction = (j) => setRegJurisdictions((p) => p.includes(j) ? p.filter((x) => x !== j) : [...p, j]);
  const toggleAseanState = (s) => setRegAseanStates((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);

  useEffect(() => {
    if (result) {
      const supported = ["EU", "UK", "US", "China", "ASEAN"];
      setRegJurisdictions(result.markets.filter((m) => supported.includes(m)));
      setRegFiles([]);
    }
  }, [result]);

  // Build every requested jurisdiction's document(s) and hold them for
  // individual download — one explicit click per file. Auto-triggering
  // several downloads in a row from a single click is unreliable (browsers
  // treat only the original click as a genuine user gesture and can block
  // or collapse the rest), which is what produced the mixed-up results.
  const generateRegistrationDocs = () => {
    if (!result || !regJurisdictions.length) return;
    let files = [];
    if (regJurisdictions.includes("EU")) files = files.concat(buildEUDoc(result));
    if (regJurisdictions.includes("UK")) files = files.concat(buildUKDoc(result));
    if (regJurisdictions.includes("US")) files = files.concat(buildUSDocs(result));
    if (regJurisdictions.includes("China")) files = files.concat(buildChinaDoc(result));
    if (regJurisdictions.includes("ASEAN")) files = files.concat(buildASEANDocs(result, regAseanStates));
    setRegFiles(files);
    setRegLog((prev) => [{ time: new Date().toLocaleString(), files: files.map((f) => f.filename) }, ...prev]);
  };

  return (
    <div style={{ background: `radial-gradient(1200px 600px at 20% -10%, ${C.panel2}, ${C.ink})`, minHeight: "100%", color: C.text, fontFamily: sans, padding: "26px 20px 48px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Layers size={18} color={C.ink} />
          </div>
          <div>
            <h1 style={{ fontFamily: serif, fontSize: 20, fontWeight: 600, margin: 0 }}>Formulyx <span style={{ color: C.gold }}>·</span> Formulation Intelligence <span style={{ fontFamily: sans, fontSize: 11, color: C.faint, fontWeight: 500 }}>by FoundryIQ</span></h1>
            <div style={{ fontSize: 11.5, color: C.mute }}>Design new formulations that are compliant from day one, or assess an existing Product Information File before launch</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 14, marginBottom: 14 }}>
          <UploadWindow
            step="01" kicker="Regulatory intelligence" icon={Gavel} accent={C.gold}
            title="Assess an existing formulation"
            description="Agents extract the formula from your Product Information File, assess it in every target market and recommend a launch decision."
            dropTitle="Drop your Product Information File"
            dropHint="PDF, Word, Excel, CSV or images: formula sheet, SDS, IFRA certificates, claims brief, supplier specs."
            files={files} onAdd={addFiles} onRemove={removeFile}
          />
          <UploadWindow
            step="02" kicker="Formulation intelligence" icon={Wand2} accent={C.teal}
            title="Start a new product development"
            description="Upload a new product development (NPD) brief. The Co-Pilot designs three starting formulations and runs each through the same regulatory workflow."
            dropTitle="Drop your NPD brief"
            dropHint="Brief deck, concept board, benchmark INCI lists, claims targets or free-from lists."
            files={npdFiles} onAdd={addNpdFiles} onRemove={removeNpdFile}
            footer={
              <label style={{ display: "block", marginTop: 12 }}>
                <span style={fieldLabel}>Or describe the brief</span>
                <textarea value={npdBrief} onChange={(e) => setNpdBrief(e.target.value)} rows={3}
                  placeholder="e.g. Brightening day serum for 30-45s, lightweight gel texture, fragrance-free, vegan, premium price point, hero claim: visibly more even tone in 4 weeks"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.45 }} />
              </label>
            }
          >
            <div style={{ marginBottom: 12 }}>
              <span style={fieldLabel}>Product type</span>
              <div role="radiogroup" aria-label="Product type" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 6 }}>
                {PRODUCT_TYPES.map((t) => {
                  const on = npdType === t.id; const TI = t.icon;
                  return (
                    <button key={t.id} role="radio" aria-checked={on} onClick={() => setNpdType(t.id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "8px 6px", borderRadius: 9, background: on ? C.teal + "22" : C.ink, color: on ? C.teal : C.mute, border: `1px solid ${on ? C.teal : C.line}` }}>
                      <TI size={14} /> {t.id}
                    </button>
                  );
                })}
              </div>
            </div>
          </UploadWindow>
        </div>

        <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.ink2})`, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Beaker size={15} color={C.teal} />
            <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.teal, fontWeight: 700 }}>Context for both workflows (optional — agents infer what you leave blank)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 12, marginBottom: 12 }}>
            <label><span style={fieldLabel}>Product name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank to extract or propose" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Category / format</span><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={(PRODUCT_TYPES.find((t) => t.id === npdType) || PRODUCT_TYPES[1]).placeholder} style={inputStyle} /></label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={fieldLabel}>Target markets</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 6 }}>
              {MARKET_OPTIONS.map((m) => {
                const on = markets.includes(m);
                return <button key={m} aria-pressed={on} onClick={() => toggleMarket(m)} style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, background: on ? C.teal + "22" : "transparent", color: on ? C.teal : C.mute, border: `1px solid ${on ? C.teal : C.line}` }}>{m}</button>;
              })}
            </div>
          </div>
          <label><span style={fieldLabel}>Intended claims</span><input value={claims} onChange={(e) => setClaims(e.target.value)} placeholder="e.g. Anti-aging, Brightening, Long-lasting, Natural" style={inputStyle} /></label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", marginBottom: error ? 12 : 22, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
              {files.length ? `${files.length} PIF document${files.length > 1 ? "s" : ""}` : "No PIF yet"} · {npdFiles.length || npdBrief.trim() ? `NPD brief ready (${npdType})` : "No NPD brief yet"}
            </div>
            <div style={{ fontSize: 11.5, color: C.mute }}>Every formula, uploaded or generated, passes through the same Trusted Case, assessment and risk decision. Output is a draft for human validation.</div>
          </div>
          {(phase !== "idle" || npdOptions.length > 0) && <button onClick={reset} disabled={npdRunning || phase === "running"} style={{ background: "transparent", color: C.mute, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 12px", fontSize: 12, cursor: "pointer" }}>Reset</button>}
          <button onClick={run} disabled={phase === "running" || npdRunning || !files.length} style={{ display: "flex", alignItems: "center", gap: 8, background: phase === "running" || npdRunning || !files.length ? C.panel2 : `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`, color: phase === "running" || npdRunning || !files.length ? C.mute : C.ink, border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: phase === "running" || npdRunning || !files.length ? "default" : "pointer", whiteSpace: "nowrap" }}>
            {phase === "running" ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            {phase === "running" ? "Assessing…" : mode === "pif" && phase === "done" ? "Re-run assessment" : "01 · Assess PIF"}
          </button>
          <button onClick={generateNpd} disabled={npdRunning || phase === "running" || (!npdFiles.length && !npdBrief.trim())} style={{ display: "flex", alignItems: "center", gap: 8, background: npdRunning || phase === "running" || (!npdFiles.length && !npdBrief.trim()) ? C.panel2 : `linear-gradient(135deg, ${C.teal}, #1FA595)`, color: npdRunning || phase === "running" || (!npdFiles.length && !npdBrief.trim()) ? C.mute : C.ink, border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: npdRunning || phase === "running" || (!npdFiles.length && !npdBrief.trim()) ? "default" : "pointer", whiteSpace: "nowrap" }}>
            {npdRunning ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
            {npdRunning ? "Designing formulas…" : "02 · Generate 3 compliant formulas"}
          </button>
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.critical + "14", border: `1px solid ${C.critical}55`, borderRadius: 12, padding: "11px 14px", marginBottom: rawDump ? 10 : 22 }}>
            <AlertCircle size={16} color={C.critical} /><span style={{ fontSize: 12.5, color: C.text }}>{error}</span>
          </div>
        )}

        {rawDump && (
          <div style={{ background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 22 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.faint, fontWeight: 700, marginBottom: 8 }}>Raw model output (diagnostic) · stop: {rawDump.stopReason} · {rawDump.length} chars</div>
            <pre style={{ margin: 0, maxHeight: 260, overflow: "auto", fontSize: 11, lineHeight: 1.5, color: C.mute, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{rawDump.text}</pre>
          </div>
        )}

        {mode === "pif" && phase !== "idle" && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: 8, marginBottom: 26 }}>
            {STEPS.map((s, i) => {
              const done = phase === "done" || i < activeStep;
              const active = activeStep === i;
              const border = done ? C.teal : active ? C.gold : C.line;
              return (
                <div key={s.id} style={{ background: done || active ? `linear-gradient(180deg, ${C.panel2}, ${C.panel})` : C.ink2, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 10px", minHeight: 92 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</span>
                    {done ? <CheckCircle2 size={15} color={C.teal} /> : active ? <Loader2 size={15} color={C.gold} className="spin" /> : <Fingerprint size={15} color={C.faint} />}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: done || active ? C.text : C.mute, marginTop: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 9.5, color: C.faint, marginTop: 4 }}>{s.sub}</div>
                </div>
              );
            })}
          </div>
        )}

        {mode === "npd" && npdOptions.length > 0 && (
          <Section kicker="Formulation Co-Pilot + Guardian" title="Compliant-by-design formulation options" icon={FlaskRound}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, flex: "1 1 320px" }}>
                Three starting formulations, one per design strategy. Each goes through the same regulatory workflow as an uploaded PIF. Any option with critical or high formula findings is revised once by the Co-Pilot and re-assessed. Select an option to see its formula and full assessment.
              </div>
              {!npdRunning && npdOptions.some((o) => o.status === "done") && (
                <button onClick={downloadNpdPack} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <Download size={14} /> Download NPD pack (3 options)
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,250px),1fr))", gap: 10 }}>
              {npdOptions.map((o) => {
                const done = o.status === "done" && o.assessment;
                const selected = selectedKey === o.key;
                const rd = done ? readinessOf(o.assessment) : null;
                const all = done ? Object.values(o.assessment.assessments).flat() : [];
                return (
                  <button key={o.key} onClick={() => done && selectOption(o)} disabled={!done} aria-pressed={selected}
                    style={{ textAlign: "left", cursor: done ? "pointer" : "default", background: selected ? `linear-gradient(180deg, ${C.panel2}, ${C.panel})` : C.ink2, border: `1px solid ${selected ? C.gold : C.line}`, borderRadius: 12, padding: 14, color: C.text, fontFamily: sans, display: "flex", flexDirection: "column", gap: 8, minHeight: 168 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.gold, fontWeight: 700 }}>Option {o.letter} · {o.label}</span>
                      {o.revised && <span style={{ fontSize: 10, fontWeight: 700, color: C.teal, background: C.teal + "1a", border: `1px solid ${C.teal}55`, borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap" }}>Revised once</span>}
                    </div>
                    <div style={{ fontFamily: serif, fontSize: 17, lineHeight: 1.25 }}>{o.formula?.optionName || o.blurb}</div>
                    {o.status === "error" ? (
                      <div style={{ display: "flex", gap: 6, fontSize: 11.5, color: C.critical, lineHeight: 1.4 }}><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {o.error}</div>
                    ) : !done ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.mute }}><Loader2 size={14} color={C.teal} className="spin" /> {NPD_STATUS[o.status] || "Working…"}</div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: rd.c }}><CheckCircle2 size={14} /> {rd.label}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {["critical", "high", "medium"].map((s) => {
                            const n = all.filter((x) => x.sev === s).length;
                            return <span key={s} style={{ fontSize: 10.5, fontWeight: 700, color: n ? SEV[s].c : C.faint, background: (n ? SEV[s].c : C.faint) + "18", borderRadius: 999, padding: "2px 8px" }}>{n} {SEV[s].label}</span>;
                          })}
                        </div>
                        <div style={{ fontSize: 11, color: C.faint, marginTop: "auto" }}>
                          Risk {o.assessment.decision.risk} · {o.formula.ingredients.length} ingredients
                          {o.formula.naturalOriginPct != null ? ` · ${o.formula.naturalOriginPct}% natural origin` : ""}
                          {o.formula.costTier ? ` · ${o.formula.costTier}` : ""}
                        </div>
                        {o.revisionFailed && <div style={{ fontSize: 10.5, color: C.high }}>Automatic revision failed — showing first assessed version.</div>}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {mode === "npd" && (() => {
          const o = npdOptions.find((x) => x.key === selectedKey);
          const f = o?.status === "done" ? o.formula : null;
          if (!f) return null;
          const totalOk = Math.abs(f.total - 100) < 0.011;
          const meta = [["Format", f.format], ["Target pH", f.pH], ["IFRA category", f.ifraCategory], ["Natural origin (est.)", f.naturalOriginPct == null ? "" : f.naturalOriginPct + "%"], ["Cost tier", f.costTier]].filter(([, v]) => v);
          const cell = { padding: "7px 8px", borderBottom: `1px solid ${C.line}22`, verticalAlign: "top" };
          return (
            <Section kicker={`Option ${f.letter} · ${f.strategyLabel}`} title={`${f.optionName} — ${f.productName}`} icon={Beaker}>
              {f.summary && <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55, marginBottom: 10 }}>{f.summary}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {meta.map(([l, v]) => <span key={l} style={{ fontSize: 11.5, background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 9px", color: C.text }}><span style={{ color: C.faint }}>{l}:</span> {v}</span>)}
                {f.claims.map((c) => <span key={c} style={{ fontSize: 11.5, background: C.gold + "18", border: `1px solid ${C.gold}44`, borderRadius: 8, padding: "4px 9px", color: C.gold }}>{c}</span>)}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 620 }}>
                  <thead><tr>{["Phase", "INCI", "% w/w", "Function", "Rationale"].map((h) => <th key={h} style={{ padding: "6px 8px", textAlign: h === "% w/w" ? "right" : "left", fontWeight: 600, borderBottom: `1px solid ${C.line}`, fontSize: 10.5, textTransform: "uppercase", color: C.faint }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {f.ingredients.map((i, k) => (
                      <tr key={k}>
                        <td style={{ ...cell, color: C.faint, whiteSpace: "nowrap" }}>{i.phase}</td>
                        <td style={{ ...cell, color: C.text, fontWeight: 600 }}>{i.name}</td>
                        <td style={{ ...cell, color: C.text, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{i.qs && <span style={{ color: C.faint, fontSize: 10.5 }}>q.s. </span>}{i.concentration.toFixed(2)}</td>
                        <td style={{ ...cell, color: C.mute }}>{i.function}</td>
                        <td style={{ ...cell, color: C.faint }}>{i.rationale}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={cell}></td>
                      <td style={{ ...cell, color: C.text, fontWeight: 700 }}>Total</td>
                      <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: totalOk ? C.pass : C.critical, fontVariantNumeric: "tabular-nums" }}>{f.total.toFixed(2)}</td>
                      <td style={{ ...cell, color: totalOk ? C.faint : C.critical }} colSpan={2}>{totalOk ? "" : "Does not sum to 100% — rebalance before lab work."}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {f.fragrance && (
                <div style={{ marginTop: 14, background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 13px", fontSize: 12.5, color: C.mute, lineHeight: 1.6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.text, fontWeight: 700, marginBottom: 4 }}><SprayCan size={14} color={C.gold} /> Olfactive pyramid</div>
                  <div><b style={{ color: C.text }}>Top:</b> {f.fragrance.top}</div>
                  <div><b style={{ color: C.text }}>Heart:</b> {f.fragrance.heart}</div>
                  <div><b style={{ color: C.text }}>Base:</b> {f.fragrance.base}</div>
                  {f.fragrance.allergens.length > 0 && <div style={{ marginTop: 4 }}><b style={{ color: C.high }}>Expected declarable allergens:</b> {f.fragrance.allergens.join(", ")}</div>}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 10, marginTop: 14 }}>
                {[["Manufacturing process", f.process.map((s, k) => `${k + 1}. ${s}`), Layers], ["Compliance by design", f.designNotes, CheckCircle2], ["Testing plan", f.testingPlan, ListChecks]].map(([t, items, I]) => (
                  <div key={t} style={{ background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 13px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}><I size={14} color={C.teal} /> {t}</div>
                    {items.length ? items.map((s, k) => <div key={k} style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, padding: "2px 0" }}>{s}</div>) : <div style={{ fontSize: 12, color: C.faint }}>—</div>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 14 }}>The full assessment for this option (Trusted Case, findings, risk decision and registration documents) follows below.</div>
            </Section>
          );
        })()}

        {result && phase === "done" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: `linear-gradient(90deg, ${C.gold}18, transparent)`, border: `1px solid ${C.gold}44`, borderRadius: 12, padding: "12px 15px", marginBottom: 18, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12.5, color: C.text }}>Assessment complete — download a formatted report, then use your browser's Print → Save as PDF.</div>
              <button onClick={downloadReport} style={{ display: "flex", alignItems: "center", gap: 8, background: `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`, color: C.ink, border: "none", borderRadius: 10, padding: "9px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                <Download size={15} /> Download report
              </button>
            </div>
            <Section kicker="Assistant + Tasker" title="Trusted Formulation Case" icon={Fingerprint}>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                <Ring value={result.trustedCase.confidence} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontFamily: serif, fontSize: 18, color: C.text, marginBottom: 2 }}>{result.name}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginBottom: 10 }}>{result.category} · {result.markets.join(", ")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 10 }}>
                    {[["Ingredients", result.ingredientCount], ["Suppliers", result.suppliers], ["Markets", result.markets.length], ["Claims", result.claims.length]].map(([l, v]) => (
                      <div key={l} style={{ background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 11px" }}>
                        <div style={{ fontSize: 20, fontFamily: serif, color: C.text }}>{v}</div>
                        <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase" }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {result.headline && <div style={{ marginTop: 14, fontSize: 13, color: C.text, background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>{result.headline}</div>}
              {result.trustedCase.missing.length > 0 && (
                <div style={{ marginTop: 12, background: C.ink2, border: `1px solid ${C.high}44`, borderRadius: 12, padding: 13 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.high, marginBottom: 6 }}>Missing evidence ({result.trustedCase.missing.length})</div>
                  {result.trustedCase.missing.map((m, i) => <div key={i} style={{ fontSize: 12, color: C.mute, padding: "2px 0" }}>• {m}</div>)}
                </div>
              )}
            </Section>

            {result.ledger.length > 0 && (
              <Section kicker="Assistant" title="Evidence Ledger" icon={FileText}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
                    <thead><tr>{["Evidence", "Source", "Date", "Jurisdiction", "Confidence", "Status"].map((h) => <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, borderBottom: `1px solid ${C.line}`, fontSize: 10.5, textTransform: "uppercase", color: C.faint }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {result.ledger.map((r, i) => {
                        const sc = r.status === "Verified" ? C.pass : r.status === "Missing" ? C.critical : C.high;
                        return (
                          <tr key={i}>
                            <td style={{ padding: "7px 8px", color: C.text, borderBottom: `1px solid ${C.line}22` }}>{r.evidence}</td>
                            <td style={{ padding: "7px 8px", color: C.mute, borderBottom: `1px solid ${C.line}22` }}>{r.source}</td>
                            <td style={{ padding: "7px 8px", color: C.mute, borderBottom: `1px solid ${C.line}22` }}>{r.date}</td>
                            <td style={{ padding: "7px 8px", color: C.mute, borderBottom: `1px solid ${C.line}22` }}>{r.jurisdiction}</td>
                            <td style={{ padding: "7px 8px", color: C.mute, borderBottom: `1px solid ${C.line}22` }}>{r.confidence}%</td>
                            <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.line}22` }}><span style={{ color: sc, fontWeight: 700, fontSize: 11.5 }}>{r.status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            <Section kicker="Analyst + Guardian" title="Unified Assessment Pack" icon={Layers}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {LANES.map((lane) => {
                  const { n, worst } = laneCount(lane.id);
                  const on = openLane === lane.id; const LI = lane.icon;
                  return (
                    <button key={lane.id} onClick={() => setOpenLane(lane.id)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: on ? `linear-gradient(180deg, ${C.panel2}, ${C.panel})` : C.ink2, border: `1px solid ${on ? C.gold : C.line}`, borderRadius: 10, padding: "8px 11px" }}>
                      <LI size={14} color={on ? C.gold : C.mute} />
                      <span style={{ fontSize: 12, color: on ? C.text : C.mute, fontWeight: on ? 700 : 500 }}>{lane.label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: n ? SEV[worst].c : C.pass, background: (n ? SEV[worst].c : C.pass) + "22", borderRadius: 999, padding: "1px 7px" }}>{n || "✓"}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(result.assessments[openLane] || []).length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>No findings in this lane.</div>}
                {(result.assessments[openLane] || []).map((x, i) => (
                  <div key={i} style={{ background: C.ink2, border: `1px solid ${SEV[x.sev].c}33`, borderLeft: `3px solid ${SEV[x.sev].c}`, borderRadius: 10, padding: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{x.title}</div>
                        <div style={{ fontSize: 11.5, color: C.gold, marginTop: 2 }}>{x.ing}</div>
                      </div>
                      <Chip sev={x.sev} />
                    </div>
                    <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, lineHeight: 1.5 }}>{x.detail}</div>
                    {x.fix && <div style={{ marginTop: 9, background: C.teal + "12", border: `1px solid ${C.teal}33`, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: C.text, lineHeight: 1.45 }}><b style={{ color: C.teal }}>Co-Pilot fix — </b>{x.fix}</div>}
                  </div>
                ))}
              </div>
            </Section>

            <Section kicker="Orchestrator + Guardian" title="Risk Decision & Release Recommendation" icon={Gavel}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                <RiskGauge risk={result.decision.risk} />
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.gold, fontWeight: 700, marginBottom: 6 }}>Recommendation</div>
                  <div style={{ fontSize: 14, color: C.text, lineHeight: 1.55 }}>{result.decision.recommendation}</div>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 10, lineHeight: 1.5 }}><b style={{ color: C.mute }}>Rationale:</b> {result.decision.rationale}</div>
                </div>
              </div>
              <div style={{ marginTop: 16, background: `linear-gradient(90deg, ${C.gold}18, transparent)`, border: `1px solid ${C.gold}44`, borderRadius: 12, padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: C.gold + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><User size={18} color={C.gold} /></div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>Human sign-off required — release is never autonomous</div>
                  <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>Regulatory Affairs, Toxicology and Quality accept or reject risk. The agent presents evidence; the human decides and owns the record.</div>
                </div>
              </div>
            </Section>

            <Section kicker="Assistant + Tasker" title="Regulatory Registration Documents" icon={FileText}>
              <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 14, lineHeight: 1.5 }}>
                Generate a drafting aid for each target market's registration or notification submission, pre-filled from this Trusted Case and assessment. Every document is a starting point for Regulatory Affairs — not a filing.
              </div>

              {criticalRegFindings().some((x) => x.sev === "critical") && !regOverride ? (
                <div style={{ background: C.critical + "14", border: `1px solid ${C.critical}55`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <AlertCircle size={16} color={C.critical} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Resolve critical findings before generating registration documents</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                    {criticalRegFindings().filter((x) => x.sev === "critical").map((x, i) => (
                      <div key={i} style={{ fontSize: 12, color: C.mute }}>• {x.ing} — {x.title}</div>
                    ))}
                  </div>
                  <button onClick={() => setRegOverride(true)} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.mute, borderRadius: 9, padding: "8px 13px", fontSize: 12, cursor: "pointer" }}>
                    Generate anyway (draft only)
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <span style={fieldLabel}>Jurisdictions</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 6 }}>
                      {MARKET_OPTIONS.map((j) => {
                        const on = regJurisdictions.includes(j);
                        return (
                          <button key={j} onClick={() => toggleRegJurisdiction(j)} style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, background: on ? C.teal + "22" : "transparent", color: on ? C.teal : C.mute, border: `1px solid ${on ? C.teal : C.line}` }}>{j}</button>
                        );
                      })}
                    </div>
                  </div>

                  {regJurisdictions.includes("ASEAN") && (
                    <div style={{ marginBottom: 14, background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
                      <span style={fieldLabel}>ASEAN member states (notification is filed per state)</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {ASEAN_STATES.map((s) => {
                          const on = regAseanStates.includes(s);
                          return (
                            <button key={s} onClick={() => toggleAseanState(s)} style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 999, background: on ? C.gold + "22" : "transparent", color: on ? C.gold : C.mute, border: `1px solid ${on ? C.gold : C.line}` }}>{s}</button>
                          );
                        })}
                      </div>
                      {regAseanStates.length === 0 && <div style={{ fontSize: 11, color: C.high, marginTop: 8 }}>Select at least one member state to generate an ASEAN notification document.</div>}
                    </div>
                  )}

                  {regOverride && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.high, marginBottom: 12 }}>
                      <AlertCircle size={13} color={C.high} /> Generating despite unresolved critical findings — draft only.
                    </div>
                  )}

                  <button
                    onClick={generateRegistrationDocs}
                    disabled={!regJurisdictions.length || (regJurisdictions.includes("ASEAN") && regJurisdictions.length === 1 && !regAseanStates.length)}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: !regJurisdictions.length ? C.panel2 : `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`, color: !regJurisdictions.length ? C.mute : C.ink, border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: !regJurisdictions.length ? "default" : "pointer" }}
                  >
                    <Download size={15} /> Generate registration documents
                  </button>
                </>
              )}

              {regFiles.length > 0 && (
                <div style={{ marginTop: 18, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.faint, fontWeight: 700, marginBottom: 10 }}>
                    {regFiles.length} document{regFiles.length > 1 ? "s" : ""} ready — download each individually
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {regFiles.map((f, i) => {
                      const jc = { EU: C.teal, UK: C.medium, US: C.gold, China: C.critical, ASEAN: C.high }[f.jurisdiction] || C.mute;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: C.ink2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: jc, background: jc + "1a", border: `1px solid ${jc}55`, borderRadius: 999, padding: "3px 10px", flexShrink: 0 }}>{f.jurisdiction}</span>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{f.docLabel}</div>
                            <div style={{ fontSize: 10.5, color: C.faint }}>{f.filename}</div>
                          </div>
                          <button onClick={() => triggerDownload(f.filename, f.html)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.line}`, color: C.text, borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                            <Download size={13} /> Download
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {regLog.length > 0 && (
                <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.faint, fontWeight: 700, marginBottom: 8 }}>Generation log</div>
                  {regLog.map((entry, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: C.mute, marginBottom: 8 }}>
                      <div style={{ color: C.faint }}>{entry.time}</div>
                      {entry.files.map((f, fi) => <div key={fi} style={{ paddingLeft: 8 }}>• {f}</div>)}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        <div style={{ fontSize: 10.5, color: C.faint, textAlign: "center", marginTop: 26, lineHeight: 1.6 }}>
          Formulations and findings are AI-generated drafts grounded in EU 1223/2009, UK Cosmetics Regulations, US FDA / MoCRA, China CSAR, ASEAN, REACH and IFRA. Generated formulas are starting points for laboratory development, and every output requires human validation against official sources before any launch decision.
        </div>
      </div>


      <style>{`
        .spin{animation:sp 1s linear infinite}
        @keyframes sp{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.spin{animation:none}}
      `}</style>
    </div>
  );
}
