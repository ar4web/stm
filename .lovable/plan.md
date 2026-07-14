## Scope

Two changes to the static app under `public/stamp/`: `index.html`, `app.js`, `style.css`. No route or backend work.

## 1. Lock the canvas in place

Today the canvas can be panned (drag with space / middle mouse / touch) and the view drifts when panels open. Goal: canvas is rigidly centered in its area and never moves.

- Remove pan handlers (mousedown/move/up + touch equivalents) and any code that mutates `view.panX/panY`. Keep zoom (wheel + zoom HUD buttons) intact.
- On every render and on window/panel resize, recompute the fit-zoom and re-center so the stamp always sits in the middle of the available canvas area, regardless of left-panel width.
- Reset cursor logic: no more `grab` / `grabbing` cursor; selection / move-layer cursors stay as-is (those move layers inside the stamp, not the canvas).
- Drop "Pan" from any tool list / shortcuts; spacebar no longer toggles pan mode.

## 2. Rebuild the left rail as a single accordion panel

Replace the current left sidebar with a BeFunky-style **single rail with inline accordion sections**. No separate icon column — one ~260px panel on the left, scrollable, with collapsible section headers and full-width icon+label buttons inside each section.

Section layout (top → bottom):

- **Stamp Shape** — chips for Circle, Double Ring, Triple Ring, Oval, Rectangle, Square, Minimal, Saudi CO. (the `STAMP_TEMPLATES` presets). Clicking applies preset without dropping existing text/shape layers.
- **Add** — Add Curved Text, Add Straight Text, Add Shape, Add Image, Add Logo.
- **Layers** — compact list of current layers; click to select, double-click to rename, drag to reorder, eye toggle for visibility, lock toggle, trash to delete.
- **Properties** _(only mounted when a layer is selected)_ — context editor for that layer (text/shape/image fields, channel snap for curved text, per-layer color with "Use ink" reset, flip, alignment).
- **Rings** — outer / middle / inner thickness + per-ring color swatches, ring-gap, center-area size.
- **Global** — ink color, paper size, background toggle.
- **Export** — PNG, SVG, PDF buttons.

Each section uses the accordion pattern from the reference:

```text
[ Section Title              ▾ ]
  [icon] Label                [+]
  [icon] Label
  ...
```

Buttons are full-width, 36px tall, icon left + label, hover highlights. Section headers are sticky inside the scroll container so the user always sees where they are.

Sections remember their open/closed state in `localStorage` so the rail feels stable across reloads. Default state: Stamp Shape + Add + Layers open; Properties auto-opens when a layer is selected; others closed.

The right-side panel is removed entirely — everything lives in this one rail. The top bar keeps File / Undo / Redo / Zoom HUD / Export shortcut.

## Files

- `public/stamp/index.html` — replace left sidebar markup with the new accordion shell; remove right panel; remove pan-related UI hints.
- `public/stamp/app.js` — delete pan handlers; add `fitAndCenter()` called on render + resize; rebuild left-panel renderer to emit accordion sections; persist section open state; wire each section's buttons to existing logic (`applyPreset`, `makeLayer`, layer ops, ring/global setters, exporters).
- `public/stamp/style.css` — new accordion styles (`.accordion`, `.accordion__section`, `.accordion__header`, `.accordion__panel`, `.tool-btn`), sticky headers, fixed left-rail width, remove right-panel styles, remove grab cursors.

## Out of scope

- Export pipeline, PDF/PNG output, font set, ring geometry math.
- React shell (`src/routes/index.tsx`) — still just iframes the static app.
- Mobile layout (rail stays desktop-first; existing responsive collapse kept as-is).
