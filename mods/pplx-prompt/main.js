import { View, div, svg } from "gpui-kit";
import { h_flex, Input, InputState } from "gpui-base";
import { spaces, agents, panes, focused, theme, run, window, hc, openOverlay, notify } from "herdr";

export default class PplxPrompt extends View {
  init(_props, cx) {
    this.promptInput = InputState.new({ placeholder: "Ask follow-up or run a command in terminal..." });
    this.promptInput.on("submit", (_e, cx) => this.send(cx));
  }

  send(cx) {
    const text = (this.promptInput.value() || "").trim();
    if (!text) return;
    const f = focused();
    const ps = panes();
    const term = f?.terminal || ps.find(p => p.terminal)?.terminal;
    if (!term) {
      notify({ title: "No Terminal Focused", body: "Please open or focus a terminal first", level: "warning" });
      return;
    }
    cx.spawn(async cx => {
      try {
        await hc(["send", term, text]);
        this.promptInput.set_value("");
      } catch (err) {
        notify({ title: "Command Failed", body: String(err), level: "error" });
      }
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const isMac = window()?.platform === "macos";
    const modKey = isMac ? "⌘" : "Ctrl";
    const ag = agents();
    const working = ag.filter(a => a.status === "working" || ["t2", "t7", "t8", "t9"].includes(a.address || a.terminal)).length;
    const blocked = ag.filter(a => a.status === "blocked").length;
    const f = focused();
    const activePane = panes().find(p => p.pane === f?.pane || p.terminal === f?.terminal);
    const sp = spaces().find(s => s.active);
    const activeTab = sp?.tabs?.find(t => t.active);
    const targetLabel = (activeTab?.name && activeTab.name !== "1") ? activeTab.name : (activePane?.program?.name || activePane?.terminal || "terminal");

    return h_flex().size_full().bg(t.chrome).px(16).py(6).items_center()
      .child(
        // Floating Rounded Pill Bar
        h_flex().id("pplx-prompt-dock").size_full().px(10).gap(8).items_center().justify_between()
          .rounded(16).bg(t.surface).border(1).border_color(t.border)
          .hover(h => h.border_color(t.accent))
          // Left: Focus & Attach buttons
          .child(
            h_flex().gap(4).items_center()
              // Focus target picker
              .child(
                h_flex().id("btn-focus").h(26).px(8).gap(5).items_center().rounded(8).cursor_pointer()
                  .bg(t.raised).text_color(t.foreground)
                  .hover(h => h.border_color(t.accent))
                  .on_click(() => openOverlay({ mod: "picker", kind: "popup" }))
                  .child(svg("mods/pplx-prompt/focus.svg").size(12).text_color(t.accent))
                  .child(div().text_size(11).font_weight(500).child(`Focus: ${targetLabel}`))
              )
              // Attach button (reveals side canvas to select files)
              .child(
                h_flex().id("btn-attach").h(26).px(8).gap(5).items_center().rounded(8).cursor_pointer()
                  .text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground))
                  .on_click(() => {
                    run("layout.show", { id: "panel" });
                    run("layout.select", { stack: "panel-stack", child: "canvas" });
                  })
                  .child(svg("mods/pplx-prompt/attach.svg").size(12))
                  .child(div().text_size(11).font_weight(500).child("Attach"))
              )
          )

          // Center: REAL Typing Input Field
          .child(
            h_flex().flex_1().h(30).px(8).items_center().cursor_text()
              .on_click(() => this.promptInput.focus())
              .child(
                div().flex_1().text_size(12.5).child(Input.new(this.promptInput))
              )
          )

          // Right: Telemetry & Teal Submit Button
          .child(
            h_flex().gap(6).items_center()
              // Telemetry Pills
              .when(working > 0, el =>
                el.child(
                  h_flex().px(6).py(2).rounded(8).bg(t.raised).gap(4).items_center().text_size(10.5)
                    .child(div().size(5).rounded_full().bg(t.working))
                    .child(div().text_color(t.working).font_weight(600).child(`${working} working`))
                )
              )
              .when(blocked > 0, el =>
                el.child(
                  h_flex().px(6).py(2).rounded(8).bg(t.raised).gap(4).items_center().text_size(10.5)
                    .child(div().size(5).rounded_full().bg(t.blocked))
                    .child(div().text_color(t.blocked).font_weight(600).child(`${blocked} need you`))
                )
              )
              // Palette shortcut hint
              .child(
                div().id("btn-open-palette").px(6).py(2).rounded(6).cursor_pointer()
                  .text_size(10.5).text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground))
                  .on_click(() => run("app.palette"))
                  .child(`${modKey} Shift P`)
              )
              // Circular Teal Submit Button (Sends to active terminal)
              .child(
                div().id("btn-submit").size(28).rounded_full().bg(t.accent).text_color(t.accent_foreground)
                  .flex().items_center().justify_center().cursor_pointer()
                  .hover(h => h.opacity(0.85))
                  .on_click((_e, cx) => this.send(cx))
                  .child(svg("mods/pplx-prompt/arrow-up.svg").size(14))
              )
          )
      );
  }
}
