// One engram observation, in full, in a dialog the panel opens
// (props.observation: { title, type, project, cwd, on }). Runs on the pane's
// machine, like the panel.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { exec, theme, closeOverlay } from "herdr";
import { sections, stripAnsi, parseObservationBody } from "./parse.js";
import { OBSERVATION_SCRIPT, shellArgs } from "./scripts.js";
import { MOD } from "./mod-name.js";

export class Observation {
  init(cx, p) {
    this.p = p.observation ?? {};
    this.overlay = p.overlay;
    this.data = null; this.error = null;
    cx.spawn(async (cx) => {
      try {
        const { cwd, project, title, on } = this.p;
        const r = await exec("/bin/sh", shellArgs(OBSERVATION_SCRIPT, cwd ?? "", project ?? "", title ?? ""), on ? { on } : {});
        const s = sections(r.stdout);
        if (s.error !== undefined) throw new Error(s.error);
        if (s.end === undefined || !s.body) throw new Error((stripAnsi(r.stderr) || "engram gave no answer").trim().slice(0, 200));
        this.data = { id: s.id, ...parseObservationBody(s.body) };
      } catch (e) { this.error = `Could not open this observation: ${e?.message ?? e}`; }
      finally { cx.notify(); }
    });
  }

  render() {
    const t = theme(), d = this.data, p = this.p;
    const close = div().id("obs-close").p(4).rounded(6).cursor_pointer().text_color(t.muted).tooltip("Close (Esc)")
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => closeOverlay(this.overlay))
      .child(svg(`mods/${MOD}/icons/close.svg`).size(14));
    const header = h_flex().flex_none().px(16).py(12).gap(10).items_start().border_b(1).border_color(t.border)
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(h_flex().gap(8).text_size(11).text_color(t.muted)
          .child(div().child(p.type ?? "observation"))
          .when(Boolean(d?.id), (el) => el.child(div().child(`#${d.id}`)))
          .child(div().child(p.on ? `${p.on}: ${p.project}` : p.project ?? "")))
        .child(div().text_size(15).font_semibold().child(p.title ?? "")))
      .child(close);
    let body;
    if (this.error) body = div().p(16).text_color(t.dim).child(this.error);
    else if (!d) body = div().p(16).text_color(t.dim).child("Reading…");
    else body = div().id("obs-scroll").flex_1().min_h(0).overflow_y_scrollbar()
      .child(v_flex().px(16).py(12).gap(14)
        .child(div().text_size(13).text_color(t.foreground).child(TextView.markdown("obs-md", d.body || "(empty)").selectable(true)))
        .child(v_flex().gap(2).pt(8).border_t(1).border_color(t.border).children(d.meta.map(([k, v]) => h_flex().gap(8).text_size(11)
          .child(div().w(90).flex_none().text_color(t.dim).child(k))
          .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(v))))));
    return v_flex().id("observation").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .child(header).child(body);
  }
}
