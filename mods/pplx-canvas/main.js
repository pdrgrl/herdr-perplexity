import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, theme, settings, run, shared, setShared, notify, window, home, appHome } from "herdr";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || home() || "C:/Users/pedro", on, space: space?.id };
}

const PAGE = 12000, SOFT = 6000;

function paginate(text) {
  if (!text) return [""];
  const pages = []; let cur = [], size = 0, fence = false;
  for (const line of String(text).split("\n")) {
    if (!fence && size > 0 && (size >= PAGE || (size >= SOFT && /^#{1,3}\s/.test(line)))) { pages.push(cur.join("\n")); cur = []; size = 0; }
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    cur.push(line); size += line.length + 1;
  }
  if (cur.length) pages.push(cur.join("\n"));
  return pages.length ? pages : [""];
}

const LANG = {
  ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", js: "js",
  json: "json", jsonc: "json",
  toml: "yaml", yaml: "yaml", yml: "yaml",
  html: "html", svelte: "html", vue: "html", xml: "html", svg: "html",
  css: "css", scss: "css",
  rs: "rust", py: "python",
  sh: "sh", bash: "sh", zsh: "sh", ps1: "powershell", bat: "powershell",
  c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "c",
  sql: "sql",
  md: "md", markdown: "md",
  txt: "txt", log: "txt", env: "txt", lock: "json", ini: "yaml", conf: "yaml",
  recipe: "md"
};

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "svg", "webp", "gif", "ico", "bmp"]);

function normalizePath(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/^file:\/\/\/?/i, "")
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/")
    .replace(/^[<([{"'`]+/, "")
    .replace(/[.,;:)>\]"']+$/, "");
}

// 100% OS-Agnostic document resolver using pure JS and Herdr native readTextFile
async function resolveDocument(raw, root) {
  if (!raw) return null;
  const clean = normalizePath(raw);
  if (!clean) return null;

  const leaf = clean.split("/").pop() || clean;
  const ext = leaf.includes(".") ? leaf.split(".").pop().toLowerCase() : "txt";
  const isImg = IMAGE_EXTS.has(ext);
  const h = home() || "";
  const ah = appHome() || "";

  // If it's an image file
  if (isImg) {
    return {
      name: leaf,
      path: clean,
      origPath: clean,
      kind: "image",
      ext,
      text: ""
    };
  }

  // Text/Code/Markdown files: search cross-platform candidate paths
  const candidates = [];
  if (clean.includes("/") || clean.includes(":")) {
    candidates.push(clean);
  }
  if (root) {
    candidates.push(`${root}/${clean}`);
    candidates.push(`${root}/${leaf}`);
  }
  if (h) {
    candidates.push(`${h}/${clean}`);
    candidates.push(`${h}/${leaf}`);
    candidates.push(`${h}/Desktop/${leaf}`);
    candidates.push(`${h}/Downloads/${leaf}`);
    // Recent conversation brain directories if applicable
    candidates.push(`${h}/.gemini/antigravity-cli/brain/da6f05c4-4dde-4286-8440-7171307b2fda/${leaf}`);
    candidates.push(`${h}/.gemini/antigravity-cli/brain/af137ee4-b294-4a4a-8e94-02a05437eacb/${leaf}`);
  }
  if (ah) {
    candidates.push(`${ah}/${clean}`);
    candidates.push(`${ah}/layouts/${leaf}`);
    candidates.push(`${ah}/themes/${leaf}`);
    candidates.push(`${ah}/mods/${leaf}`);
  }

  for (const c of candidates) {
    try {
      const text = await readTextFile(c);
      if (text !== null) {
        const isBin = text.includes("\0");
        if (!isBin) {
          const kind = (ext === "md" || ext === "markdown" || ext === "recipe") ? "md" : "code";
          return {
            name: leaf,
            path: c,
            origPath: c,
            kind,
            ext,
            text
          };
        }
      }
    } catch {}
  }

  return null;
}

export default class PplxCanvas extends View {
  init(_props, cx) {
    this.openTabs = []; // [{ name, path, origPath, kind, ext, text, pages, editor }]
    this.activeDoc = null;
    this.page = 0;
    this.root = location().cwd;
    this.initialScanned = false;
    this.check(cx);
    cx.timer.every(150, cx => this.check(cx));
  }

  check(cx) {
    const loc = location();
    if (loc.cwd) this.root = loc.cwd;

    const requested = shared("canvas.openDoc");
    if (requested) {
      setShared("canvas.openDoc", null);
      cx.spawn(async cx => {
        await this.openDocument(requested, cx);
      });
      return;
    }

    if (!this.initialScanned) {
      this.initialScanned = true;
      cx.spawn(async cx => {
        const def = await resolveDocument("installed_apps_audit.md", this.root)
                 || await resolveDocument("perplexity.RECIPE.md", this.root)
                 || await resolveDocument("README.md", this.root);
        if (def) {
          this.addTab(def);
          cx.notify();
        }
      });
    }
  }

  async openDocument(raw, cx) {
    const doc = await resolveDocument(raw, this.root);
    if (!doc) {
      notify({ title: "Cannot Open in Canvas", body: `File not found or unreadable: ${raw}`, level: "warning" });
      return;
    }

    this.addTab(doc);
    cx.notify();
  }

  addTab(doc) {
    if (!doc) return;
    const existing = this.openTabs.find(t => t.name === doc.name || t.path === doc.path);
    const t = theme();
    const pages = paginate(doc.text || "");

    let editor = null;
    if (doc.kind === "code") {
      try {
        editor = EditorState.new({
          language: LANG[doc.ext] ?? doc.ext ?? "txt",
          readonly: true,
          value: (doc.text || "").length > 400000 ? (doc.text.slice(0, 400000) + "\n… (file truncated)") : (doc.text || ""),
          font_family: settings().font_family || "JetBrains Mono",
          font_size: 12,
          syntax: {
            keyword: t.ansi5,
            string: t.ansi2,
            comment: t.dim,
            function: t.ansi4,
            type: t.ansi3,
            number: t.ansi1,
            constant: t.ansi6
          }
        });
      } catch {}
    }

    const item = {
      name: doc.name || "Untitled",
      path: doc.path || "",
      origPath: doc.origPath || doc.path || "",
      kind: doc.kind || "code",
      ext: doc.ext || "txt",
      text: doc.text || "",
      pages,
      editor
    };

    if (existing) {
      existing.text = item.text;
      existing.origPath = item.origPath;
      existing.kind = item.kind;
      existing.ext = item.ext;
      existing.pages = item.pages;
      if (existing.editor) existing.editor.release?.();
      existing.editor = item.editor;
      this.activeDoc = existing;
    } else {
      this.openTabs.push(item);
      this.activeDoc = item;
    }
    this.page = 0;
  }

  closeTab(tab, cx) {
    const idx = this.openTabs.indexOf(tab);
    if (idx !== -1) {
      if (tab.editor) tab.editor?.release?.();
      this.openTabs.splice(idx, 1);
      if (this.activeDoc === tab) {
        this.activeDoc = this.openTabs[Math.max(0, idx - 1)] || null;
      }
    }
    cx.notify();
  }

  openInOS(origPath) {
    if (!origPath) return;
    const plat = window()?.platform;
    if (plat === "windows") {
      exec("cmd", ["/c", "start", "", origPath.replace(/\//g, "\\")]);
    } else if (plat === "macos") {
      exec("open", [origPath]);
    } else {
      exec("xdg-open", [origPath]);
    }
    notify({ title: "Opened Externally", body: origPath.split("/").pop() || origPath, timeout: 2000 });
  }

  render() {
    const t = theme();
    const doc = this.activeDoc;

    return v_flex().size_full().bg(t.chrome).border_l(1).border_color(t.border).text_size(13)
      // Top Header: Canvas badge + current file info + quick actions + close
      .child(
        h_flex().h(42).px(12).gap(8).items_center().justify_between().border_b(1).border_color(t.border)
          .child(
            h_flex().gap(6).items_center()
              .child(
                h_flex().px(8).py(3).rounded(8).bg(t.surface).gap(6).items_center().text_size(11.5).font_weight(600).text_color(t.accent)
                  .child("📝 Canvas")
              )
              .when(Boolean(doc), d =>
                d.child(
                  div().px(6).py(2).rounded(6).bg(t.raised).text_size(10).text_color(t.dim).child((doc.ext || "TXT").toUpperCase())
                )
              )
          )
          .child(
            h_flex().gap(4).items_center()
              .when(Boolean(doc?.origPath), el =>
                el.child(
                  div().id("btn-open-os").px(7).py(3).rounded(6).bg(t.surface).border(1).border_color(t.border).cursor_pointer()
                    .text_size(11).text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground))
                    .on_click(() => this.openInOS(doc.origPath))
                    .tooltip("Open externally in OS default app")
                    .child("↗ OS")
                )
              )
              .child(
                div().id("btn-close-canvas").size(24).rounded(6).flex().items_center().justify_center().cursor_pointer()
                  .text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground))
                  .on_click(() => run("layout.hide", { id: "panel" }))
                  .child("✕")
              )
          )
      )

      // Open Documents Tabs Strip
      .when(this.openTabs.length > 0, tabsStrip =>
        tabsStrip.child(
          h_flex().h(32).px(8).gap(4).items_center().bg(t.surface).border_b(1).border_color(t.border).overflow_x_scrollbar()
            .children(
              this.openTabs.map(tab => {
                const isActive = tab === this.activeDoc;
                return h_flex().id(`tab-${tab.name}`).h(24).px(8).gap(6).items_center().rounded(6).cursor_pointer()
                  .border(1).border_color(isActive ? t.accent : t.border)
                  .when(isActive, el => el.bg(t.raised))
                  .text_color(isActive ? t.foreground : t.dim)
                  .hover(h => h.bg(t.hover).text_color(t.foreground))
                  .on_click((_e, cx) => {
                    this.activeDoc = tab;
                    this.page = 0;
                    cx.notify();
                  })
                  .child(div().text_size(11).font_weight(isActive ? 600 : 400).child(tab.name))
                  .child(
                    div().id(`close-tab-${tab.name}`).size(14).flex().items_center().justify_center().rounded(3)
                      .text_size(10).text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground))
                      .on_click((e, cx) => {
                        e.stop_propagation();
                        this.closeTab(tab, cx);
                      })
                      .child("✕")
                  );
              })
            )
        )
      )

      // Main Content Area (Markdown / Code & Text / Image / Empty)
      .child(
        v_flex().flex_1().min_h(0)
          // 1. Markdown Document (Native GPUI TextView.markdown: cross-platform, fast, safe)
          .when(Boolean(doc && doc.kind === "md"), el => {
            const pages = (doc && Array.isArray(doc.pages) && doc.pages.length) ? doc.pages : [doc?.text || ""];
            const curPage = Math.max(0, Math.min(this.page, pages.length - 1));
            const pageContent = pages[curPage] || doc.text || "";

            return el.child(
              v_flex().size_full().p(14).gap(12).overflow_y_scrollbar()
                .child(
                  div().font_weight(700).text_size(16).text_color(t.foreground).child(doc.name)
                )
                .child(
                  TextView.markdown(`canvas-text-${doc.name}`, String(pageContent)).selectable(true)
                )
                .when(pages.length > 1, nav =>
                  nav.child(
                    h_flex().h(32).items_center().justify_between().pt(8).border_t(1).border_color(t.border).text_size(11).text_color(t.dim)
                      .child(
                        div().id("btn-prev-page").px(6).py(2).rounded(4).cursor_pointer()
                          .when(curPage > 0, p => p.hover(h => h.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => { this.page = curPage - 1; cx.notify(); }))
                          .child("← Previous")
                      )
                      .child(div().child(`Page ${curPage + 1} of ${pages.length}`))
                      .child(
                        div().id("btn-next-page").px(6).py(2).rounded(4).cursor_pointer()
                          .when(curPage < pages.length - 1, p => p.hover(h => h.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => { this.page = curPage + 1; cx.notify(); }))
                          .child("Next →")
                      )
                  )
                )
            );
          })

          // 2. Syntax-Highlighted Code / Text Document (Native GPUI EditorState: cross-platform)
          .when(Boolean(doc && doc.kind === "code"), el =>
            el.child(
              v_flex().size_full().p(10).gap(8)
                .child(
                  h_flex().items_center().justify_between().pb(6).border_b(1).border_color(t.border)
                    .child(
                      h_flex().gap(6).items_center()
                        .child(div().font_weight(600).text_size(13).text_color(t.foreground).child(doc.name))
                        .child(div().px(5).py(1).rounded(4).bg(t.raised).text_size(9.5).text_color(t.accent).child((LANG[doc.ext] || doc.ext).toUpperCase()))
                    )
                    .child(div().text_size(11).text_color(t.dim).child(doc.origPath || doc.path))
                )
                .child(
                  doc.editor ? Editor.new(doc.editor).w_full().flex_1().min_h(0) : div().p(12).text_color(t.dim).child("Loading document...")
                )
            )
          )

          // 3. Image File Information Card (Cross-platform, safe, no external app crash)
          .when(Boolean(doc && doc.kind === "image"), el =>
            el.child(
              v_flex().size_full().p(20).gap(14).items_center().justify_center()
                .child(
                  v_flex().w(360).p(20).gap(12).rounded(12).bg(t.surface).border(1).border_color(t.border).items_center().text_center()
                    .child(div().text_size(36).child("🖼️"))
                    .child(div().font_weight(700).text_size(15).text_color(t.foreground).child(doc.name))
                    .child(div().px(6).py(2).rounded(4).bg(t.raised).text_size(10).text_color(t.accent).child((doc.ext || "IMG").toUpperCase() + " IMAGE"))
                    .child(div().text_size(11).text_color(t.dim).child(doc.origPath || doc.path))
                    .child(
                      h_flex().mt(6).gap(8).items_center()
                        .child(
                          div().id("btn-card-open-os").px(12).py(6).rounded(8).bg(t.accent).cursor_pointer()
                            .text_size(12).font_weight(600).text_color(t.accent_foreground)
                            .hover(h => h.opacity(0.85))
                            .on_click(() => this.openInOS(doc.origPath || doc.path))
                            .child("Open in OS Viewer ↗")
                        )
                    )
                )
            )
          )

          // 4. Empty State
          .when(!doc, empty =>
            empty.child(
              v_flex().size_full().p(24).gap(10).items_center().justify_center().text_center()
                .child(div().font_weight(600).text_size(14).text_color(t.foreground).child("Canvas Document Viewer"))
                .child(
                  div().max_w(280).text_size(12).text_color(t.dim)
                    .child("Click any file, markdown document, or code citation in Sources or Files to view it directly in Canvas.")
                )
            )
          )
      );
  }
}
