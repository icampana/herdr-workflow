// herdr-workflow: the agent tooling of the focused pane's repo, on whichever
// machine that pane runs (this computer or an ssh machine). engram (health,
// counts, latest observations, each one opens in full), codegraph (index
// state) and context-mode (what it kept out of the context window). Read-only.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, spaces, panes, focused, props, openOverlay } from "herdr";
import { sections, stripAnsi, parseStats, parseObservations, parseHealth, parseCodegraph, parseSavings, ago } from "./parse.js";
import { STATUS_SCRIPT, shellArgs } from "./scripts.js";
import { Observation } from "./observation.js";
import { MOD } from "./mod-name.js";

const REFRESH_MS = 60000;

// The focused pane's folder and machine (null: this computer).
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}

export default class Workflow extends View {
  init(_props, cx) {
    // The same mod draws the dialog for one observation (opened from a row).
    const p = props() ?? {};
    if (p.observation) { this.dialog = new Observation(); this.dialog.init(cx, p); return; }
    this.state = null; this.error = null; this.loading = false; this.context = null;
    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    // The focused pane can change folder or machine: check cheaply, read again only then.
    cx.timer.every(2000, (cx) => { if (JSON.stringify(location()) !== this.context) this.refresh(cx); });
  }

  refresh(cx) {
    if (this.loading) return;
    const where = location();
    this.context = JSON.stringify(where);
    if (!where.cwd) { this.state = null; this.error = "No focused pane."; cx.notify(); return; }
    this.loading = true; cx.notify();
    const context = this.context;
    cx.spawn(async (cx) => {
      try {
        const result = await exec("/bin/sh", shellArgs(STATUS_SCRIPT, where.cwd), where.on ? { on: where.on } : {});
        if (context !== this.context) return;
        const s = sections(result.stdout);
        if (s.error !== undefined) throw new Error(s.error);
        if (s.end === undefined) throw new Error((stripAnsi(result.stderr) || "the script did not finish").trim().slice(0, 200));
        const root = s.root || where.cwd;
        this.state = { project: root.split("/").pop(), root, machine: where.on, health: parseHealth(s.doctor),
          stats: parseStats(s.stats), observations: parseObservations(s.context),
          codegraph: parseCodegraph(s.graph), savings: parseSavings(s.ctx), at: new Date() };
        this.error = null;
      } catch (e) {
        this.error = `Could not read the tools${where.on ? ` on ${where.on}` : ""}: ${e?.message ?? e}`;
      } finally {
        this.loading = false; cx.notify();
      }
    });
  }

  open(o) {
    const s = this.state;
    openOverlay({ mod: MOD, kind: "dialog", width: 760, height: 560,
      props: { observation: { title: o.title, type: o.type, project: s.project, cwd: s.root, on: s.machine } } });
  }

  render(cx) {
    if (this.dialog) return this.dialog.render(cx);
    const t = theme(), s = this.state;
    const title = (text) => div().pt(18).pb(6).text_size(11).font_semibold().text_color(t.muted).child(text);
    const row = (label, value, color) => h_flex().py(3).gap(8)
      .child(div().w(110).flex_none().text_color(t.dim).child(label))
      .child(div().flex_1().min_w(0).truncate().text_color(color ?? t.foreground).child(String(value)));
    const bad = t.blocked ?? t.ansi1;
    const tone = (status) => status === "ok" ? t.ansi2 : status === "unknown" ? t.dim : bad;

    const header = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("Workflow"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim)
        .child(s ? (s.machine ? `${s.machine}: ${s.project}` : s.project) : ""))
      .child(div().id("workflow-refresh").p(4).rounded(6).cursor_pointer().text_color(t.muted).tooltip("Read again")
        .hover((st) => st.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.refresh(cx))
        .child(svg(`mods/${MOD}/icons/refresh.svg`).size(14)));

    let body;
    if (this.error) body = div().p(14).text_color(t.dim).child(this.error);
    else if (!s) body = div().p(14).text_color(t.dim).child("Reading…");
    else {
      const h = s.health, g = s.codegraph;
      body = div().id("workflow-scroll").flex_1().min_h(0).overflow_y_scrollbar().child(v_flex().px(16).pb(16)
        .child(title("ENGRAM"))
        .child(row("Health", h.summary ? `${h.status} · ${h.summary.ok}/${h.summary.total} checks ok` : h.status, tone(h.status)))
        .children(h.problems.map((p) => row(p.result, `${p.id}: ${p.message}`, tone(p.result))))
        .child(row("Observations", s.stats.observations ?? "?"))
        .child(row("Sessions", s.stats.sessions ?? "?"))
        .child(row("Prompts", s.stats.prompts ?? "?"))
        .child(title("LATEST OBSERVATIONS"))
        .children(s.observations.length ? s.observations.map((o, i) => h_flex().id(`obs-${i}`).py(3).px(4).mx(-4).gap(8).rounded(4)
          .cursor_pointer().hover((st) => st.bg(t.hover)).on_click(() => this.open(o))
          .child(div().w(90).flex_none().text_size(11).text_color(t.muted).child(o.type))
          .child(div().flex_1().min_w(0).truncate().child(o.title)))
          : [div().text_color(t.dim).child("None for this project.")])
        .child(title("CODEGRAPH"))
        .children(!g.indexed
          ? [row("Index", g.error ?? "Not indexed (codegraph init)", t.dim)]
          : [
            row("Index", g.reindex ? `${g.state} · reindex recommended` : g.state, g.state === "complete" && !g.reindex ? t.ansi2 : bad),
            row("Last indexed", ago(g.last)),
            row("Pending", g.pending ? `${g.pending} changed files` : "none", g.pending ? t.ansi3 : t.foreground),
            row("Graph", `${g.files} files · ${g.symbols} symbols · ${g.edges} edges`),
          ])
        .child(title("CONTEXT-MODE"))
        .child(row("Kept out", s.savings ?? "statusline gave no answer", s.savings ? t.foreground : t.dim))
        .child(div().pt(18).text_size(11).text_color(t.dim).child(`Read ${s.at.toLocaleTimeString()}${this.loading ? " · reading…" : ""}`)));
    }
    return v_flex().id("workflow").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .child(header).child(body);
  }
}
