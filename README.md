# SuperClaude

Lasso anything on your Supernote and ask Claude about it.

Select handwriting, a sketch or a piece of a PDF with the lasso, tap **SuperClaude**, and Claude
looks at it: it solves the calculation, answers the question, or tells you what it sees. The answer
opens in a window, with the math typeset, and you can keep asking follow-ups.

- **Calculator and tutor**: equations, integrals, unit conversions, step by step.
- **Charts and drawings**: ask for a graph (2D or 3D) or a line drawing of anything; it shows up in
  the window, and **Insert on page** puts it on your page as real ink strokes you can move and erase.
- **Put it on the page**: ask "write the result on the page" and it lands below your selection, plain
  text as an editable text box and formulas as ink.
- **Hide and come back**: hide the window to keep writing, and reopen the conversation from the
  SuperClaude button in the toolbar.
- In PDFs and EPUBs it also works on highlighted text.

It talks to the Anthropic API directly from the tablet, with your own API key. Nothing goes through
any other server.

## Requirements

- A Supernote with plugin support (Chauvet firmware 3.30 or later; tested on a Manta).
- An Anthropic API key, from [console.anthropic.com](https://console.anthropic.com) → API Keys.
  You pay for what you use. Create a key just for the tablet and give it a spending limit.

## Install

1. Copy `superclaude.snplg` into the `MyStyle` folder on the tablet (USB, Browse & Access, or
   Supernote Cloud).
2. On the tablet: Settings → Apps → Plugins → Add plugin → SuperClaude.
3. Lasso something and tap **SuperClaude**. The first time it asks for permission to read files
   and use the internet ("Always allow"), and it creates three files in `MyStyle`:

| File | What goes in it |
| --- | --- |
| `superclaude-api-key.txt` | Your Anthropic API key, on its own line. |
| `superclaude-prompt.txt` | Your own instructions: who you are, what you use it for, the language, tone and length you want. |
| `superclaude-config.txt` | `model = …` (default `claude-opus-5-5`), `effort = …` (`low`, `medium`, `high`), `language = …` for the interface (`en` or `es`). |

4. Put your key in `superclaude-api-key.txt` (edit it on a computer and sync, or copy it over USB).
   Lines starting with `#` are comments.

Changes to these files apply the next time you lasso something; no reinstall needed.

## How it works

- `src/captura.js` takes a PNG of the lasso selection (`generateLassoPreview`).
- `src/claude.mjs` sends it to the Messages API with code execution enabled. The built-in system
  prompt (math as LaTeX, e-ink friendly drawings, how to put things on the page) is combined with
  the user's `superclaude-prompt.txt`.
- `src/matematica.js` typesets the LaTeX with plain React Native `Text`/`View` (KaTeX is used only
  as a parser): plugins have no WebView or SVG.
- Drawings are made by Claude with matplotlib in Anthropic's code execution sandbox. Next to each
  PNG it exports the figure as polylines and labels (`src/trazos_py.mjs`, a small matplotlib
  renderer), and `src/insertar.js` inserts those as pen strokes and text boxes. Plugins cannot write
  files, so inserting the PNG itself is not possible.
- Plugins lose their memory when their window is hidden, and cannot write files. `src/memoria.mjs`
  keeps the last conversation as folder names in the plugin's private folder. Unusual, but it only
  uses the SDK's `FileUtils`.

Some of this relies on undocumented SDK behavior and may break with a firmware update.

## Build

```sh
npm install
npm run build:plugin        # → build/outputs/superclaude.snplg (no API key inside)
```

No Android SDK needed: the plugin has no native code, so the package is the JS bundle, the icon,
`PluginConfig.json` and the config templates (`plantillas/`), zipped.

To try the same request the tablet makes, from a computer:

```sh
SUPERCLAUDE_API_KEY=sk-ant-… node scripts/probar-claude.mjs scripts/muestra.png "and divided by 3?"
node scripts/probar-memoria.mjs           # round trip of the conversation memory
python scripts/ver-trazos.py x.trazos.json x.png   # what "Insert on page" would draw
```

The code and comments are in Spanish; the interface is in English or Spanish.

## License

MIT
