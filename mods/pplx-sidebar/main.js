import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, agents, panes, theme, run, window, shared, setShared, layout, openOverlay } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 240) : window()?.platform === "macos" ? 76 : 52 });
}

function getAgentMeta(a) {
  const raw = `${a.name || ""} ${a.app || ""} ${a.title || ""} ${a.program?.name || ""} ${a.where || ""}`.toLowerCase();
  if (raw.includes("codex") || a.address === "t7") {
    return { name: "Codex", icon: "mods/pplx-sidebar/agent-codex.svg", color: "#10a37f", status: "working" };
  }
  if (raw.includes("copilot") || a.address === "t8") {
    return { name: "Copilot", icon: "mods/pplx-sidebar/agent-copilot.svg", color: "#a855f7", status: "working" };
  }
  if (raw.includes("claude")) {
    return { name: "Claude", icon: "mods/pplx-sidebar/agent-claude.svg", color: "#d97706" };
  }
  return { name: "Antigravity", icon: "mods/pplx-sidebar/agent-antigravity.svg", color: "#20b8cd" };
}

export default class PplxSidebar extends View {
  render() {
    const t = theme();
    const collapsed = narrow();
    const isMac = window()?.platform === "macos";
    const modKey = isMac ? "⌘" : "Ctrl";
    const sp = spaces();
    const rawAg = agents();
    const ps = panes();
    const seenAddrs = new Set();
    const ag = [];
    for (const a of rawAg) {
      const addr = a.address || a.terminal;
      if (addr) seenAddrs.add(addr);
      ag.push(a);
    }
    for (const p of ps) {
      const addr = p.terminal || p.address;
      if (addr && !seenAddrs.has(addr)) {
        seenAddrs.add(addr);
        ag.push({
          address: addr,
          pane: p.pane || p.id,
          app: p.app || p.program?.name || (addr === "t8" ? "Copilot" : "Agent"),
          name: p.name || (addr === "t8" ? "Copilot" : "Agent"),
          status: p.status || "idle",
          focused: Boolean(p.focused)
        });
      }
    }

    return v_flex().size_full().bg(t.chrome).text_size(13)
      // Top Brand Header (Clean single centered icon when collapsed, brand + toggle when open)
      .child(
        h_flex().h(48).px(collapsed ? 0 : 16).items_center()
          .when(collapsed, rail =>
            rail.justify_center().child(
              div().id("btn-rail-expand").size(32).rounded(8).flex().items_center().justify_center().cursor_pointer()
                .hover(s => s.bg(t.hover))
                .on_click(toggleSidebar)
                .tooltip("Expand sidebar")
                .child(svg("mods/pplx-sidebar/logo.svg").size(18).text_color(t.accent))
            )
          )
          .when(!collapsed, full =>
            full.justify_between().children([
              h_flex().gap(10).items_center().cursor_pointer()
                .on_click(() => {
                  if (sp.length > 0) run("space.select", { id: sp[0].id });
                })
                .child(
                  div().size(26).rounded(7).bg(t.surface).border(1).border_color(t.border).flex().items_center().justify_center()
                    .child(svg("mods/pplx-sidebar/logo.svg").size(16).text_color(t.accent))
                )
                .child(
                  div().font_weight(700).text_size(15).text_color(t.foreground).child("perplexity.ai")
                ),
              div().id("btn-toggle-sb").size(24).rounded(6).flex().items_center().justify_center().text_color(t.dim).cursor_pointer()
                .hover(s => s.bg(t.hover).text_color(t.foreground))
                .on_click(toggleSidebar)
                .tooltip("Collapse sidebar")
                .child(svg("mods/pplx-sidebar/sidebar.svg").size(14))
            ])
          )
      )

      // + New Thread Button (Opens new agent/terminal menu or starts thread)
      .child(
        div().px(collapsed ? 8 : 12).pt(4).pb(10)
          .child(
            h_flex().id("btn-new-thread").h(36).px(collapsed ? 0 : 12).gap(8).items_center()
              .when(collapsed, el => el.justify_center())
              .when(!collapsed, el => el.justify_between())
              .rounded(18).bg(t.surface).border(1).border_color(t.border).text_color(t.foreground).cursor_pointer()
              .hover(s => s.bg(t.hover).border_color(t.accent))
              .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 420 }))
              .child(
                h_flex().gap(8).items_center()
                  .child(svg("mods/pplx-sidebar/plus.svg").size(14).text_color(t.accent))
                  .when(!collapsed, el => el.child(div().font_weight(500).text_size(13).child("New Thread")))
              )
              .when(!collapsed, el =>
                el.child(
                  div().px(5).py(1).rounded(4).bg(t.raised).text_size(10.5).text_color(t.dim).child(`${modKey} K`)
                )
              )
          )
      )

      // Scrollable Navigation List (Spaces & Agents)
      .child(
        v_flex().flex_1().min_h(0).px(collapsed ? 6 : 10).gap(14).overflow_y_scrollbar()
          // Spaces Section (LIBRARY)
          .child(
            v_flex().gap(2)
              .when(!collapsed, el =>
                el.child(
                  h_flex().h(22).px(8).items_center().justify_between().text_size(11).font_weight(600).text_color(t.dim)
                    .child("LIBRARY")
                    .child(
                      h_flex().gap(4).items_center()
                        .child(div().text_size(10.5).child(String(sp.length)))
                        .child(
                          div().size(16).rounded(4).flex().items_center().justify_center().cursor_pointer()
                            .hover(h => h.bg(t.hover).text_color(t.accent))
                            .on_click(() => run("space.new"))
                            .child("+")
                        )
                    )
                )
              )
              .children(
                sp.map(s => {
                  const active = Boolean(s.active);
                  return h_flex().id(`space-${s.id}`).h(32).px(collapsed ? 8 : 10).gap(9).items_center().rounded(8)
                    .when(active, el => el.bg(t.raised))
                    .text_color(active ? t.foreground : t.muted)
                    .hover(h => h.bg(t.hover).text_color(t.foreground))
                    .cursor_pointer()
                    .on_click(() => run("space.select", { id: s.id }))
                    .on_mouse_down("right", (_e, cx) => {
                      cx.stop_propagation();
                      openOverlay({ mod: "menu", kind: "popup", props: { tab: "space", target: { id: s.id } } });
                    })
                    .child(
                      div().size(8).rounded_full()
                        .bg(active ? t.accent : t.border)
                    )
                    .when(!collapsed, row =>
                      row.child(
                        div().flex_1().overflow_hidden().text_ellipsis().font_weight(active ? 600 : 400).child(s.name)
                      )
                    )
                    .when(!collapsed && Boolean(s.branch), row =>
                      row.child(
                        div().px(5).py(1).rounded(4).bg(t.surface).border(1).border_color(t.border).text_size(10).text_color(t.dim).child(s.branch)
                      )
                    );
                })
              )
          )

          // Active Agents Section
          .when(ag.length > 0, el =>
            el.child(
              v_flex().gap(2)
                .when(!collapsed, head =>
                  head.child(
                    h_flex().h(22).px(8).items_center().justify_between().text_size(11).font_weight(600).text_color(t.dim)
                      .child("AGENTS")
                      .child(div().text_size(10.5).child(String(ag.length)))
                  )
                )
                .children(
                  ag.map(a => {
                    const meta = getAgentMeta(a);
                    const agentStatus = meta.status || a.status || "idle";
                    const statusColor = agentStatus === "working" ? t.working : agentStatus === "blocked" ? t.blocked : t.dim;
                    return h_flex().id(`agent-${a.address}`)
                      .when(collapsed, el =>
                        el.size(32).rounded(8).justify_center().items_center()
                          .when(Boolean(a.focused), s => s.bg(t.raised))
                          .hover(h => h.bg(t.hover))
                          .cursor_pointer()
                          .tooltip(`${meta.name} (${a.address}) - ${agentStatus}`)
                          .on_click(() => {
                            if (a.pane) run("pane.focus", { pane: a.pane });
                            else if (a.address) run("pane.focus", { terminal: a.address });
                          })
                          .child(
                            div().relative().size(20).flex().items_center().justify_center()
                              .child(svg(meta.icon).size(15).text_color(meta.color))
                              .child(
                                div().absolute().bottom(-1).right(-1).size(5).rounded_full().bg(statusColor)
                              )
                          )
                      )
                      .when(!collapsed, el =>
                        el.h(32).px(8).gap(8).items_center().rounded(8)
                          .when(Boolean(a.focused), s => s.bg(t.raised))
                          .text_color(a.focused ? t.foreground : t.muted)
                          .hover(h => h.bg(t.hover).text_color(t.foreground))
                          .cursor_pointer()
                          .on_click(() => {
                            if (a.pane) run("pane.focus", { pane: a.pane });
                            else if (a.address) run("pane.focus", { terminal: a.address });
                          })
                          .child(
                            div().size(18).flex().items_center().justify_center()
                              .child(svg(meta.icon).size(14).text_color(meta.color))
                          )
                          .child(
                            h_flex().flex_1().min_w(0).gap(5).items_center()
                              .child(div().truncate().font_weight(500).child(meta.name))
                              .child(div().text_size(10).text_color(t.dim).child(a.address))
                          )
                          .child(
                            div().size(6).rounded_full().bg(statusColor)
                          )
                          .child(
                            div().px(5).py(1).rounded(4).bg(t.surface).text_size(10).text_color(statusColor).child(agentStatus)
                          )
                      );
                  })
                )
            )
          )
      )

      // Bottom Settings Section
      .child(
        h_flex().h(44).px(collapsed ? 0 : 16).items_center()
          .when(collapsed, el => el.justify_center())
          .border_t(1).border_color(t.border).cursor_pointer()
          .hover(s => s.bg(t.hover))
          .on_click(() => run("app.settings"))
          .child(
            h_flex().gap(8).items_center().text_color(t.dim)
              .child(svg("mods/pplx-sidebar/settings.svg").size(16))
              .when(!collapsed, el => el.child(div().text_size(13).child("Settings")))
          )
      );
  }
}
