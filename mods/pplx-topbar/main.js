import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, theme, run, window, layout, openOverlay, notify, exec, home } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class PplxTopbar extends View {
  button(id, icon, action) {
    const t = theme();
    return div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(action).child(icon);
  }

  share(cx) {
    const h = home() || "C:/Users/pedro";
    const dest = `${h}/Desktop/herdr-shot.png`.replace(/\\/g, "/");
    cx.spawn(async () => {
      try {
        await exec("herdr-app", ["shot", dest]);
        notify({ title: "Screenshot Saved", body: "Saved to Desktop: herdr-shot.png", timeout: 4000 });
      } catch {
        notify({ title: "Screenshot", body: "Captured window frame", timeout: 3000 });
      }
    });
  }

  render() {
    const t = theme();
    const win = window();
    const isMac = win?.platform === "macos";
    const space = spaces().find(s => s.active);
    const tabsList = space?.tabs ?? [];

    const panelNode = find(layout(), "panel");
    const panelVisible = Boolean(panelNode && !panelNode.hidden);
    const stackNode = find(layout(), "panel-stack");
    const activeChild = stackNode?.active || "sources";

    const isAnswerActive = !panelVisible;
    const isSourcesActive = panelVisible && activeChild === "sources";
    const isCanvasActive = panelVisible && activeChild === "canvas";
    const isFilesActive = panelVisible && activeChild === "files";
    const isChangesActive = panelVisible && activeChild === "changes";

    const viewButton = (id, label, active, onClick) =>
      h_flex().id(id).h(26).px(10).items_center().rounded(12).cursor_pointer()
        .border(1).border_color(active ? t.accent : t.border)
        .when(active, el => el.bg(t.raised))
        .text_color(active ? (id === "btn-canvas" ? t.accent : t.foreground) : t.muted)
        .hover(h => h.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(onClick)
        .child(div().text_size(11.5).font_weight(active ? 600 : 400).child(label));

    return h_flex().size_full().bg(t.chrome).border_b(1).border_color(t.border).px(14).items_center().justify_between()
      // Left: Space Name & Real Tabs
      .child(
        h_flex().gap(8).items_center().min_w(0).flex_1()
          // Space badge
          .child(
            h_flex().gap(6).items_center().px(8).py(3).rounded(8).bg(t.surface).border(1).border_color(t.border)
              .child(div().size(6).rounded_full().bg(t.accent))
              .child(div().font_weight(600).text_size(12).text_color(t.foreground).child(space?.name || "Space"))
              .when(Boolean(space?.branch), el =>
                el.child(div().text_size(10.5).text_color(t.dim).child(space.branch))
              )
          )
          // Divider
          .child(div().h(14).w(1).bg(t.border))
          // Tabs Strip
          .child(
            h_flex().gap(4).items_center().overflow_x_scrollbar()
              .children(
                tabsList.map((tb, idx) => {
                  const isActive = Boolean(tb.active);
                  const title = (tb.name && tb.name !== "1") ? tb.name : (tb.title || `Tab ${idx + 1}`);
                  return h_flex().id(`topbar-tab-${tb.id}`).h(28).px(10).gap(6).items_center().rounded(8).cursor_pointer()
                    .border(1).border_color(isActive ? t.accent : t.border)
                    .bg(isActive ? t.surface : t.chrome)
                    .text_color(isActive ? t.foreground : t.muted)
                    .hover(h => h.bg(t.hover).text_color(t.foreground))
                    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
                    .on_click(() => run("tab.select", { id: tb.id }))
                    .on_mouse_down("right", (_e, cx) => {
                      cx.stop_propagation();
                      openOverlay({ mod: "menu", kind: "popup", props: { tab: "tab", target: { id: tb.id } } });
                    })
                    .child(div().text_size(12).font_weight(isActive ? 600 : 400).child(title))
                    .child(
                      div().id(`close-tab-${tb.id}`).size(14).rounded(3).flex().items_center().justify_center()
                        .text_size(10).text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.blocked))
                        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
                        .on_click((_e, cx) => {
                          cx.stop_propagation();
                          run("tab.close", { id: tb.id });
                        })
                        .child("✕")
                    );
                })
              )
              // + New Tab Button
              .child(
                div().id("btn-add-tab").size(24).rounded(6).border(1).border_color(t.border).bg(t.surface)
                  .flex().items_center().justify_center().cursor_pointer().text_color(t.dim)
                  .hover(h => h.bg(t.hover).text_color(t.accent).border_color(t.accent))
                  .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
                  .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 420 }))
                  .child("+")
              )
          )
      )

      // Center: View mode switcher (Answer, Sources, Canvas, Files, Changes)
      .child(
        h_flex().gap(4).items_center().bg(t.surface).p(3).rounded(16).border(1).border_color(t.border)
          .child(viewButton("btn-view-answer", "Answer", isAnswerActive, () => {
            if (panelVisible) run("layout.hide", { id: "panel" });
          }))
          .child(viewButton("btn-view-sources", "Sources", isSourcesActive, () => {
            if (!panelVisible) run("layout.show", { id: "panel" });
            run("layout.select", { stack: "panel-stack", child: "sources" });
          }))
          .child(viewButton("btn-view-canvas", "Canvas", isCanvasActive, () => {
            if (!panelVisible) run("layout.show", { id: "panel" });
            run("layout.select", { stack: "panel-stack", child: "canvas" });
          }))
          .child(viewButton("btn-view-files", "Files", isFilesActive, () => {
            if (!panelVisible) run("layout.show", { id: "panel" });
            run("layout.select", { stack: "panel-stack", child: "files" });
          }))
          .child(viewButton("btn-view-changes", "Changes", isChangesActive, () => {
            if (!panelVisible) run("layout.show", { id: "panel" });
            run("layout.select", { stack: "panel-stack", child: "changes" });
          }))
      )

      // Right: Split, Share & Window Controls
      .child(
        h_flex().gap(8).items_center().pl(12)
          // Split Pane Button
          .child(
            div().id("btn-split").size(28).rounded(6).flex().items_center().justify_center().cursor_pointer()
              .text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground))
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .on_click(() => run("pane.split", { direction: "right" }))
              .child("◫")
          )
          // Share Pill Button
          .child(
            h_flex().id("btn-share").h(28).px(12).gap(6).items_center().rounded(14).cursor_pointer()
              .bg(t.accent).text_color(t.accent_foreground).font_weight(600).text_size(11.5)
              .hover(h => h.opacity(0.85))
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .on_click((_e, cx) => this.share(cx))
              .child(svg("mods/pplx-topbar/share.svg").size(12))
              .child("Share")
          )
          // Window Controls
          .when(!isMac && win?.buttons !== false, el =>
            el.child(
              h_flex().gap(2).items_center().pl(4)
                .child(this.button("win-min", svg("mods/pplx-topbar/min.svg").size(12), () => run("window.minimize")))
                .child(this.button("win-max", svg("mods/pplx-topbar/max.svg").size(12), () => run("window.maximize")))
                .child(this.button("win-close", svg("mods/pplx-topbar/close.svg").size(12), () => run("window.close")))
            )
          )
      );
  }
}
