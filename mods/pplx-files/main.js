import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, theme, run, setShared, notify, window, home } from "herdr";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || home() || "/", on, space: space?.id };
}

async function directory(path) {
  const isWin = window()?.platform === "windows";
  if (isWin) {
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 300 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)) } }) | ConvertTo-Json -Compress } '" + path.replaceAll("'", "''") + "'"]);
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list folder");
    const res = JSON.parse(r.stdout || "[]");
    return Array.isArray(res) ? res : [res];
  }
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 300 ] && break; done; test -d "$1"';
  const r = await exec("sh", ["-c", script, "files", path]);
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "svg", "webp", "gif", "ico", "bmp", "tiff"]);

function fileIcon(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "🖼️";
  if (ext === "md" || ext === "markdown" || ext === "recipe") return "📝";
  if (["js", "ts", "tsx", "jsx", "py", "rs", "html", "css", "scss", "json", "toml", "yaml", "yml", "sh", "ps1", "sql"].includes(ext)) return "💻";
  return "📄";
}

export default class PplxFiles extends View {
  init(_props, cx) {
    this.entries = [];
    this.subDir = "";
    this.root = location().cwd;
    this.context = null;
    this.refresh(cx);
    cx.timer.every(8000, cx => this.refresh(cx));
  }

  refresh(cx) {
    const loc = location();
    const cwd = loc.cwd || home() || "/";
    if (this.context?.cwd !== cwd) {
      this.context = { cwd };
      this.root = cwd;
      this.subDir = "";
      this.loadDir(this.currentPath(), cx);
    }
  }

  currentPath() {
    if (!this.root) return home() || "/";
    return this.subDir ? `${this.root}/${this.subDir}`.replace(/\/+/g, "/") : this.root;
  }

  loadDir(fullPath, cx) {
    cx.spawn(async cx => {
      try {
        const list = await directory(fullPath);
        this.entries = list.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
      } catch {
        this.entries = [];
      }
      cx.notify();
    });
  }

  openFolder(name, cx) {
    this.subDir = this.subDir ? `${this.subDir}/${name}` : name;
    this.loadDir(this.currentPath(), cx);
    cx.notify();
  }

  goUp(cx) {
    if (!this.subDir) return;
    const parts = this.subDir.split("/").filter(Boolean);
    parts.pop();
    this.subDir = parts.join("/");
    this.loadDir(this.currentPath(), cx);
    cx.notify();
  }

  // Open pictures directly in OS image viewer
  openImageDirectly(name) {
    const full = `${this.currentPath()}/${name}`.replace(/\\/g, "/");
    const isWin = window()?.platform === "windows";
    const isMac = window()?.platform === "macos";
    if (isWin) {
      exec("cmd", ["/c", "start", "", full.replace(/\//g, "\\")]);
    } else if (isMac) {
      exec("open", [full]);
    } else {
      exec("xdg-open", [full]);
    }
    notify({ title: "Opening Picture", body: name, timeout: 2000 });
  }

  // Open documents in Canvas
  openFileInCanvas(name) {
    const full = `${this.currentPath()}/${name}`.replace(/\\/g, "/");
    setShared("canvas.openDoc", full);
    run("layout.show", { id: "panel" });
    run("layout.select", { stack: "panel-stack", child: "canvas" });
    notify({ title: "Opening in Canvas", body: name, timeout: 1500 });
  }

  render() {
    const t = theme();
    const currentFolder = this.subDir ? this.subDir.split("/").pop() : (this.root?.split(/[\\/]/).pop() || "Workspace");

    return v_flex().size_full().bg(t.chrome).border_l(1).border_color(t.border).text_size(13)
      // Top Bar: "Files" badge + breadcrumb + close
      .child(
        h_flex().h(42).px(12).gap(8).items_center().justify_between().border_b(1).border_color(t.border)
          .child(
            h_flex().gap(6).items_center().min_w(0).flex_1()
              .child(
                h_flex().px(8).py(3).rounded(8).bg(t.surface).gap(6).items_center().text_size(11.5).font_weight(600).text_color(t.accent)
                  .child("📁 Files")
              )
              .child(
                div().truncate().text_size(11).text_color(t.dim).child(currentFolder)
              )
          )
          .child(
            div().id("btn-close-files").size(24).rounded(6).flex().items_center().justify_center().cursor_pointer()
              .text_color(t.dim).hover(h => h.bg(t.hover).text_color(t.foreground))
              .on_click(() => run("layout.hide", { id: "panel" }))
              .child("✕")
          )
      )

      // Content Area: Directory Tree
      .child(
        v_flex().flex_1().min_h(0).p(10).gap(3).overflow_y_scrollbar()
          .when(Boolean(this.subDir), up =>
            up.child(
              h_flex().id("files-go-up").h(28).px(8).gap(8).items_center().rounded(6).cursor_pointer()
                .text_color(t.accent).hover(h => h.bg(t.hover))
                .on_click((_e, cx) => this.goUp(cx))
                .child("📁 .. (up one level)")
            )
          )
          .children(
            this.entries.map((e, idx) => {
              if (e.dir) {
                // Folder Row
                return h_flex().id(`folder-item-${idx}`).h(28).px(8).gap(8).items_center().rounded(6).cursor_pointer()
                  .text_color(t.foreground)
                  .hover(h => h.bg(t.hover))
                  .on_click((_e, cx) => this.openFolder(e.name, cx))
                  .child(svg("mods/pplx-canvas/folder.svg").size(14).text_color(t.accent))
                  .child(div().flex_1().truncate().text_size(12.5).font_weight(500).child(e.name))
                  .child(div().text_size(11).text_color(t.dim).child("›"));
              } else {
                const ext = e.name.split(".").pop()?.toLowerCase();
                const isImg = IMAGE_EXTS.has(ext);

                // File Row: Pictures open directly in OS viewer; Documents open in Canvas
                return h_flex().id(`file-item-${idx}`).h(28).px(8).gap(8).items_center().rounded(6).cursor_pointer()
                  .text_color(t.muted)
                  .hover(h => h.bg(t.hover).text_color(t.foreground))
                  .on_click(() => {
                    if (isImg) {
                      this.openImageDirectly(e.name);
                    } else {
                      this.openFileInCanvas(e.name);
                    }
                  })
                  .child(div().text_size(12).child(fileIcon(e.name)))
                  .child(div().flex_1().truncate().text_size(12).child(e.name))
                  .child(
                    div().px(5).py(1).rounded(4).bg(t.surface).text_size(9)
                      .text_color(isImg ? t.accent : t.dim)
                      .hover(h => h.text_color(t.foreground))
                      .child(isImg ? "Open ↗" : "Canvas ↗")
                  );
              }
            })
          )
      );
  }
}
