import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { panes, focused, spaces, theme, run, window, hc, exec, notify, setShared, home, appHome } from "herdr";

function domain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.split("/")[2] || url.slice(0, 20);
  }
}

function cleanToken(s) {
  return String(s ?? "")
    .replace(/^file:\/\/\/?/i, "")
    .split("#")[0]
    .split("?")[0]
    .replace(/[.,;:)>\]"']+$/, "")
    .replace(/^[<([{"'`]+/, "")
    .replace(/[`"']+$/, "");
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "svg", "webp", "gif", "ico", "bmp", "tiff"]);

function fileIcon(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "🖼️";
  if (ext === "md" || ext === "markdown" || ext === "recipe") return "📝";
  if (["json", "toml", "yaml", "yml", "ini", "conf", "env", "lock", "xml"].includes(ext)) return "⚙️";
  if (["js", "ts", "tsx", "jsx", "py", "rs", "html", "css", "scss", "sh", "ps1", "sql", "c", "cpp", "h", "cs"].includes(ext)) return "💻";
  return "📄";
}

const VALID_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "toml", "yaml", "yml", "ini", "conf",
  "md", "markdown", "recipe", "py", "rs", "go", "html", "css", "scss", "sh", "bat", "ps1", "sql",
  "c", "cpp", "h", "hpp", "cs", "txt", "log", "env", "lock", "xml", "csv", "diff", "patch",
  "png", "jpg", "jpeg", "svg", "webp", "gif", "ico", "bmp", "tiff"
]);

// Checks candidate locations and returns the first verified on-disk absolute path
async function findFirstExisting(raw, root) {
  if (!raw) return null;
  const clean = String(raw).trim().replace(/^file:\/\/\/?/i, "").split("#")[0].split("?")[0].replace(/\\/g, "/");
  const leaf = clean.split("/").pop() || clean;
  if (!leaf || leaf.length < 3 || !leaf.includes(".")) return null;

  // Filter out JavaScript/TypeScript code symbols that resemble filenames
  if (/^[A-Z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/.test(leaf)) {
    if (["TextView", "Editor", "EditorState", "Input", "Textarea", "View", "Promise", "Math", "JSON", "Object", "Array"].some(c => leaf.startsWith(c))) {
      return null;
    }
  }

  const h = home() || "";
  const ah = appHome() || "";

  const candidates = [];
  if (clean.includes(":") || clean.startsWith("/")) {
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
    candidates.push(`${h}/Documents/${leaf}`);
    candidates.push(`${h}/.gemini/antigravity-cli/brain/da6f05c4-4dde-4286-8440-7171307b2fda/${leaf}`);
    candidates.push(`${h}/.gemini/antigravity-cli/brain/af137ee4-b294-4a4a-8e94-02a05437eacb/${leaf}`);
  }
  if (ah) {
    candidates.push(`${ah}/${clean}`);
    candidates.push(`${ah}/cache/${leaf}`);
    candidates.push(`${ah}/layouts/${leaf}`);
    candidates.push(`${ah}/themes/${leaf}`);
    candidates.push(`${ah}/mods/${leaf}`);
  }

  const isWin = window()?.platform === "windows";
  if (isWin) {
    const list = candidates.map(c => `"${c.replace(/\//g, "\\")}"`).join(" ");
    try {
      const r = await exec("cmd", ["/c", `for %F in (${list}) do @if exist "%~fF" (echo %~fF & exit /b 0)`]);
      if (r.code === 0 && r.stdout?.trim()) {
        const found = r.stdout.trim().split("\r\n")[0].split("\n")[0].replace(/\\/g, "/");
        if (found) return found;
      }
    } catch {}
  } else {
    try {
      const r = await exec("sh", ["-c", 'for f in "$@"; do [ -e "$f" ] && echo "$f" && exit 0; done; exit 1', "_", ...candidates]);
      if (r.code === 0 && r.stdout?.trim()) {
        const found = r.stdout.trim().split("\n")[0];
        if (found) return found;
      }
    } catch {}
  }
  return null;
}

export default class PplxSources extends View {
  init(_props, cx) {
    this.filter = "all"; // "all" | "urls" | "files"
    this.urls = [];
    this.files = [];
    this.refresh(cx);
    cx.timer.every(4000, cx => this.refresh(cx));
  }

  refresh(cx) {
    const f = focused();
    const ps = panes();
    const term = f?.terminal || ps.find(p => p.terminal)?.terminal;
    if (!term) return;

    const sp = spaces().find(s => s.active);
    const root = sp?.folder || home() || "C:/Users/pedro";

    cx.spawn(async cx => {
      try {
        const res = await hc(["read", "--lines", "300", term]);
        const text = res?.stdout || "";

        // 1. Web URLs
        const urlMatches = text.match(/https?:\/\/[^\s"'`<>]+/gi) || [];
        const seenUrls = new Set();
        const urls = [];
        for (const m of urlMatches) {
          const u = cleanToken(m);
          if (u && u.length > 8 && !seenUrls.has(u.toLowerCase())) {
            seenUrls.add(u.toLowerCase());
            urls.push({
              type: "url",
              url: u,
              domain: domain(u),
              path: u.replace(/^https?:\/\/[^/]+/, "") || "/"
            });
          }
        }

        // 2. Candidate Files & Paths mentioned
        const fileRegex = /(?:file:\/\/\/[^\s"'`<>]+)|(?:[a-zA-Z]:[\\/][^\s"'`<>:;*?|()]+\.[a-zA-Z0-9]{1,8})|(?:(?:[a-zA-Z0-9_.-]+[\\/])+[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]{1,8})|(?:\b[a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{1,8}\b)/gi;
        const seenNames = new Set();
        const verifiedFiles = [];
        let fm;
        while ((fm = fileRegex.exec(text)) !== null) {
          const raw = fm[0];
          const cleaned = cleanToken(raw);
          if (!cleaned || cleaned.includes("...") || cleaned.startsWith("http")) continue;

          const name = cleaned.replace(/\\/g, "/").split("/").pop() || cleaned;
          const parts = name.split(".");
          if (parts.length < 2) continue;
          const ext = parts.pop()?.toLowerCase();
          const base = parts.join(".");

          if (!base || base.length < 2 || !VALID_EXTS.has(ext)) continue;

          const norm = name.toLowerCase();
          if (seenNames.has(norm)) continue;

          // Crucial check: verify that this file ACTUALLY exists on disk!
          const existingPath = await findFirstExisting(cleaned, root);
          if (existingPath) {
            seenNames.add(norm);
            const isImg = IMAGE_EXTS.has(ext);
            verifiedFiles.push({
              type: "file",
              path: existingPath,
              name,
              displayPath: existingPath.replace(home() || "", "~"),
              icon: fileIcon(name),
              isImg,
              isMd: ext === "md" || ext === "markdown" || ext === "recipe"
            });
          }
        }

        this.urls = urls.reverse();
        this.files = verifiedFiles.reverse();
      } catch {}
      cx.notify();
    });
  }

  openUrl(url) {
    const isWin = window()?.platform === "windows";
    const isMac = window()?.platform === "macos";
    if (isWin) {
      exec("cmd", ["/c", "start", "", url]);
    } else if (isMac) {
      exec("open", [url]);
    } else {
      exec("xdg-open", [url]);
    }
    notify({ title: "Opening Link", body: url, timeout: 2000 });
  }

  // Pictures open directly in OS default image viewer
  openImageDirectly(fullPath) {
    if (!fullPath) return;
    const isWin = window()?.platform === "windows";
    const isMac = window()?.platform === "macos";
    if (isWin) {
      exec("cmd", ["/c", "start", "", fullPath.replace(/\//g, "\\")]);
    } else if (isMac) {
      exec("open", [fullPath]);
    } else {
      exec("xdg-open", [fullPath]);
    }
    notify({ title: "Opening Picture", body: fullPath.split("/").pop() || fullPath, timeout: 2000 });
  }

  // Documents & Code open in Canvas
  openFileInCanvas(fullPath) {
    setShared("canvas.openDoc", fullPath);
    run("layout.show", { id: "panel" });
    run("layout.select", { stack: "panel-stack", child: "canvas" });
    notify({ title: "Opening in Canvas", body: fullPath.split("/").pop() || fullPath, timeout: 1500 });
  }

  copyPath(path) {
    const isWin = window()?.platform === "windows";
    if (isWin) {
      exec("powershell", ["-NoProfile", "-Command", `Set-Clipboard -Value '${path.replace(/'/g, "''")}'`]);
    } else {
      exec("sh", ["-c", `printf '%s' "$1" | pbcopy || printf '%s' "$1" | xclip -sel clip`, "_", path]);
    }
    notify({ title: "Copied to Clipboard", body: path.split("/").pop() || path, timeout: 1500 });
  }

  render() {
    const t = theme();
    const totalCount = this.urls.length + this.files.length;
    const items =
      this.filter === "urls"
        ? this.urls
        : this.filter === "files"
          ? this.files
          : [...this.urls, ...this.files];

    return v_flex().size_full().bg(t.chrome).border_l(1).border_color(t.border).text_size(13)
      // Top Header
      .child(
        h_flex().h(42).px(12).gap(8).items_center().justify_between().border_b(1).border_color(t.border)
          .child(
            h_flex().px(8).py(3).rounded(8).bg(t.surface).gap(6).items_center().text_size(11.5).font_weight(600).text_color(t.accent)
              .child(svg("mods/pplx-sources/globe.svg").size(12))
              .child("Sources & Mentions")
          )
          .child(
            div().id("btn-close-sources").size(24).rounded(6).flex().items_center().justify_center().cursor_pointer()
              .text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground))
              .on_click(() => run("layout.hide", { id: "panel" }))
              .child("✕")
          )
      )

      // Filter Switcher Pills Strip: All | URLs | Files Mentioned
      .child(
        h_flex().h(32).px(12).gap(6).items_center().bg(t.surface).border_b(1).border_color(t.border)
          .child(
            div().id("filter-all").px(8).py(2).rounded(6).cursor_pointer().text_size(11)
              .when(this.filter === "all", el => el.bg(t.raised).text_color(t.foreground).font_weight(600).border(1).border_color(t.accent))
              .when(this.filter !== "all", el => el.text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground)))
              .on_click((_e, cx) => { this.filter = "all"; cx.notify(); })
              .child(`All (${totalCount})`)
          )
          .child(
            div().id("filter-urls").px(8).py(2).rounded(6).cursor_pointer().text_size(11)
              .when(this.filter === "urls", el => el.bg(t.raised).text_color(t.foreground).font_weight(600).border(1).border_color(t.accent))
              .when(this.filter !== "urls", el => el.text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground)))
              .on_click((_e, cx) => { this.filter = "urls"; cx.notify(); })
              .child(`URLs (${this.urls.length})`)
          )
          .child(
            div().id("filter-files").px(8).py(2).rounded(6).cursor_pointer().text_size(11)
              .when(this.filter === "files", el => el.bg(t.raised).text_color(t.foreground).font_weight(600).border(1).border_color(t.accent))
              .when(this.filter !== "files", el => el.text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground)))
              .on_click((_e, cx) => { this.filter = "files"; cx.notify(); })
              .child(`Files (${this.files.length})`)
          )
      )

      // Content Area: Interactive Citation Cards with Robust Truncation & Resizing
      .child(
        v_flex().flex_1().min_h(0).p(8).gap(6).overflow_y_scrollbar()
          .when(items.length === 0, empty =>
            empty.child(
              v_flex().p(16).gap(8).rounded(10).bg(t.surface).border(1).border_color(t.border).items_center().justify_center()
                .child(svg("mods/pplx-sources/globe.svg").size(24).text_color(t.dim))
                .child(div().font_weight(600).text_size(13).text_color(t.foreground).child("No URLs or Verified Files"))
                .child(
                  div().text_center().text_size(11.5).text_color(t.dim)
                    .child("Web links and physical files referenced by your agents will automatically appear here once verified on disk.")
                )
            )
          )
          .children(
            items.map((it, idx) => {
              if (it.type === "url") {
                // Web URL Citation Card
                return h_flex().id(`source-url-${idx}`).w_full().p(8).gap(8).items_center().justify_between().rounded(8)
                  .bg(t.surface).border(1).border_color(t.border).cursor_pointer().overflow_hidden()
                  .hover(h => h.border_color(t.accent).bg(t.hover))
                  .on_click(() => this.openUrl(it.url))
                  .on_mouse_down("right", (_e, cx) => {
                    cx.stop_propagation();
                    this.copyPath(it.url);
                  })
                  .child(
                    div().size(22).flex_none().rounded(6).bg(t.raised).flex().items_center().justify_center()
                      .text_size(10).font_weight(700).text_color(t.accent).child(String(idx + 1))
                  )
                  .child(
                    v_flex().flex_1().min_w(0).gap(1)
                      .child(
                        h_flex().w_full().min_w(0).gap(5).items_center()
                          .child(svg("mods/pplx-sources/globe.svg").size(11).flex_none().text_color(t.accent))
                          .child(div().flex_1().min_w(0).truncate().font_weight(600).text_size(12).text_color(t.foreground).child(it.domain))
                      )
                      .child(div().w_full().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(it.url))
                  )
                  .child(
                    div().flex_none().px(7).py(3).rounded(5).bg(t.raised).text_size(10).font_weight(600).text_color(t.accent).child("Link ↗")
                  );
              } else if (it.isImg) {
                // Picture Card: Opens directly in OS default image viewer
                return h_flex().id(`source-file-${idx}`).w_full().p(8).gap(8).items_center().justify_between().rounded(8)
                  .bg(t.surface).border(1).border_color(t.border).cursor_pointer().overflow_hidden()
                  .hover(h => h.border_color(t.accent).bg(t.hover))
                  .on_click(() => this.openImageDirectly(it.path))
                  .on_mouse_down("right", (_e, cx) => {
                    cx.stop_propagation();
                    this.copyPath(it.path);
                  })
                  .child(
                    div().size(22).flex_none().rounded(6).bg(t.raised).flex().items_center().justify_center().text_size(12).child("🖼️")
                  )
                  .child(
                    v_flex().flex_1().min_w(0).gap(1)
                      .child(
                        div().w_full().min_w(0).truncate().font_weight(600).text_size(12).text_color(t.foreground).child(it.name)
                      )
                      .child(div().w_full().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(it.displayPath || it.path))
                  )
                  .child(
                    div().flex_none().px(7).py(3).rounded(5).bg(t.raised).text_size(10).font_weight(600).text_color(t.accent).child("Open ↗")
                  );
              } else {
                // Document / Code Card: Opens in Canvas
                return h_flex().id(`source-file-${idx}`).w_full().p(8).gap(8).items_center().justify_between().rounded(8)
                  .bg(t.surface).border(1).border_color(t.border).cursor_pointer().overflow_hidden()
                  .hover(h => h.border_color(t.accent).bg(t.hover))
                  .on_click(() => this.openFileInCanvas(it.path))
                  .on_mouse_down("right", (_e, cx) => {
                    cx.stop_propagation();
                    this.copyPath(it.path);
                  })
                  .child(
                    div().size(22).flex_none().rounded(6).bg(t.raised).flex().items_center().justify_center().text_size(12).child(it.icon)
                  )
                  .child(
                    v_flex().flex_1().min_w(0).gap(1)
                      .child(
                        div().w_full().min_w(0).truncate().font_weight(600).text_size(12).text_color(t.foreground).child(it.name)
                      )
                      .child(div().w_full().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(it.displayPath || it.path))
                  )
                  .child(
                    div().flex_none().px(7).py(3).rounded(5).bg(t.raised).text_size(10).font_weight(600).text_color(t.accent).child("Canvas ↗")
                  );
              }
            })
          )
      );
  }
}
