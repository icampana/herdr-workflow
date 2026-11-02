// Runs the panel's real scripts against the real tools, the way Herdr does:
// /bin/sh -> the login shell -> engram, codegraph, context-mode. Unit tests
// cannot show that a machine's PATH finds the tools; this does.
//
//   npm run smoke -- <repo folder> [--on <ssh host>]
//
// Its own control: a folder that does not exist must come back as @@error.
// A run that prints every section but never fails that control proves nothing.
import { spawnSync } from "node:child_process";
import { sections, parseStats, parseObservations, parseHealth, parseCodegraph, parseSavings, parseObservationBody } from "../mods/agent-workflow/parse.js";
import { STATUS_SCRIPT, OBSERVATION_SCRIPT, shellArgs } from "../mods/agent-workflow/scripts.js";

const argv = process.argv.slice(2);
const at = argv.indexOf("--on");
const on = at >= 0 ? argv.splice(at, 2)[1] : null;
const folder = argv[0];
if (!folder) { console.error("usage: npm run smoke -- <repo folder> [--on <ssh host>]"); process.exit(2); }

const quote = (a) => `'${String(a).replace(/'/g, `'\\''`)}'`;
function run(script, ...args) {
  const sh = shellArgs(script, ...args);
  const r = on
    ? spawnSync("ssh", ["-o", "BatchMode=yes", on, ["/bin/sh", ...sh].map(quote).join(" ")], { encoding: "utf8" })
    : spawnSync("/bin/sh", sh, { encoding: "utf8" });
  if (r.error) throw r.error;
  return sections(r.stdout);
}

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`); if (!ok) failed++; };
const where = on ? `${on}:${folder}` : folder;

const control = run(STATUS_SCRIPT, "/no/such/folder/herdr-workflow-smoke");
check("control: a missing folder is reported as @@error", control.error !== undefined, control.error);

const s = run(STATUS_SCRIPT, folder);
check(`status script finished in ${where}`, s.end !== undefined && s.error === undefined, s.error);
const project = (s.root ?? "").split("/").pop();
const stats = parseStats(s.stats), health = parseHealth(s.doctor), graph = parseCodegraph(s.graph), observations = parseObservations(s.context);
check("engram stats", Number.isFinite(stats.observations), `${stats.observations} observations in ${project}`);
check("engram doctor", health.status !== "unknown", `${health.status}${health.problems.length ? `, ${health.problems.map((p) => p.id).join(", ")}` : ""}`);
check("codegraph status", !graph.error, graph.error ?? (graph.indexed ? `${graph.state}, ${graph.files} files` : "answered, not indexed"));
check("context-mode statusline", Boolean(parseSavings(s.ctx)), parseSavings(s.ctx) ?? "");

if (observations.length) {
  const o = run(OBSERVATION_SCRIPT, s.root, project, observations[0].title);
  let body = null;
  try { body = parseObservationBody(o.body); } catch { /* reported below */ }
  check("full text of the newest observation", Boolean(o.id && body), o.error ?? `#${o.id}, ${body?.body.length ?? 0} chars`);
  const miss = run(OBSERVATION_SCRIPT, s.root, project, "herdr-workflow smoke: no such title");
  check("control: an unknown title is reported as @@error", miss.error !== undefined, miss.error);
} else {
  check("full text of the newest observation", true, "skipped: no observations in this project");
}

process.exit(failed ? 1 : 0);
