## Scope

Five changes to `public/stamp/index.html`, `public/stamp/app.js`, `public/stamp/style.css`. No backend/route changes.

### 1. Restore the Quick Stamp Shape / Ring presets row

Re-add the preset chip strip (Circle, Double Ring, Triple Ring, Oval, Rectangle, Square, Minimal, Saudi CO.) from `STAMP_TEMPLATES`. Place it as a compact horizontal scroller at the **top of the canvas area** (above the stamp) so it's always one click away, no matter what's selected. Clicking a chip applies that template's ring count / shape / dimensions without nuking existing text layers (preserve text, replace stamp geometry only).

### 2. Text auto-snaps between outer + middle ring (curved layers)

For any **curved** text layer, its `radiusMm` is no longer a free slider. It is computed from the current stamp geometry so the baseline sits in the "channel" between the outer ring and the next inner ring:

```
channelOuter = outerDiameter/2 - outerRingThickness
channelInner = channelOuter - ringGap
baselineR    = (channelOuter + channelInner) / 2
```

For triple-ring stamps, a second channel between inner ring 1 and inner ring 2 is offered via a small "Top channel / Bottom channel" toggle on the text layer. Straight (horizontal) text stays inside the center area as today. The `radiusMm` slider is hidden for curved layers (replaced by the channel toggle); existing layers get their `radiusMm` snapped on load.

Result: text always rides cleanly between two rings like a wall, no overlap.

### 3. Compact, contextual right panel

Right panel is hidden by default. It only mounts when a layer is selected (`selId` non-null) **or** a ring is selected. When mounted, it shows ONLY editors relevant to that selection:

- Text layer → text content, font, weight, size, letter spacing, alignment, channel toggle, color, flip.
- Shape/symbol layer → shape picker, size, offset, color.
- Image layer → replace image, size, offset, opacity.
- Ring selected → that ring's thickness + color.

Global stamp settings (shape, ring count, gaps, center area) move into a small **gear popover** on the top bar. Layers list collapses into a thin strip on the left rail. Controls themselves get tighter spacing (`--ctl-h: 28px`, `--gap: 6px`) and 2-column grids where it makes sense (size + spacing on one row, etc.).

### 4. Right panel edits only the selected layer

Audit every binding in `buildLayerProps()` / `bindTextContextInputs()`: each input writes to `selLayer()` resolved at event time (not cached at render). When selection changes, the panel re-renders from scratch so stale handlers cannot leak edits to the wrong layer. Multi-select edits are explicitly opt-in (already the case — left as-is).

### 5. Color-coded selection highlight on the canvas

Each selectable element gets a stable highlight color so the user sees what they're editing:

- Outer ring selected → ring drawn with red overlay stroke.
- Inner ring 1 → green overlay.
- Inner ring 2 → blue overlay.
- Selected curved text layer → text rendered in the standard color **plus** an orange dashed baseline arc and orange bbox.
- Selected straight text → orange dashed bbox.
- Selected shape/image layer → cyan dashed bbox.

Highlights are overlay-only (don't mutate the layer's actual color so export stays clean). Add a small legend chip near the selected element's label in the panel header so the color mapping is discoverable.

## Files

- `public/stamp/index.html` — add preset strip container above canvas; remove always-mounted right panel markup; add gear popover for global stamp settings; tighten tool rail.
- `public/stamp/app.js` — add `applyPreset(name)` that preserves layers; add `snapCurvedRadius(layer)` helper called on render and on selection; rewrite `buildLayerProps()` to mount/unmount based on selection and resolve `selLayer()` lazily inside handlers; add selection overlay drawing in the canvas render pass.
- `public/stamp/style.css` — preset chip strip styles; compact control sizing tokens; hidden-by-default right panel slide-in; selection overlay colors.

## Out of scope

- No changes to export pipeline or PDF/PNG output.
- No new fonts or assets.
- Multi-select editing UX stays as-is.
