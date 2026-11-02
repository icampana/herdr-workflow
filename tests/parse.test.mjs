import assert from "node:assert/strict";
import test from "node:test";
import {
  sections, parseStats, parseObservations, parseHealth, parseCodegraph, parseSavings, parseObservationBody, ago,
} from "../mods/agent-workflow/parse.js";
import { shellArgs } from "../mods/agent-workflow/scripts.js";

test("sections ignores shell noise before the first marker and strips colours", () => {
  const s = sections("Welcome to zsh\n\u001b[32mhi\u001b[0m\n@@root\n/repo\n@@ctx\n\u001b[1mcontext-mode\u001b[0m  ●  1 MB kept out\n@@end\n");
  assert.deepEqual(Object.keys(s), ["root", "ctx", "end"]);
  assert.equal(s.root, "/repo");
  assert.equal(s.ctx, "context-mode  ●  1 MB kept out");
});

test("parseStats reads engram stats", () => {
  assert.deepEqual(parseStats("Engram Memory Stats\n  Sessions:     419\n  Observations: 288\n  Prompts:      745\n"),
    { sessions: 419, observations: 288, prompts: 745 });
  assert.deepEqual(parseStats(undefined), {});
});

test("parseObservations takes the Recent Observations rows only, capped", () => {
  const text = [
    "### Recent User Prompts", "- [decision] **not an observation**: x",
    "### Recent Observations",
    "- [decision] **DTN-1 + verify-first: merged (2026-10-31)**: What: ...",
    "Why: a continuation line",
    "- [session_summary] **Session summary: repo**: Goal: ...",
  ].join("\n");
  assert.deepEqual(parseObservations(text), [
    { type: "decision", title: "DTN-1 + verify-first: merged (2026-10-31)" },
    { type: "session_summary", title: "Session summary: repo" },
  ]);
  assert.equal(parseObservations(text, 1).length, 1);
});

test("parseHealth lists only the checks that are not ok", () => {
  const h = parseHealth(JSON.stringify({ status: "error", summary: { total: 3, ok: 2 }, checks: [
    { check_id: "a", result: "ok", message: "fine" }, { check_id: "b", result: "error", message: "36 finding(s)" }] }));
  assert.equal(h.status, "error");
  assert.deepEqual(h.problems, [{ id: "b", result: "error", message: "36 finding(s)" }]);
});

test("parseHealth turns a missing engram into an error row, not a crash", () => {
  const h = parseHealth("zsh: command not found: engram");
  assert.equal(h.status, "unknown");
  assert.match(h.problems[0].message, /command not found/);
});

test("parseCodegraph: indexed, not indexed, and not installed", () => {
  const g = parseCodegraph(JSON.stringify({ initialized: true, lastIndexed: "2026-11-02T14:01:13Z", fileCount: 3, nodeCount: 4, edgeCount: 5,
    pendingChanges: { added: 1, modified: 2, removed: 0 }, index: { state: "complete", reindexRecommended: false } }));
  assert.deepEqual({ files: g.files, pending: g.pending, state: g.state, reindex: g.reindex }, { files: 3, pending: 3, state: "complete", reindex: false });
  assert.deepEqual(parseCodegraph(JSON.stringify({ initialized: false })), { indexed: false });
  assert.match(parseCodegraph("").error, /no answer/);
});

test("parseSavings keeps the figures after the label", () => {
  assert.equal(parseSavings("context-mode  ●  125 MB kept out  ·  554 KB/day"), "125 MB kept out  ·  554 KB/day");
  assert.equal(parseSavings(""), null);
});

test("parseObservationBody splits the body from the trailing metadata", () => {
  const result = "#7 [decision] Title here\nWhat: a\nWhy: b\nSession: s1\nProject: repo\nCreated: 2026-11-02 14:00:31";
  const raw = JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify({ project: "repo", result }) }] } });
  const o = parseObservationBody(raw);
  assert.equal(o.head, "#7 [decision] Title here");
  assert.equal(o.body, "What: a\nWhy: b");
  assert.deepEqual(o.meta, [["Session", "s1"], ["Project", "repo"], ["Created", "2026-11-02 14:00:31"]]);
});

test("ago", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(ago("2026-11-02T11:58:00Z", now), "2 min ago");
  assert.equal(ago("2026-11-02T09:00:00Z", now), "3 h ago");
  assert.equal(ago("2026-10-28T12:00:00Z", now), "5 days ago");
  assert.equal(ago("garbage", now), "unknown");
});

test("shellArgs passes every argument as a positional parameter", () => {
  assert.deepEqual(shellArgs("S", "/a b", "it's"), ["-c", 'exec "${SHELL:-/bin/sh}" -lic "$1" workflow "$2" "$3" </dev/null', "sh", "S", "/a b", "it's"]);
});
