# SuperClaude

Lasso anything on your Supernote and ask Claude about it.

Select handwriting, a sketch or a piece of a PDF with the lasso, tap **SuperClaude**, write what you
want ("solve it", "what does this mean?", "draw it"), and Claude looks at it. A fast model guesses
your request and leaves it in the box; send it as is, edit it, or clear it with ✕. The answer opens in a
window, with the math typeset, and you can keep asking follow-ups. Claude also gets the whole page as
context (the exercise statement, earlier steps, the topic), while the window shows only your
selection.

- **Calculator and tutor**: equations, integrals, unit conversions, step by step.
- **Charts and drawings**: ask for a graph (2D or 3D), an illustration or a diagram ("an animal cell
  with its organelles", "a four-stroke engine in cross-section"), or ask it to trace a real image from
  the web ("trace Leonardo's Vitruvian Man"). Claude picks how: matplotlib for charts, an SVG it
  draws itself for illustrations, or a search on Wikimedia Commons and a trace of the image. On
  **Best** it then looks at its own drawing and redraws it if it can do better; a detailed
  illustration takes several minutes there. The drawing shows up in
  the window, and inserting puts it on your page as real ink strokes you can move and erase. In
  notes you choose **In this layer** or **In a new layer** (a fresh layer, handy to drag the drawing
  away from what's under it); it is left selected, and you stay on the layer where it went.
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

1. Download `superclaude.snplg` from the [latest release](../../releases/latest) and copy it into
   the `MyStyle` folder on the tablet (USB, Browse & Access, or Supernote Cloud).
2. On the tablet: Settings → Apps → Plugins → Add plugin → SuperClaude.
3. Open the plugin's settings: the config button next to SuperClaude in Settings → Apps → Plugins,
   or ⚙ in the SuperClaude window. There you set:

| Setting | |
| --- | --- |
| Anthropic API key | Typed once; only its last characters are shown afterwards. |
| Model | **Fast** (Claude Haiku 5.5), **Balanced** (Claude Sonnet 5.5) or **Best** (Claude Opus 5.5, thinking harder and checking its drawings: slower and pricier). Also switchable from the chat window. |
| Interface language | English or Español. |
| Your instructions for Claude | Who you are, what you use it for, the language, tone and length you want. Sent with every question. |

   **Import from MyStyle** fills the key and the instructions from `superclaude-api-key.txt` and
   `superclaude-prompt.txt` in `MyStyle`, if you put them there (lines starting with `#` are
   ignored). Reading those files depends on the firmware and may not work.
4. Lasso something and tap **SuperClaude**. The first time it asks for permission to read files
   and use the internet ("Always allow").

The package ships with no API key, and nothing is sent anywhere except the Anthropic API.

## How it works

- `src/captura.js` takes a PNG of the lasso selection (`generateLassoPreview`) and one of the whole
  page (`generateNotePng` after `saveCurrentNote`, or `generateCurrentDocImage` in a PDF/EPUB); the
  page goes as a second image with the selection's position, only as context.
- `src/claude.mjs` sends it to the Messages API with code execution enabled. The built-in system
  prompt (math as LaTeX, e-ink friendly drawings, how to put things on the page) is combined with
  the user's own instructions from Settings.
- `src/matematica.js` typesets the LaTeX with plain React Native `Text`/`View` (KaTeX is used only
  as a parser): plugins have no WebView or SVG.
- Drawings are made by Claude in Anthropic's code execution sandbox, always ending as a matplotlib
  figure: charts directly; illustrations as hand-written SVG turned into a figure by
  `src/svg_py.mjs` (a small SVG reader: the sandbox has no SVG library); traced images with
  `src/calcar_py.mjs` (OpenCV and scikit-image: skeleton of the lines, or outlines for engravings
  and photos). To trace, Claude searches the web and calls the `bajar_imagen` tool: the tablet
  downloads the image and uploads it to the container, which has no internet. Next to each
  PNG it exports the figure as polylines and labels (`src/trazos_py.mjs`, a small matplotlib
  renderer), and `src/insertar.js` inserts those as pen strokes and text boxes. Requests are
  streamed, since a large drawing takes minutes. Plugins cannot write
  files, so inserting the PNG itself is not possible. These files live in your Anthropic account's
  Files API storage; the ones from a conversation are deleted when a new lasso replaces it.
- Plugins lose their memory when their window is hidden, and cannot write files. `src/memoria.mjs`
  keeps the last conversation, and `src/ajustes.js` the settings, as folder names in the plugin's
  private folder. Unusual, but it only uses the SDK's `FileUtils`.

Some of this relies on undocumented SDK behavior and may break with a firmware update.

## Build

```sh
npm install
npm run build:plugin        # → build/outputs/superclaude.snplg (no API key inside)
```

No Android SDK needed: the plugin has no native code, so the package is the JS bundle, the icon,
`PluginConfig.json`, zipped.

To try the same request the tablet makes, from a computer:

```sh
SUPERCLAUDE_API_KEY=sk-ant-… node scripts/probar-claude.mjs scripts/muestra.png "and divided by 3?"
node scripts/probar-memoria.mjs           # round trip of the conversation memory
python scripts/ver-trazos.py x.trazos.json x.png   # what "Insert on page" would draw
```

The code and comments are in Spanish; the interface is in English or Spanish.

## License

MIT
