# Perplexity.AI Layout for Herdr

An AI research assistant-inspired workstation layout for [Herdr](https://herdr.dev), modeled after the clean, modern interface of [Perplexity.ai](https://perplexity.ai).

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="preview-dark.png?raw=true">
    <source media="(prefers-color-scheme: light)" srcset="preview-light.png?raw=true">
    <img alt="Perplexity.AI Layout for Herdr" src="preview-dark.png?raw=true" width="100%">
  </picture>
</p>

## ✨ Features

- **Geometric Starburst Brand**: Centered electric teal starburst logo (`✳`) and clean rail collapse.
- **Multi-Agent Roster with Branded Icons**: Live status badges and branded icons for **Antigravity** (✦), **Codex** (⬡), **Copilot** (🤖), and **Claude** (🟠).
- **`+ New Thread` Quick Action**: One-click button and <kbd>Ctrl</kbd> + <kbd>K</kbd> (or <kbd>⌘K</kbd>) shortcut to launch agents or shells.
- **5-View Navigation**:
  - **`Answer`**: Full-screen coding workstation.
  - **`Sources`**: Verified citation cards for web links and on-disk files extracted from agent scrollback.
  - **`Canvas`**: In-app document workspace with native rich Markdown (`TextView.markdown`) and syntax-highlighted code editor (`Editor.new`).
  - **`Files`**: Workspace directory tree with folder drill-down and navigation.
  - **`Changes`**: Native Git status and diff inspector.
- **Floating Prompt Dock**: Perplexity-inspired "Ask follow-up..." bar at the bottom with real interactive typing (`Input.new`) delivering commands to the terminal via `hc send`.
- **Dual Themes**: Includes customized `perplexity-dark` (warm charcoal `#191a1a` with electric teal `#20b8cd`) and `perplexity-light` (warm stone `#f3f3ee` with deep sea teal `#139a9c`).
- **100% OS-Agnostic**: Built entirely with native GPUI and Herdr Rust APIs. Runs identically on Linux, macOS, and Windows.

---

## 🎨 Dual Themes

### Dark Mode
Warm charcoal background (`#191a1a`), elevated dark surface cards, and vibrant electric teal accents (`#20b8cd`).

<p align="center">
  <img alt="Perplexity Dark Mode" src="preview-dark.png?raw=true" width="100%">
</p>

### Light Mode
Warm parchment canvas (`#f3f3ee`), crisp white cards, and deep sea teal accents (`#139a9c`).

<p align="center">
  <img alt="Perplexity Light Mode" src="preview-light.png?raw=true" width="100%">
</p>

---

## 🚀 Installation

To use this layout in your Herdr installation:

1. Clone or copy the directories into your Herdr configuration folder (`~/.config/herdr-app/`):
   - Copy `layouts/perplexity.json` to `~/.config/herdr-app/layouts/`
   - Copy `themes/*` to `~/.config/herdr-app/themes/`
   - Copy `mods/*` to `~/.config/herdr-app/mods/`
2. Switch to the layout:
   ```bash
   herdr-app do layout.switch --name perplexity
   ```
3. (Optional) Add <kbd>Ctrl</kbd> + <kbd>K</kbd> to your `~/.config/herdr-app/keys.json`:
   ```json
   "global": {
     "ctrl-k": "mod.open:new-menu"
   }
   ```

---

## 📋 Layout Recipe

For complete architecture details, design constraints, and the full brief to build or modify this layout, see [RECIPE.md](RECIPE.md).
