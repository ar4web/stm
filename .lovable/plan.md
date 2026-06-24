# Why the current UI feels broken

Three problems, one shared root cause.

1. **Left sidebar feels empty / useless.** In `renderLeftSidebar()` (app.js:1786), when the selected layer is text (curved or straight) the left panel's `lsContext` is cleared and all controls are pushed into the *right* panel's "Text Properties" section. Text layers are the most common selection, so the left sidebar is blank most of the time. Only shape/image layers populate it.

2. **Selecting a layer doesn't open the editor.** Clicking a layer row in the right-side Layers list (app.js:2253) only sets `selId` and calls `buildLayerProps()`. Because the editor lives in the *same* right panel (further down, often scrolled off-screen) and the left sidebar is hidden for text layers, nothing visibly happens. The user clicks a layer and sees no change → "not possible to edit".

3. **Layer names changed.** `buildLayerList` renders `l.name || l.text || 'Layer'` (app.js:2246). When a layer is created from a template or via "Add Layer", `name` is often empty, so the row shows the raw text content (or the literal word "Layer" when text is empty). Names also don't update when the user edits the text.

# Fix plan (UI-only, no canvas/geometry changes)

## 1. Make the left sidebar the single contextual editor (Canva-style)

Route **all** layer editing to `lsContext`, for every layer type.

- In `renderLeftSidebar()` (app.js:1780-1814):
  - For text layers: render `buildTextContextHTML(l)` into `lsContext` (instead of the right panel) and bind with `bindTextContextInputs`.
  - For shape / image layers: keep current behavior.
  - For no selection: render the stamp props (`buildStampContextHTML`) into `lsContext` as a "Stamp" editor — so the panel is never blank.
- Always keep the left sidebar visible. Delete the auto-collapse branch in the tool-rail script (index.html:430-433).
- Replace the static `data-panel-group` blocks with a single live container. The tool rail (`L S A R C E X`) becomes a quick-jump that scrolls `lsContext` to the matching section header (Layers list, Add, Shapes, Rings, Style, Export) — all rendered inside the left sidebar.

## 2. Right panel becomes a thin Layers + global rail (optional minimisation)

- Right panel keeps only: **Layers list**, **Stamp size/shape**, **Rings**, **Color & Effects**, **Export**. These are global/structural — not per-layer text editing.
- Delete the right-side "Text Properties" section (index.html:214-223) and `renderRightTextProps()` (app.js:1824-1841) entirely. One editor location, no duplication.

## 3. Clicking a layer row opens its editor and scrolls into view

In `buildLayerList()` click handler (app.js:2253-2317):
- After `buildLayerProps()`, scroll the left sidebar to top and flash a 1-frame highlight on the editor header so the user sees the panel update.
- Double-click on `.layer-name` enters rename mode (contenteditable span); Enter / blur commits to `l.name`, re-renders the list.

## 4. Restore meaningful, stable layer names

- In `makeLayer` (wherever layers are constructed), set a default `name` when missing:
  - text layers → `'Top Arc'` / `'Bottom Arc'` / `'Line 1'` etc., based on position; fall back to first 18 chars of `text`.
  - shape layers → `'Star'`, `'Hexagon'`, … from `shapeType`.
  - image layers → `'Logo'` or imported filename.
- In the text-content input's `input` handler inside `bindTextContextInputs`: if the layer's `name` is still the auto-generated default (track with `l._autoName = true`), update `name` to follow the text live; once the user renames manually, set `_autoName = false`.
- Update `buildLayerList()` row template to show `l.name` only (never fall back to raw `l.text`), with the type tag (`ARC` / `LINE` / `STAR` / `IMG`) for clarity.

## 5. Keep the curved-text / ring fix from the earlier plan intact

No changes to `drawCurvedLayer`, `textEllipseFor`, slider semantics, or hit-testing. This is a pure UI re-wire.

# Files touched

- `public/stamp/index.html` — remove right-side Text Properties section; simplify left sidebar to a single live `#lsContext`; tweak tool-rail script to scroll instead of collapse.
- `public/stamp/app.js` — rewrite `renderLeftSidebar()` to host every editor; delete `renderRightTextProps()`; add layer-row scroll-into-view + rename; add auto-name logic in `makeLayer` and text input handler; update layer-list row template.
- `public/stamp/style.css` — minor: ensure left sidebar always shows; style the rename input and editor section headers.

# What the user will see

- Click any layer → left sidebar instantly shows that layer's full editor (text, font, size, alignment, curve, color), focused at the top.
- Double-click a layer name to rename it; names stay readable and update as you type.
- Nothing selected → left sidebar shows the Stamp editor (size, shape, presets) instead of going blank.
- Right panel stays compact: Layers list + global Rings / Color / Export.
