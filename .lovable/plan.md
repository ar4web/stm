## Root cause

All three symptoms come from **one bug** in `app.js`: the formula that computes the ellipse the text rides on. Everything else (selection handles, marquee, slider feel) is downstream of it.

### The broken formula

`drawCurvedLayer` at lines 506–514:

```js
if (cfg.shape === 'oval') {
  const inset = rx - layer.radiusMm;          // horizontal inset only
  textRx = mmPx(layer.radiusMm);              // X radius = slider value
  textRy = mmPx(Math.max(2, ry - inset));     // Y radius = ry − (rx − radiusMm)
}
```

For a circle this collapses correctly (`rx === ry`). For an **oval** it produces an ellipse that has nothing to do with the actual ring:

- Picture a 62×36 mm oval with `radiusMm = 28`. The text rides on an ellipse with Rx = 28 mm but Ry = 18 − (31 − 28) = 15 mm — a much flatter ellipse than the ring (which is roughly 30×17 mm inset by ring thickness). So Arabic text on the bottom of the oval drifts off the ring, "swims", and looks centered on a different curve than the user can see.
- The same wrong `lRx / lRy` is used in three more places, so selection handles, the marquee outline, and the "eye" preview all sit on the wrong ellipse too:
  - lines 833–844 (`mlRx / mlRy` marquee in `render`)
  - lines 877–890 (handles + `lRxPx / lRyPx`)
  - lines 922–935 (eye-layer outline)
- The `radiusMm` slider feeds straight into that formula, so dragging it moves the text along a curve that does not match the ring — the user perceives it as "the slider doesn't work" / "the mouse selector is off".

The handles drawn at `cx + cos(θ)·lRxPx, cy + sin(θ)·lRyPx` therefore land off the visible text path, so click hit-tests miss and dragging feels random. Fix the geometry once and selection + slider feel correct automatically.

## The fix (3 small, surgical changes — no redesign)

### 1. Single source of truth: `textEllipseFor(layer)` helper

Add one helper near the drawing section that returns `{ rx, ry }` in **mm** for any layer, used by every consumer:

```text
inset_mm = outer_thickness + ring_gap + (radiusOffset || 0)  // mm from outer edge
rx_text  = stamp_rx_mm - inset_mm
ry_text  = stamp_ry_mm - inset_mm          // for circle these are equal
```

This makes the text ellipse share the same eccentricity as the ring, so on an oval the text traces the ring's actual curve. For a circle behavior is identical to today.

### 2. Reinterpret the `radiusMm` slider as an inset (backward compatible)

Keep the field name in `cfg` so saved presets still load, but treat it as **inset from outer edge** when the shape is oval/circle. Migration: on load, if `layer.radiusMm` looks like an absolute radius (≥ small threshold), convert once to inset = `stamp_rx − radiusMm`. The slider range/label in the panel (around line 2016) becomes "Distance from edge (mm)" with `min 0`, `max ~stamp_rx/2`.

Result: one slider correctly drives both axes of the ellipse; no extra control needed; oval and circle both behave naturally.

### 3. Route all four call sites through the helper

Replace the duplicated oval/circle blocks with `const { rx, ry } = textEllipseFor(layer)` and use those:

- `drawCurvedLayer` (506–514, 522–525): text positions + tangent now use matching `textRx / textRy`.
- `render()` marquee block (833–844): marquee ellipse traces the same path → selection box hugs the text.
- `render()` handles block (877–895): start/end/radius handles sit **on** the text → clicking and dragging them works.
- Eye-preview block (922–935): preview matches main render.

The tangent math at line 525 already handles non-equal Rx/Ry correctly; no change needed there.

## What this fixes for the user

- Curved text rides the **actual** ring on oval stamps (and stays correct on circles).
- The `radiusMm` slider produces the motion the user expects (text moves in/out from the ring edge along both axes).
- Mouse selection + drag handles land on the visible text, so picking and adjusting a curved layer works.
- The selection marquee around a curved layer matches the text path.

## Out of scope (per "fix only the 3 bugs")

No redesign of the customization panels, no new layer types, no styling changes — only the geometry helper, slider semantics, and the four call-site swaps.

## Files touched

- `app.js` — add `textEllipseFor`, swap four call sites, one-time migration of `layer.radiusMm` on load.
- `index.html` / `style.css` — untouched.
