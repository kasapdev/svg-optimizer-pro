# SVG Optimizer Pro

[![CI](https://github.com/kasapdev/svg-optimizer-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/kasapdev/svg-optimizer-pro/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-F7DF1E?logo=javascript&logoColor=black)

Strip cruft, collapse whitespace and round path precision to shrink hand-edited SVGs — with a live before/after size comparison and rendered preview, fully offline.

> A real, from-scratch SVG minifier — no SVGO, no dependencies. Paste an SVG exported from Illustrator or Inkscape, watch it shrink in real time, and see the original and optimized markup rendered side by side to confirm nothing broke.

## Overview

SVG Optimizer Pro is part of the **Web Utility Suite**. It runs entirely in the browser with no build step, no frameworks, and no network calls — open `index.html` from disk and it works. The optimizer is hand-written vanilla JavaScript: a `DOMParser`/`XMLSerializer` pass handles structural cleanup (comments, editor cruft, empty containers, whitespace) safely by namespace and tag, followed by a regex-based numeric scanner that rounds coordinate and path data to a configurable precision. The two-pane layout pairs a raw input editor with the optimized output, backed by a byte-accurate stats bar and a side-by-side rendered preview so you can visually confirm the optimization didn't change how the SVG looks.

## Features

- **Strip XML comments** — removes every `<!-- ... -->` comment node, anywhere in the document.
- **Strip `<title>`/`<desc>`** — optional (default on), with an explicit accessibility note in the UI since these elements matter for screen readers.
- **Strip editor metadata cruft** — removes Inkscape/Sodipodi/Dublin-Core/Creative-Commons/RDF elements and attributes (`<sodipodi:namedview>`, `<rdf:RDF>`, `inkscape:*` attributes, etc.), the leading `<?xml ...?>` declaration, and any `xmlns:*` namespace declaration that ends up unused after cleanup — then removes `<defs>`/`<metadata>` blocks that are left empty as a result.
- **Collapse structural whitespace** — removes indentation/newline text nodes that sit purely *between* element tags, while leaving whitespace **inside** `<text>`, `<tspan>`, `<textPath>`, `<tref>`, `<style>` and `<script>` completely untouched.
- **Numeric precision rounding** — a real regex-based number scanner (handles negative, decimal and scientific-notation forms) rounds every number inside `d`, `points`, `transform`, `viewBox`, `x`/`y`/`width`/`height`/`cx`/`cy`/`r`/`rx`/`ry`/`x1`/`y1`/`x2`/`y2` and numeric `style` properties (`stroke-width`, `opacity`, `font-size`, …) to a configurable decimal precision (0–4, default 2), trimming trailing zeros and dangling decimal points (`12.340000` → `12.34`, `5.00` → `5`). Color-bearing attributes/properties (`fill`, `stroke`, `style` colors) are never touched, so hex colors can't be corrupted.
- **Live before/after byte size** — original bytes, optimized bytes, bytes saved and percent saved, computed with `Blob` for accurate UTF-8 byte counts (not `.length`).
- **Side-by-side rendered preview** — both the original and optimized SVG are parsed, validated and rendered live in the browser so you can confirm the output still looks identical.
- **Graceful error handling** — invalid/unparseable SVG surfaces a clear error panel (with line/column when the browser's XML parser reports one) instead of crashing.
- **Copy** and **Download `.svg`** (correct `image/svg+xml` mime type) for the optimized output.
- **Upload** an `.svg` file or **Load sample** — a realistic Inkscape-exported sample with comments, an XML declaration, editor cruft, hand-edited whitespace and long decimal path coordinates, ready to demonstrate every optimization.
- **Live re-optimization** — output updates automatically (debounced) as you type or toggle any option.
- **Auto-persist** — your last input and option settings are saved to `localStorage` and restored on return.
- **Dark & light themes**, fully responsive down to 360px, accessible, and keyboard-driven.

## Installation

No dependencies, no build step.

```bash
git clone https://github.com/kasapdev/svg-optimizer-pro.git
cd svg-optimizer-pro
```

Then simply open `index.html` in any modern browser (double-click it, or `file://` it). That's it.

## Usage

1. Paste or type SVG markup into the **Input** pane — or click **Sample** to load an example, or **Upload** an `.svg` file.
2. Toggle **Strip comments**, **Strip title/desc**, **Strip editor metadata** and **Collapse whitespace** as needed, and set the **Decimal precision** (0–4).
3. Click **Optimize** (or press <kbd>Ctrl/⌘</kbd>+<kbd>Enter</kbd>) — output re-optimizes live as you type or change options.
4. Check the stats bar for original/optimized byte size and percent saved, and compare the **Before**/**After** rendered previews to confirm the SVG still looks right.
5. If the SVG is invalid, read the error panel for the message (and line/column when available).
6. **Copy** the result or **Download** it as a `.svg` file.

## Keyboard Shortcuts

| Action                     | Shortcut                       |
| --------------------------- | ------------------------------ |
| Optimize SVG                | <kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd> |
| Download optimized `.svg`   | <kbd>Ctrl/⌘</kbd> + <kbd>S</kbd> |
| Show shortcuts help         | <kbd>?</kbd>                    |
| Close dialog                 | <kbd>Esc</kbd>                  |

## Screenshots

> _Screenshots coming soon._

![screenshot](docs/screenshot-1.png)
![screenshot](docs/screenshot-2.png)

## Roadmap

- [ ] Path data re-serialization / curve simplification (beyond precision rounding of existing numbers)
- [ ] Merge duplicate gradient/filter `<defs>` and collapse identical style blocks
- [ ] Convert absolute path commands to relative (and vice versa) for extra byte savings
- [ ] Batch optimization of multiple uploaded SVG files at once
- [ ] Configurable output formatting (pretty-print vs. fully minified) for the optimized code view

## License

MIT Licensed. Part of the Web Utility Suite.

---

## Part of the kasapdev Tools Suite

One of 45+ zero-dependency vanilla JS tools, all free and open source — [see the full list](https://github.com/kasapdev/kasapdev).
