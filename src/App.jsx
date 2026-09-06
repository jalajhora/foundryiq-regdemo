import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  UploadCloud, FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon,
  X, Loader2, FlaskConical, Leaf, Tag, Truck, Gavel,
  AlertCircle, CheckCircle2, User, Fingerprint, Layers, Sparkles, Beaker, Download,
} from "lucide-react";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

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

/* System prompt lives server-side in api/assess.js — never shipped to the browser. */

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
  const [dragOver, setDragOver] = useState(false);
  const [rawDump, setRawDump] = useState(null);
  const inputRef = useRef(null);

  const addFiles = useCallback((list) => {
    const incoming = Array.from(list).map((file) => ({
      id: Math.random().toString(36).slice(2), name: file.name,
      size: file.size, kind: kindFor(file.name), file,
    }));
    setFiles((prev) => [...prev, ...incoming]);
    setError(null);
  }, []);

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };
  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const toggleMarket = (m) => setMarkets((p) => p.includes(m) ? p.filter((x) => x !== m) : [...p, m]);
  const reset = () => {
    setPhase("idle"); setActiveStep(-1); setResult(null); setError(null); setOpenLane("regulatory"); setRawDump(null);
    setRegJurisdictions([]); setRegAseanStates([]); setRegOverride(false); setRegLog([]); setRegFiles([]);
  };

  async function buildFilesPayload() {
    const payload = [];
    for (const f of files) {
      if (f.kind === "pdf") {
        payload.push({ type: "pdf", name: f.name, data: await readAsBase64(f.file) });
      } else if (f.kind === "image") {
        const mt = /\.png$/i.test(f.name) ? "image/png" : /\.gif$/i.test(f.name) ? "image/gif" : /\.webp$/i.test(f.name) ? "image/webp" : "image/jpeg";
        payload.push({ type: "image", name: f.name, data: await readAsBase64(f.file), mediaType: mt });
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
    const tick = setInterval(() => setActiveStep((s) => (s < STEPS.length - 1 ? s + 1 : s)), 1600);

    try {
      const filesPayload = await buildFilesPayload();
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
    <div style="font-size:11px;color:#B7C4D6;margin-top:4px">Regulatory &amp; Environmental Assessment — Product Information File</div>
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
            <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }}>FoundryIQ <span style={{ color: C.gold }}>·</span> PIF Assessment</div>
            <div style={{ fontSize: 11.5, color: C.mute }}>Upload a Product Information File — agents extract the formulation, assess it, and recommend a decision</div>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{ cursor: "pointer", borderRadius: 16, padding: "34px 20px", textAlign: "center", marginBottom: 14, background: dragOver ? C.panel2 : `linear-gradient(180deg, ${C.panel}, ${C.ink2})`, border: `1.5px dashed ${dragOver ? C.teal : C.line}`, transition: "all .2s" }}
        >
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp" style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
          <UploadCloud size={30} color={dragOver ? C.teal : C.gold} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginTop: 10 }}>Drop your Product Information File here</div>
          <div style={{ fontSize: 12, color: C.mute, marginTop: 4 }}>or click to browse — PDF, Word, Excel, CSV, or images. Add the formula sheet, SDS, IFRA certificates, claims brief, and supplier specs.</div>
        </div>

        {files.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 8, marginBottom: 18 }}>
            {files.map((f) => {
              const I = iconFor(f.name);
              const bad = f.kind === "unsupported";
              return (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.ink2, border: `1px solid ${bad ? C.critical + "66" : C.line}`, borderRadius: 10, padding: "9px 11px" }}>
                  <I size={18} color={bad ? C.critical : C.teal} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: 10.5, color: bad ? C.critical : C.faint }}>{bad ? "Unsupported type" : `${f.kind.toUpperCase()} · ${fmtSize(f.size)}`}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(f.id); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.faint, display: "flex" }}><X size={15} /></button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.ink2})`, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Beaker size={15} color={C.teal} />
            <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.teal, fontWeight: 700 }}>Context (optional — agents infer what you leave blank)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label><span style={fieldLabel}>Product name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank to extract from the file" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Category</span><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Leave-on facial serum" style={inputStyle} /></label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={fieldLabel}>Target markets</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 6 }}>
              {MARKET_OPTIONS.map((m) => {
                const on = markets.includes(m);
                return <button key={m} onClick={() => toggleMarket(m)} style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, background: on ? C.teal + "22" : "transparent", color: on ? C.teal : C.mute, border: `1px solid ${on ? C.teal : C.line}` }}>{m}</button>;
              })}
            </div>
          </div>
          <label><span style={fieldLabel}>Intended claims</span><input value={claims} onChange={(e) => setClaims(e.target.value)} placeholder="e.g. Anti-aging, Brightening, Natural" style={inputStyle} /></label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", marginBottom: error ? 12 : 22 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{files.length ? `${files.length} document${files.length > 1 ? "s" : ""} ready` : "No documents yet"}</div>
            <div style={{ fontSize: 11.5, color: C.mute }}>The Assistant reads every file, builds a Trusted Case, and the Analyst + Guardian assess it. Output is a draft for human validation.</div>
          </div>
          {phase !== "idle" && <button onClick={reset} style={{ background: "transparent", color: C.mute, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 12px", fontSize: 12, cursor: "pointer" }}>Reset</button>}
          <button onClick={run} disabled={phase === "running"} style={{ display: "flex", alignItems: "center", gap: 8, background: phase === "running" ? C.panel2 : `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`, color: phase === "running" ? C.mute : C.ink, border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: phase === "running" ? "default" : "pointer", whiteSpace: "nowrap" }}>
            {phase === "running" ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            {phase === "running" ? "Assessing…" : phase === "done" ? "Re-run assessment" : "Assess PIF"}
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

        {phase !== "idle" && (
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
          Findings are AI-generated drafts grounded in EU 1223/2009, UK Cosmetics Regulations, US FDA / MoCRA, REACH and IFRA — illustrative and requiring human validation against official sources before any release decision.
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
