// Turning the CLIs' output into the panel's state. Pure functions, no Herdr
// imports, so `npm test` covers them with Node.

const MAX_OBSERVATIONS = 8;

export const stripAnsi = (text) => String(text ?? "").replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");

// `@@name` lines start sections; lines before the first one are dropped.
export function sections(text) {
  const out = {};
  let name = null;
  for (const line of stripAnsi(text).split("\n")) {
    const m = /^@@(\w+)$/.exec(line.trim());
    if (m) { name = m[1]; out[name] = []; continue; }
    if (name) out[name].push(line);
  }
  for (const key of Object.keys(out)) out[key] = out[key].join("\n").trim();
  return out;
}

export function parseStats(text) {
  const out = {};
  for (const name of ["Sessions", "Observations", "Prompts"]) {
    const m = new RegExp(`${name}:\\s+(\\d+)`).exec(String(text ?? ""));
    if (m) out[name.toLowerCase()] = Number(m[1]);
  }
  return out;
}

// `engram context` is Markdown: "Recent Observations" lists `- [type] **title**: body`.
export function parseObservations(text, max = MAX_OBSERVATIONS) {
  const section = String(text ?? "").split("### Recent Observations")[1] ?? "";
  const rows = [];
  for (const line of section.split("\n")) {
    const m = /^- \[([\w-]+)\] \*\*(.+?)\*\*/.exec(line);
    if (m) rows.push({ type: m[1], title: m[2] });
    if (rows.length >= max) break;
  }
  return rows;
}

export function parseHealth(text) {
  try {
    const d = JSON.parse(text);
    return { status: d.status, summary: d.summary,
      problems: (d.checks ?? []).filter((c) => c.result !== "ok").map((c) => ({ id: c.check_id, result: c.result, message: c.message })) };
  } catch {
    return { status: "unknown", summary: null,
      problems: [{ id: "doctor", result: "error", message: (text || "engram doctor gave no answer (is engram installed there?)").slice(0, 200) }] };
  }
}

export function parseCodegraph(text) {
  try {
    const s = JSON.parse(text);
    if (!s.initialized) return { indexed: false };
    const p = s.pendingChanges ?? {};
    return { indexed: true, last: s.lastIndexed, files: s.fileCount, symbols: s.nodeCount, edges: s.edgeCount,
      pending: (p.added ?? 0) + (p.modified ?? 0) + (p.removed ?? 0), state: s.index?.state ?? "unknown",
      reindex: Boolean(s.index?.reindexRecommended) };
  } catch { return { indexed: false, error: (text || "codegraph gave no answer (is it installed there?)").slice(0, 160) }; }
}

// context-mode's statusline: "context-mode  ●  125 MB kept out  ·  ...".
export const parseSavings = (text) => String(text ?? "").split("\n")[0].replace(/^context-mode\s*●?\s*/, "").trim() || null;

// One mem_get_observation answer (the last JSON-RPC line): a JSON string whose
// `result` is "#id [type] title\nbody…\nSession: …\nProject: …". The body
// stays Markdown; the trailing `Key: value` lines become metadata.
export function parseObservationBody(raw) {
  const text = JSON.parse(JSON.parse(raw).result.content[0].text).result;
  const lines = text.split("\n");
  const meta = [];
  while (lines.length && /^(Session|Project|Scope|Topic|Duplicates|Revisions|Created|Updated|Review after): /.test(lines[lines.length - 1])) {
    meta.unshift(lines.pop());
  }
  const head = lines.shift() ?? "";
  return { head, body: lines.join("\n").trim(), meta: meta.map((l) => { const i = l.indexOf(": "); return [l.slice(0, i), l.slice(i + 2)]; }) };
}

export function ago(iso, now = Date.now()) {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 2880) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}
