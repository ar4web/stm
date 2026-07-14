"use strict";
/* ================================================================
   PRO STAMP STUDIO — app.js
   Bug-fixed, redesigned JavaScript engine.
   Works 100% locally — no server required.
   ================================================================ */

/* ── Constants ─────────────────────────────────────────────────── */
const CSS_DPI = 96;
const CSS_MM = CSS_DPI / 25.4; // CSS px per mm  (screen preview)
const DEG = Math.PI / 180;

let DPI_CURRENT = 300;
const mmPx = (mm) => mm * (DPI_CURRENT / 25.4);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const uid = () => "L" + Math.random().toString(36).slice(2, 8);

/* ── Undo / Redo history ────────────────────────────────────────── */
const HIST_MAX = 60;
let histStack = [];
let histIdx = -1;
let histPushing = false;

function pushHistory() {
  histStack = histStack.slice(0, histIdx + 1);
  histStack.push(JSON.stringify(cfg));
  if (histStack.length > HIST_MAX) histStack.shift();
  histIdx = histStack.length - 1;
  histPushing = false;
  saveState();
}

function undo() {
  if (histIdx <= 0) return;
  histIdx--;
  cfg = JSON.parse(histStack[histIdx]);
  DPI_CURRENT = cfg.dpi || 300;
  syncAll();
  render();
  showToast("Undo");
}

function redo() {
  if (histIdx >= histStack.length - 1) return;
  histIdx++;
  cfg = JSON.parse(histStack[histIdx]);
  DPI_CURRENT = cfg.dpi || 300;
  syncAll();
  render();
  showToast("Redo");
}

function autoHist() {
  if (!histPushing) {
    histPushing = true;
    pushHistory();
  }
}

/* ── RTL detection ─────────────────────────────────────────────── */
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const isRTL = (t) => RTL_RE.test(t || "");
const layerDir = (l) => (l.dir === "auto" ? (isRTL(l.text) ? "rtl" : "ltr") : l.dir);

/* ── Debounce ──────────────────────────────────────────────────── */
const debounce = (fn, ms = 40) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

/* ── Seeded RNG (mulberry32) — stable per render, no flicker ──── */
function mkRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── hex → rgba ────────────────────────────────────────────────── */
function hexRgba(hex, opacity) {
  let c = (hex || "#000000").replace("#", "").trim();
  if (c.length === 3)
    c = c
      .split("")
      .map((x) => x + x)
      .join("");
  if (!/^[0-9a-fA-F]{6}$/.test(c)) c = "000000";
  const n = parseInt(c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(opacity / 100, 0, 1)})`;
}

/* ── Keyboard shortcuts modal ──────────────────────────────────── */
function toggleShortcuts() {
  document.getElementById("shortcutsOverlay").classList.toggle("visible");
}

/* ── localStorage persistence ──────────────────────────────────── */
const STORAGE_KEY = "prostampstudio_config";

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (_) {
    /* quota exceeded, ignore */
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return false;
    cfg = buildConfig(data.template || "oval");
    Object.assign(cfg, data);
    if (!Array.isArray(cfg.layers) || cfg.layers.length === 0) cfg.layers = defaultLayers();
    cfg.layers = cfg.layers.map((l) => makeLayer(l));
    DPI_CURRENT = cfg.dpi || 300;
    selId = cfg.layers[0].id;
    selectedIds = new Set([selId]);
    return true;
  } catch {
    return false;
  }
}

/* ── Toast ─────────────────────────────────────────────────────── */
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 1900);
}

/* ================================================================
   FONTS
   ================================================================ */
const FONTS = [
  { group: "Universal (all languages)", items: ["Noto Sans", "Noto Serif"] },
  { group: "Arabic", items: ["Noto Sans Arabic", "Noto Naskh Arabic", "Noto Kufi Arabic"] },
  { group: "CJK", items: ["Noto Sans SC", "Noto Sans JP", "Noto Sans KR"] },
  {
    group: "Indic / Other scripts",
    items: ["Noto Sans Devanagari", "Noto Sans Thai", "Noto Sans Hebrew"],
  },
];

const FONT_WEIGHTS = {
  "Noto Sans": [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Noto Serif": [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Noto Sans Arabic": [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Noto Naskh Arabic": [400, 500, 600, 700],
  "Noto Kufi Arabic": [400, 500, 700, 800, 900],
  "Noto Sans SC": [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Noto Sans JP": [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Noto Sans KR": [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Noto Sans Devanagari": [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Noto Sans Thai": [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Noto Sans Hebrew": [100, 200, 300, 400, 500, 600, 700, 800, 900],
};

function safeWeight(font, weight) {
  const list = FONT_WEIGHTS[font];
  if (!list) return weight;
  if (list.includes(weight)) return weight;
  let best = list[0];
  for (const w of list) {
    if (Math.abs(w - weight) < Math.abs(best - weight)) best = w;
  }
  return best;
}
function fontOptHTML(sel) {
  return FONTS.map(
    (g) =>
      `<optgroup label="${g.group}">` +
      g.items.map((f) => `<option${f === sel ? " selected" : ""}>${f}</option>`).join("") +
      "</optgroup>",
  ).join("");
}

/* ================================================================
   STATE MODEL
   ================================================================ */
function autoLayerName(l) {
  if (l.type === "shape") return (l.shapeType || "Shape").replace(/^./, (c) => c.toUpperCase());
  if (l.type === "image") return l.imageName || "Image";
  const t = (l.text || "").trim();
  if (t) return t.length > 22 ? t.slice(0, 22) + "…" : t;
  return l.mode === "curved" ? "Curved text" : "Line text";
}
function makeLayer(o = {}) {
  const base = Object.assign(
    {
      id: uid(),
      name: "",
      text: "Text",
      font: "Arial",
      weight: 800,
      sizeMm: 4,
      letterSpacing: 0,
      wordSpacing: 0,
      scaleX: 1,
      scaleY: 1,
      dir: "auto",
      mode: "curved",
      flip: false,
      radiusMm: 16,
      startAngle: 200,
      endAngle: 340,
      offsetXmm: 0,
      offsetYmm: 0,
      visible: true,
      color: null, // per-layer override; null = inherit cfg.inkColor
      type: "text",
      shapeType: "star",
      shapeSizeMm: 10,
      shapeRotation: 0,
      shapeFill: true,
      shapePoints: 5,
      imageData: null,
      imageWidthMm: 10,
      imageHeightMm: 10,
    },
    o,
  );
  // Treat placeholder names from older code/templates as auto so they get refreshed.
  const placeholder =
    !base.name ||
    base.name === "Text" ||
    base.name === "Shape" ||
    base.name === "Image" ||
    base.name === "Layer";
  if (placeholder) {
    base.name = autoLayerName(base);
    base._autoName = true;
  } else if (base._autoName === undefined) {
    base._autoName = false;
  }
  return base;
}

/* Snap a curved layer's radius to the channel between two rings (the "wall"
   the user wants the text to ride). Returns radius in mm. */
function ringChannelRadiusMm(channel = "outer") {
  const sz = stampSize();
  const r = Math.min(sz.w, sz.h) / 2;
  const ot = cfg.outerRingThickness || 0;
  const it = cfg.innerRingThickness || 0;
  const it2 = cfg.innerRing2Thickness || 0;
  const gap = cfg.ringGap || 0;
  if (channel === "outer") {
    // Channel between outer ring inner-edge and middle ring outer-edge.
    return Math.max(2, r - ot - gap / 2);
  }
  if (channel === "inner") {
    return Math.max(2, r - ot - gap - it - gap / 2);
  }
  if (channel === "center") {
    const c = (cfg.centerAreaDiameter || 0) / 2;
    const innerEdge = r - ot - gap - it - (cfg.rings >= 3 ? gap + it2 : 0);
    return Math.max(2, (innerEdge + c) / 2);
  }
  return r - ot - gap / 2;
}

function defaultLayers() {
  return [
    makeLayer({
      name: "Shape",
      text: "شركة بصمة الموارد المحدودة",
      font: "Noto Sans Arabic",
      dir: "rtl",
      weight: 800,
      sizeMm: 4.5,
      mode: "curved",
      flip: false,
      radiusMm: 16,
      startAngle: 200,
      endAngle: 340,
    }),
    makeLayer({
      name: "Shape",
      text: "LIMITED RESOURCE STAMP CO.",
      font: "Noto Sans",
      dir: "ltr",
      weight: 700,
      sizeMm: 3.8,
      mode: "curved",
      flip: true,
      radiusMm: 15.8,
      startAngle: 145,
      endAngle: 35,
      letterSpacing: 1.5,
    }),
    makeLayer({
      name: "Shape",
      text: "1234567890",
      font: "Noto Sans",
      weight: 900,
      sizeMm: 3.2,
      mode: "straight",
      offsetYmm: 0,
    }),
  ];
}

function baseStyle() {
  return {
    inkColor: "#1e3a8a",
    opacity: 100,
    ringColors: { outer: null, inner: null, inner2: null, center: null }, // null = inherit inkColor
    ringVisible: { outer: true, inner: true, inner2: true, center: true },
    inkBleed: true,
    inkBleedAmount: 0.5,
    grungeTexture: true,
    grungeAmount: 0.3,
    rotationJitter: true,
    jitterDegrees: 0.9,
    paddingMm: 5,
    seed: 73219,
    dpi: 300,
  };
}

/* ── Template definitions ──────────────────────────────────────── */
const TEMPLATES = {
  standardCircle: {
    label: "Circle",
    shape: "circle",
    outerDiameter: 42,
    width: 42,
    height: 42,
    outerRingThickness: 1.6,
    innerRingThickness: 0.7,
    ringGap: 2.2,
    centerAreaDiameter: 14,
    cornerRadius: 3,
    rings: 2,
  },
  doubleRing: {
    label: "Double Ring",
    shape: "circle",
    outerDiameter: 46,
    width: 46,
    height: 46,
    outerRingThickness: 2.0,
    innerRingThickness: 1.1,
    ringGap: 1.6,
    centerAreaDiameter: 20,
    cornerRadius: 4,
    rings: 2,
  },
  tripleRing: {
    label: "Triple Ring",
    shape: "circle",
    outerDiameter: 50,
    width: 50,
    height: 50,
    outerRingThickness: 2.2,
    innerRingThickness: 0.9,
    innerRing2Thickness: 0.6,
    ringGap: 1.3,
    centerAreaDiameter: 18,
    cornerRadius: 4,
    rings: 3,
  },
  oval: {
    label: "Oval",
    shape: "oval",
    outerDiameter: 46,
    width: 62,
    height: 36,
    outerRingThickness: 1.8,
    innerRingThickness: 0.8,
    ringGap: 2.0,
    centerAreaDiameter: 0,
    cornerRadius: 4,
    rings: 2,
  },
  rectangle: {
    label: "Rectangle",
    shape: "rectangle",
    outerDiameter: 50,
    width: 72,
    height: 34,
    outerRingThickness: 1.4,
    innerRingThickness: 0.6,
    ringGap: 2.0,
    centerAreaDiameter: 0,
    cornerRadius: 4,
    rings: 2,
  },
  square: {
    label: "Square",
    shape: "rectangle",
    outerDiameter: 44,
    width: 44,
    height: 44,
    outerRingThickness: 1.6,
    innerRingThickness: 0,
    ringGap: 0,
    centerAreaDiameter: 0,
    cornerRadius: 8,
    rings: 1,
  },
  minimalCircle: {
    label: "Minimal",
    shape: "circle",
    outerDiameter: 38,
    width: 38,
    height: 38,
    outerRingThickness: 1.1,
    innerRingThickness: 0,
    ringGap: 0,
    centerAreaDiameter: 0,
    cornerRadius: 3,
    rings: 1,
  },
  saudiCorporate: {
    label: "Saudi CO.",
    shape: "oval",
    outerDiameter: 46,
    width: 62,
    height: 38,
    outerRingThickness: 1.6,
    innerRingThickness: 0.8,
    innerRing2Thickness: 0.5,
    ringGap: 2.0,
    centerAreaDiameter: 0,
    cornerRadius: 4,
    rings: 3,
  },
};

function templateLayers(name) {
  if (name === "rectangle") {
    return [
      makeLayer({
        name: "Shape",
        text: "COMPANY NAME",
        font: "Noto Sans",
        weight: 900,
        sizeMm: 4,
        letterSpacing: 1.5,
        mode: "straight",
        offsetYmm: -7,
      }),
      makeLayer({
        name: "Shape",
        text: "City · Country",
        font: "Noto Sans",
        sizeMm: 3,
        mode: "straight",
        offsetYmm: 0,
      }),
      makeLayer({
        name: "Shape",
        text: "info@company.com",
        font: "Noto Sans",
        sizeMm: 2.8,
        mode: "straight",
        offsetYmm: 7,
      }),
    ];
  }
  if (name === "square") {
    return [
      makeLayer({
        name: "Shape",
        text: "APPROVED",
        font: "Noto Sans",
        weight: 900,
        sizeMm: 4.5,
        letterSpacing: 1,
        mode: "straight",
        offsetYmm: -3,
      }),
      makeLayer({
        name: "Shape",
        text: "موافق عليه",
        font: "Noto Sans Arabic",
        dir: "rtl",
        sizeMm: 3.5,
        mode: "straight",
        offsetYmm: 5,
      }),
    ];
  }
  if (name === "minimalCircle") {
    return [
      makeLayer({
        name: "Shape",
        text: "COMPANY NAME",
        font: "Noto Sans",
        weight: 800,
        sizeMm: 3.2,
        letterSpacing: 2,
        mode: "curved",
        flip: false,
        radiusMm: 14,
        startAngle: 210,
        endAngle: 330,
      }),
      makeLayer({
        name: "Shape",
        text: "CN",
        font: "Playfair Display",
        weight: 800,
        sizeMm: 7,
        mode: "straight",
      }),
    ];
  }
  const ls = defaultLayers();
  if (name === "oval") {
    ls[0].radiusMm = 28.0;
    ls[1].radiusMm = 27.5;
    ls[0].startAngle = 195;
    ls[0].endAngle = 345;
    ls[1].startAngle = 150;
    ls[1].endAngle = 30;
  }
  if (name === "tripleRing") {
    ls[0].radiusMm = 19.5;
    ls[1].radiusMm = 19;
  }
  if (name === "standardCircle") {
    ls[0].radiusMm = 15;
    ls[1].radiusMm = 14.8;
  }
  if (name === "saudiCorporate") {
    return [
      makeLayer({
        name: "Shape",
        text: "بصمة التاسعة المحدودة",
        font: "Noto Sans Arabic",
        weight: 800,
        dir: "rtl",
        sizeMm: 4.5,
        letterSpacing: 0.8,
        mode: "curved",
        flip: false,
        radiusMm: 27,
        startAngle: 200,
        endAngle: 340,
      }),
      makeLayer({
        name: "Shape",
        text: "ب.ت. ٩٠٥٢٣٣٠٧٧",
        font: "Noto Sans Arabic",
        weight: 800,
        dir: "rtl",
        sizeMm: 3.8,
        letterSpacing: 0.5,
        mode: "curved",
        flip: true,
        radiusMm: 26.5,
        startAngle: 200,
        endAngle: 340,
      }),
      makeLayer({
        name: "Shape",
        text: "★",
        font: "Noto Sans",
        weight: 700,
        sizeMm: 3.5,
        mode: "straight",
        offsetXmm: -17,
        offsetYmm: 0,
      }),
      makeLayer({
        name: "Shape",
        text: "★",
        font: "Noto Sans",
        weight: 700,
        sizeMm: 3.5,
        mode: "straight",
        offsetXmm: 17,
        offsetYmm: 0,
      }),
      makeLayer({
        name: "Shape",
        text: "✪",
        font: "Noto Sans",
        weight: 900,
        sizeMm: 10,
        mode: "straight",
        offsetXmm: 0,
        offsetYmm: 0,
      }),
    ];
  }
  return ls;
}

function buildConfig(name) {
  const t = TEMPLATES[name] || TEMPLATES.doubleRing;
  return Object.assign({}, baseStyle(), {
    template: name,
    shape: t.shape,
    outerDiameter: t.outerDiameter,
    width: t.width,
    height: t.height,
    outerRingThickness: t.outerRingThickness,
    innerRingThickness: t.innerRingThickness,
    innerRing2Thickness: t.innerRing2Thickness || t.innerRingThickness * 0.8,
    ringGap: t.ringGap,
    centerAreaDiameter: t.centerAreaDiameter,
    cornerRadius: t.cornerRadius,
    rings: t.rings,
    shapeOffsetXmm: 0,
    shapeOffsetYmm: 0,
    layers: templateLayers(name),
    editorZoom: 0.75,
    editorPanX: 0,
    editorPanY: 0,
  });
}

/* ── Color swatches ────────────────────────────────────────────── */
const SWATCHES = ["#1e3a8a", "#c0182a", "#15171c", "#1f7a45"];

/* ================================================================
   LIVE STATE
   ================================================================ */
let cfg = buildConfig("oval");
let selId = cfg.layers[0].id;
let selectedIds = new Set([selId]);
let selShape = false; // true when the stamp outline/shape itself is selected
let selRing = null; // 'outer', 'inner', 'inner2', or null — which ring is selected
let guideLines = []; // alignment guide lines (global so drawEditorOverlays can access)

const selLayer = () => cfg.layers.find((l) => l.id === selId) || null;
const multiSelected = () => cfg.layers.filter((l) => selectedIds.has(l.id));

function selectAllLayers() {
  selectedIds = new Set(cfg.layers.map((l) => l.id));
  if (cfg.layers.length > 0) selId = cfg.layers[0].id;
  selShape = true;
  selRing = null;
  buildLayerList();
  buildLayerProps();
  render();
}
const stampSize = () =>
  cfg.shape === "circle"
    ? { w: cfg.outerDiameter, h: cfg.outerDiameter }
    : { w: cfg.width, h: cfg.height };

const getShapeAspect = () => {
  if (cfg.shape === "circle") return 1;
  const sz = stampSize();
  return sz.w > 0 ? sz.h / sz.w : 1;
};
let exporting = false;

function proportionalScale(factor) {
  const f = Math.max(0.2, Math.min(5, factor));
  if (cfg.shape === "circle") {
    cfg.outerDiameter = Math.round(cfg.outerDiameter * f * 10) / 10;
  } else {
    cfg.width = Math.round(cfg.width * f * 10) / 10;
    cfg.height = Math.round(cfg.height * f * 10) / 10;
  }
  cfg.outerRingThickness = Math.round(cfg.outerRingThickness * f * 10) / 10;
  cfg.innerRingThickness = Math.round(cfg.innerRingThickness * f * 10) / 10;
  cfg.innerRing2Thickness = Math.round(cfg.innerRing2Thickness * f * 10) / 10;
  cfg.ringGap = Math.round(cfg.ringGap * f * 10) / 10;
  cfg.centerAreaDiameter = Math.round(cfg.centerAreaDiameter * f * 10) / 10;
  cfg.layers.forEach((l) => {
    l.sizeMm = Math.round(l.sizeMm * f * 10) / 10;
    l.radiusMm = Math.round(l.radiusMm * f * 10) / 10;
    l.offsetXmm = Math.round(l.offsetXmm * f * 10) / 10;
    l.offsetYmm = Math.round(l.offsetYmm * f * 10) / 10;
    if (l.type === "shape") l.shapeSizeMm = Math.round(l.shapeSizeMm * f * 10) / 10;
    if (l.type === "image") {
      l.imageWidthMm = Math.round(l.imageWidthMm * f * 10) / 10;
      l.imageHeightMm = Math.round(l.imageHeightMm * f * 10) / 10;
    }
  });
}

/* ── Canvas elements ───────────────────────────────────────────── */
const canvas = document.getElementById("stampCanvas");
const ctx = canvas.getContext("2d", { alpha: true });
const viewport = document.getElementById("viewport");
const stage = document.getElementById("stage");
const zoomRead = document.getElementById("zoomRead");

/* ================================================================
   DRAWING — GEOMETRY
   ================================================================ */
function ellipseStroke(cx, cy, rx, ry, thickMm, color) {
  if (thickMm <= 0 || rx <= 0 || ry <= 0) return;
  const lw = mmPx(thickMm);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.5, rx - lw / 2), Math.max(0.5, ry - lw / 2), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function roundRectPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function rectStroke(cx, cy, wPx, hPx, insetMm, thickMm, color) {
  if (thickMm <= 0) return;
  const inset = mmPx(insetMm);
  const lw = mmPx(thickMm);
  const x = cx - wPx / 2 + inset + lw / 2;
  const y = cy - hPx / 2 + inset + lw / 2;
  const rw = wPx - inset * 2 - lw;
  const rh = hPx - inset * 2 - lw;
  if (rw <= 0 || rh <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  roundRectPath(x, y, rw, rh, mmPx(cfg.cornerRadius));
  ctx.stroke();
  ctx.restore();
}

function drawGeometry(cx, cy, wPx, hPx, color) {
  const rx = wPx / 2,
    ry = hPx / 2;
  const insetPx = mmPx(cfg.outerRingThickness + cfg.ringGap);
  const rc = cfg.ringColors || {};
  const rv = cfg.ringVisible || {};
  const op = cfg.opacity;
  const cOuter = rc.outer ? hexRgba(rc.outer, op) : color;
  const cInner = rc.inner ? hexRgba(rc.inner, op) : color;
  const cInner2 = rc.inner2 ? hexRgba(rc.inner2, op) : color;
  const cCenter = rc.center ? hexRgba(rc.center, op) : color;

  if (cfg.shape === "rectangle") {
    if (rv.outer !== false) rectStroke(cx, cy, wPx, hPx, 0, cfg.outerRingThickness, cOuter);
    if (cfg.rings >= 2 && cfg.innerRingThickness > 0 && rv.inner !== false) {
      rectStroke(
        cx,
        cy,
        wPx,
        hPx,
        cfg.outerRingThickness + cfg.ringGap,
        cfg.innerRingThickness,
        cInner,
      );
    }
    if (cfg.rings >= 3 && cfg.innerRing2Thickness > 0 && rv.inner2 !== false) {
      const inset2 = cfg.outerRingThickness + cfg.ringGap + cfg.innerRingThickness + cfg.ringGap;
      rectStroke(cx, cy, wPx, hPx, inset2, cfg.innerRing2Thickness, cInner2);
    }
    return;
  }

  // Ellipse / oval / circle
  if (rv.outer !== false) ellipseStroke(cx, cy, rx, ry, cfg.outerRingThickness, cOuter);

  if (cfg.rings >= 2 && cfg.innerRingThickness > 0 && rv.inner !== false) {
    ellipseStroke(cx, cy, rx - insetPx, ry - insetPx, cfg.innerRingThickness, cInner);
  }
  if (cfg.rings >= 3 && cfg.innerRing2Thickness > 0 && rv.inner2 !== false) {
    const inset2 =
      mmPx(cfg.outerRingThickness + cfg.ringGap) + mmPx(cfg.innerRingThickness + cfg.ringGap);
    ellipseStroke(cx, cy, rx - inset2, ry - inset2, cfg.innerRing2Thickness, cInner2);
  }
  if (cfg.centerAreaDiameter > 0 && rv.center !== false) {
    const cr = mmPx(cfg.centerAreaDiameter / 2);
    const sy = cfg.shape === "oval" ? clamp(ry / rx, 0.1, 1) : 1;
    ellipseStroke(cx, cy, cr, cr * sy, Math.max(0.4, cfg.innerRingThickness ?? 0.8), cCenter);
  }
}

/* ================================================================
   DRAWING — TEXT
   ================================================================ */

/*
  buildTextStrip:
  Renders the text to an offscreen canvas strip ONCE.
  This preserves connected-script ligatures (Arabic, etc.)
  for both curved and straight text, and fixes the blurry
  rendering bug that came from re-rendering per-column.
*/
/*
  textEllipseMm:
  Single source of truth for the ellipse a curved layer rides on.
  Returns { rx, ry } in MM. For circles rx === ry === radiusMm.
  For ovals we preserve the ring's eccentricity by scaling ry with
  the stamp's aspect ratio, so the text traces the same curve as
  the ring instead of drifting onto an unrelated ellipse.
*/
function textEllipseMm(layer) {
  const sz = stampSize(); // {w, h} in mm
  const sRx = sz.w / 2;
  const sRy = sz.h / 2;
  const r = layer.radiusMm;
  if (cfg.shape === "oval" && sRx > 0) {
    return { rx: r, ry: Math.max(0.5, r * (sRy / sRx)) };
  }
  return { rx: r, ry: r };
}

function buildTextStrip(layer, color) {
  const fontPx = mmPx(layer.sizeMm);
  const fontStr = `${safeWeight(layer.font, layer.weight)} ${fontPx}px "${layer.font}"`;
  const dir = layerDir(layer);
  const sx = layer.scaleX || 1;
  const sy = layer.scaleY || 1;

  const m = document.createElement("canvas").getContext("2d");
  m.font = fontStr;
  if ("letterSpacing" in m) m.letterSpacing = `${layer.letterSpacing}px`;
  if ("wordSpacing" in m) m.wordSpacing = `${layer.wordSpacing}px`;
  const measured = m.measureText(layer.text);

  const textW = Math.max(2, Math.ceil(measured.width * sx));
  const pad = fontPx * 0.3;
  const sw = textW + pad * 2;
  const sh = Math.max(2, Math.ceil(fontPx * 2.2 * sy));

  const strip = document.createElement("canvas");
  strip.width = sw;
  strip.height = sh;
  const sc = strip.getContext("2d");
  sc.font = fontStr;
  if ("letterSpacing" in sc) sc.letterSpacing = `${layer.letterSpacing}px`;
  if ("wordSpacing" in sc) sc.wordSpacing = `${layer.wordSpacing}px`;
  sc.fillStyle = color;
  sc.textAlign = "center";
  sc.textBaseline = "middle";
  sc.direction = dir;
  sc.translate(sw / 2, sh / 2);
  sc.scale(sx, sy);
  sc.fillText(layer.text, 0, 0);
  return { canvas: strip, textWidth: textW, pad };
}

/* Ink-bleed wrapper — renders soft bleed passes then sharp pass */
function bleedWrap(drawFn, rng) {
  if (!cfg.inkBleed || cfg.inkBleedAmount <= 0) {
    drawFn();
    return;
  }
  const blurPx = mmPx(cfg.inkBleedAmount) * 0.2;
  ctx.save();
  ctx.globalAlpha *= 0.16;
  ctx.filter = `blur(${blurPx}px)`;
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate((rng() - 0.5) * mmPx(0.09), (rng() - 0.5) * mmPx(0.09));
    drawFn();
    ctx.restore();
  }
  ctx.restore();
  drawFn(); // crisp final pass
}

function drawCurvedLayer(layer, cx, cy, color, rng) {
  if (!layer.text.trim()) return;
  const info = buildTextStrip(layer, color);
  const strip = info.canvas;
  const sw = strip.width,
    sh = strip.height;
  const textW = info.textWidth;
  const padPx = info.pad;
  const slice = Math.max(1, Math.round(sh / 32));

  const sz = stampSize();
  const rx = sz.w / 2;
  const ry = sz.h / 2;

  let textRx, textRy;
  {
    const e = textEllipseMm(layer);
    textRx = mmPx(e.rx);
    textRy = mmPx(e.ry);
  }

  const draw = () => {
    for (let x = 0; x < sw; x += slice) {
      const f = (x + slice / 2 - padPx) / textW;
      if (f < -0.02 || f > 1.02) continue;
      const cf = Math.max(0, Math.min(1, f));
      const ang = (layer.startAngle + (layer.endAngle - layer.startAngle) * cf) * DEG;
      const tx = cx + Math.cos(ang) * textRx;
      const ty = cy + Math.sin(ang) * textRy;

      const tangent = Math.atan2(textRy * Math.cos(ang), -textRx * Math.sin(ang));
      const jit =
        cfg.rotationJitter && cfg.jitterDegrees > 0 ? (rng() * 2 - 1) * cfg.jitterDegrees * DEG : 0;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(tangent + (layer.flip ? Math.PI : 0) + jit);
      ctx.drawImage(strip, x, 0, slice, sh, -slice / 2, -sh / 2, slice, sh);
      ctx.restore();
    }
  };
  bleedWrap(draw, rng);
}

function drawStraightLayer(layer, cx, cy, color, rng) {
  if (!layer.text.trim()) return;
  const fontPx = mmPx(layer.sizeMm);
  const tx = cx + mmPx(layer.offsetXmm);
  const ty = cy + mmPx(layer.offsetYmm);

  const draw = () => {
    ctx.save();
    ctx.font = `${safeWeight(layer.font, layer.weight)} ${fontPx}px "${layer.font}"`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${layer.letterSpacing}px`;
    if ("wordSpacing" in ctx) ctx.wordSpacing = `${layer.wordSpacing}px`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = layerDir(layer);
    const sx = layer.scaleX || 1;
    const sy = layer.scaleY || 1;
    if (cfg.rotationJitter && cfg.jitterDegrees > 0) {
      ctx.translate(tx, ty);
      ctx.rotate((rng() * 2 - 1) * cfg.jitterDegrees * DEG * 0.5);
      ctx.scale(sx, sy);
      ctx.fillText(layer.text, 0, 0);
    } else {
      ctx.translate(tx, ty);
      ctx.scale(sx, sy);
      ctx.fillText(layer.text, 0, 0);
    }
    ctx.restore();
  };
  bleedWrap(draw, rng);
}

/* ── Draw shape layer (star, pentagon, hexagon, diamond, cross) ── */
function drawShapeLayer(layer, cx, cy, color, rng) {
  const tx = cx + mmPx(layer.offsetXmm);
  const ty = cy + mmPx(layer.offsetYmm);
  const size = mmPx(layer.shapeSizeMm);
  const rot = (layer.shapeRotation || 0) * DEG;
  const fill = layer.shapeFill;
  const pts = layer.shapePoints || 5;

  const draw = () => {
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(rot);
    ctx.beginPath();

    if (layer.shapeType === "star") {
      const inner = size * 0.4;
      for (let i = 0; i < pts * 2; i++) {
        const r = i % 2 === 0 ? size : inner;
        const a = (i * Math.PI) / pts - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
    } else if (layer.shapeType === "pentagon" || layer.shapeType === "hexagon") {
      const n = layer.shapeType === "pentagon" ? 5 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i * 2 * Math.PI) / n - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size);
        else ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
      }
      ctx.closePath();
    } else if (layer.shapeType === "diamond") {
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.6, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size * 0.6, 0);
      ctx.closePath();
    } else if (layer.shapeType === "cross") {
      const t = size * 0.3;
      ctx.moveTo(-t, -size);
      ctx.lineTo(t, -size);
      ctx.lineTo(t, -t);
      ctx.lineTo(size, -t);
      ctx.lineTo(size, t);
      ctx.lineTo(t, t);
      ctx.lineTo(t, size);
      ctx.lineTo(-t, size);
      ctx.lineTo(-t, t);
      ctx.lineTo(-size, t);
      ctx.lineTo(-size, -t);
      ctx.lineTo(-t, -t);
      ctx.closePath();
    } else if (layer.shapeType === "circle") {
      ctx.arc(0, 0, size, 0, Math.PI * 2);
    }

    if (fill) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, mmPx(0.5));
      ctx.stroke();
    }
    ctx.restore();
  };
  bleedWrap(draw, rng);
}

/* ── Draw image layer (imported logo) ─────────────────────────── */
const imageCache = {};
function drawImageLayer(layer, cx, cy) {
  if (!layer.imageData) return;
  const tx = cx + mmPx(layer.offsetXmm);
  const ty = cy + mmPx(layer.offsetYmm);
  const w = mmPx(layer.imageWidthMm);
  const h = mmPx(layer.imageHeightMm);

  const drawImg = (img) => {
    ctx.save();
    ctx.globalAlpha = (cfg.opacity || 100) / 100;
    ctx.drawImage(img, tx - w / 2, ty - h / 2, w, h);
    ctx.restore();
  };

  if (imageCache[layer.imageData]) {
    drawImg(imageCache[layer.imageData]);
  } else {
    const img = new Image();
    img.onload = () => {
      imageCache[layer.imageData] = img;
      render();
    };
    img.src = layer.imageData;
  }
}

/* ── Grunge texture ────────────────────────────────────────────── */
function applyGrunge(rng, amount) {
  if (!cfg.grungeTexture || amount <= 0) return;
  const iData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = iData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue; // skip transparent pixels — FIX: was skipping too much
    const noise = (rng() - 0.5) * amount * 200;
    d[i + 3] = clamp(d[i + 3] + noise, 0, 255);
  }
  ctx.putImageData(iData, 0, 0);
}

function drawEditorOverlays() {
  if (exporting) return;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const offPxX = mmPx(cfg.shapeOffsetXmm || 0);
  const offPxY = mmPx(cfg.shapeOffsetYmm || 0);
  const scx = cx + offPxX,
    scy = cy + offPxY;
  const aspect = getShapeAspect();
  const sz = stampSize();
  const ppmm = DPI_CURRENT / 25.4;
  const showGuidesEl = document.getElementById("showGuides");
  const showGuidesOn = showGuidesEl ? showGuidesEl.checked : true;

  ctx.save();

  // ── Persistent center & edge guides ──────────────────────────
  if (showGuidesOn) {
    const hw = mmPx(sz.w) / 2,
      hh = mmPx(sz.h) / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(34,211,238,0.35)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 6]);
    // Center crosshair
    ctx.beginPath();
    ctx.moveTo(scx, 0);
    ctx.lineTo(scx, canvas.height);
    ctx.moveTo(0, scy);
    ctx.lineTo(canvas.width, scy);
    ctx.stroke();
    // Edge box
    ctx.strokeStyle = "rgba(34,211,238,0.28)";
    ctx.strokeRect(scx - hw, scy - hh, hw * 2, hh * 2);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Alignment guide lines (from alignment tools) ─────────────
  if (guideLines && guideLines.length > 0) {
    guideLines.forEach((g) => {
      ctx.save();
      ctx.strokeStyle = "rgba(34,211,238,0.7)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      if (g.type === "v") {
        const x = cx + g.mm * ppmm;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      } else {
        const y = cy + g.mm * ppmm;
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
  }

  // ── Stamp bounding box guide ─────────────────────────────────
  if (selShape || (selLayer() && selLayer().visible)) {
    const hw = mmPx(sz.w) / 2,
      hh = mmPx(sz.h) / 2;
    ctx.strokeStyle = "rgba(37, 99, 235, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(cx - hw - 2, cy - hh - 2, hw * 2 + 4, hh * 2 + 4);
    ctx.setLineDash([]);
  }

  // ── Shape selection handles ──────────────────────────────────
  if (selShape) {
    const hw = mmPx(sz.w) / 2,
      hh = mmPx(sz.h) / 2;

    // Determine effective bounds based on selected ring
    let ringInsetPx = 0;
    let ringColor = "#2563eb";
    let ringLabel = "";
    if (selRing === "inner" && cfg.rings >= 2) {
      ringInsetPx = mmPx(cfg.outerRingThickness + cfg.ringGap);
      ringColor = "#d97706";
      ringLabel = "Ring 2";
    } else if (selRing === "inner2" && cfg.rings >= 3) {
      ringInsetPx = mmPx(
        cfg.outerRingThickness + cfg.ringGap + cfg.innerRingThickness + cfg.ringGap,
      );
      ringColor = "#059669";
      ringLabel = "Ring 3";
    } else if (selRing === "outer") {
      ringLabel = "Ring 1";
    }
    const selHw = hw - ringInsetPx,
      selHh = hh - ringInsetPx;

    // Highlight selected ring
    if (selRing) {
      ctx.save();
      ctx.strokeStyle = ringColor;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);

      if (cfg.shape === "circle" || cfg.shape === "oval") {
        ctx.beginPath();
        ctx.ellipse(scx, scy, Math.max(2, selHw), Math.max(2, selHh), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (cfg.shape === "rectangle") {
        ctx.strokeRect(scx - selHw, scy - selHh, selHw * 2, selHh * 2);
      }

      // Ring label
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.6;
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = ringColor;
      ctx.fillText(ringLabel, scx + selHw + 8, scy - selHh);
      ctx.restore();
    }

    // Corner handles at the selected ring bounds (or outer if no ring selected)
    const corners = [
      { x: scx - selHw, y: scy - selHh, cursor: "nwse-resize" },
      { x: scx + selHw, y: scy - selHh, cursor: "nesw-resize" },
      { x: scx + selHw, y: scy + selHh, cursor: "nwse-resize" },
      { x: scx - selHw, y: scy + selHh, cursor: "nesw-resize" },
    ];
    corners.forEach((p) => {
      ctx.beginPath();
      ctx.rect(p.x - 5, p.y - 5, 10, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });
    // Dashed selection box at the selected ring bounds
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = ringColor === "#2563eb" ? "rgba(37,99,235,0.75)" : ringColor + "cc";
    ctx.lineWidth = 2;
    ctx.strokeRect(scx - selHw - 1, scy - selHh - 1, selHw * 2 + 2, selHh * 2 + 2);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  // ── Multi-select outlines for all selected layers ────────────
  cfg.layers.forEach((ml) => {
    if (!selectedIds.has(ml.id) || !ml.visible) return;
    const isPrimary = ml.id === selId;
    const mRadius = mmPx(ml.radiusMm);

    if (ml.mode === "curved") {
      ctx.save();
      const _e = textEllipseMm(ml);
      const mlRx = _e.rx;
      const mlRy = _e.ry;

      ctx.strokeStyle = isPrimary ? "rgba(37,99,235,0.85)" : "rgba(37,99,235,0.5)";
      ctx.lineWidth = isPrimary ? 2.5 : 1.5;
      ctx.setLineDash(isPrimary ? [5, 5] : [3, 4]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, mmPx(mlRx), mmPx(mlRy), 0, ml.startAngle * DEG, ml.endAngle * DEG);
      ctx.stroke();
      ctx.restore();
    } else {
      const tx = cx + mmPx(ml.offsetXmm);
      const ty = cy + mmPx(ml.offsetYmm);
      ctx.save();
      ctx.font = `${safeWeight(ml.font, ml.weight)} ${mmPx(ml.sizeMm)}px "${ml.font}"`;
      const tw = ctx.measureText(ml.text).width;
      const th = mmPx(ml.sizeMm);
      ctx.strokeStyle = isPrimary ? "rgba(99,102,241,0.7)" : "rgba(99,102,241,0.35)";
      ctx.lineWidth = isPrimary ? 1.8 : 1;
      ctx.setLineDash(isPrimary ? [3, 3] : [2, 3]);
      ctx.beginPath();
      ctx.rect(tx - tw / 2 - 8, ty - th / 2 - 6, tw + 16, th + 12);
      ctx.stroke();
      ctx.restore();
    }
  });

  // ── Primary layer handles ──────────────────────────────────
  const l = selLayer();
  if (!l || !l.visible) {
    ctx.restore();
    return;
  }
  const radius = mmPx(l.radiusMm);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(37, 99, 235, 0.85)";

  if (l.mode === "curved") {
    const theta1 = l.startAngle * DEG;
    const theta2 = l.endAngle * DEG;
    const thetaM = (l.startAngle + (l.endAngle - l.startAngle) / 2) * DEG;
    const _le = textEllipseMm(l);
    const lRx = _le.rx;
    const lRy = _le.ry;
    const lRxPx = mmPx(lRx),
      lRyPx = mmPx(lRy);

    const handles = [
      { x: cx + Math.cos(theta1) * lRxPx, y: cy + Math.sin(theta1) * lRyPx, role: "start" },
      { x: cx + Math.cos(theta2) * lRxPx, y: cy + Math.sin(theta2) * lRyPx, role: "end" },
      { x: cx + Math.cos(thetaM) * lRxPx, y: cy + Math.sin(thetaM) * lRyPx, role: "radius" },
    ];

    handles.forEach((h) => {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  } else {
    const tx = cx + mmPx(l.offsetXmm);
    const ty = cy + mmPx(l.offsetYmm);

    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(tx, ty, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.restore();

  // Size label — below stamp (hidden when ring selected)
  if (!selRing) {
    const hh2 = mmPx(sz.h) / 2;
    ctx.save();
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = "rgba(37,99,235,0.9)";
    ctx.textAlign = "center";
    ctx.fillText(`${sz.w.toFixed(1)} × ${sz.h.toFixed(1)} mm`, scx, scy + hh2 + 16);
    ctx.restore();
  }
}

/* ================================================================
   MAIN RENDER
   ================================================================ */
function render() {
  const sz = stampSize();
  const pad = cfg.paddingMm;
  const wPx = Math.round(mmPx(sz.w + pad * 2));
  const hPx = Math.round(mmPx(sz.h + pad * 2));

  if (canvas.width !== wPx || canvas.height !== hPx) {
    canvas.width = wPx;
    canvas.height = hPx;
  }
  ctx.clearRect(0, 0, wPx, hPx);

  const cx = wPx / 2,
    cy = hPx / 2;
  const offPxX = mmPx(cfg.shapeOffsetXmm || 0);
  const offPxY = mmPx(cfg.shapeOffsetYmm || 0);
  const scx = cx + offPxX,
    scy = cy + offPxY;
  const stampW = mmPx(sz.w),
    stampH = mmPx(sz.h);
  const color = hexRgba(cfg.inkColor, cfg.opacity);

  // New RNG per render — seeded so grunge is stable (no flicker)
  const rng = mkRng(cfg.seed);

  drawGeometry(scx, scy, stampW, stampH, color);

  cfg.layers.forEach((layer) => {
    if (!layer.visible) return;
    const lcolor = layer.color ? hexRgba(layer.color, cfg.opacity) : color;
    if (layer.type === "shape") drawShapeLayer(layer, scx, scy, lcolor, rng);
    else if (layer.type === "image") drawImageLayer(layer, scx, scy);
    else if (layer.mode === "curved") drawCurvedLayer(layer, scx, scy, lcolor, rng);
    else drawStraightLayer(layer, scx, scy, lcolor, rng);
  });

  applyGrunge(rng, cfg.grungeAmount);
  drawEditorOverlays();
}

const renderD = debounce(render, 40);

/* ================================================================
   ZOOM / PAN
   ================================================================ */
function updateTransform() {
  const px = cfg.editorPanX || 0;
  const py = cfg.editorPanY || 0;
  stage.style.transform = `translate(${px}px, ${py}px) scale(${cfg.editorZoom})`;
  zoomRead.textContent = Math.round(cfg.editorZoom * 100) + "%";
}

function setZoom(v, _resetPan = false) {
  cfg.editorZoom = clamp(v, 0.06, 14);
  if (_resetPan) {
    cfg.editorPanX = 0;
    cfg.editorPanY = 0;
  }
  updateTransform();
}

function resetView() {
  cfg.editorPanX = 0;
  cfg.editorPanY = 0;
  setZoom(1, true);
}

function fitView() {
  cfg.editorPanX = 0;
  cfg.editorPanY = 0;
  const vp = viewport.getBoundingClientRect();
  const sz = stampSize();
  const cw = (sz.w + cfg.paddingMm * 2) * CSS_MM;
  const ch = (sz.h + cfg.paddingMm * 2) * CSS_MM;
  if (vp.width < 20 || vp.height < 20) return;
  setZoom(Math.min((vp.width - 80) / cw, (vp.height - 80) / ch), true);
}

function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

function canvasToMm(x, y) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const ppmm = DPI_CURRENT / 25.4;
  const dxMm = (x - cx) / ppmm;
  const dyMm = (y - cy) / ppmm;
  return { dxMm, dyMm };
}

let spaceHeld = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.target.matches("input,textarea,select")) {
    if (!spaceHeld) {
      spaceHeld = true;
      document.body.classList.add("space-pan");
    }
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceHeld = false;
    document.body.classList.remove("space-pan");
  }
});

function bindPanZoom() {
  let panning = false,
    lx = 0,
    ly = 0;
  let activeDrag = null;
  let pinchDist = 0;

  /* ── Pinch-to-zoom for touch ────────────────────────────────── */
  viewport.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    },
    { passive: false },
  );

  viewport.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (pinchDist > 0) {
          setZoom(cfg.editorZoom * (dist / pinchDist));
        }
        pinchDist = dist;
      }
    },
    { passive: false },
  );

  viewport.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) pinchDist = 0;
  });

  viewport.addEventListener("pointerdown", (e) => {
    if (
      e.target.closest(".tool-rail-panel") ||
      e.target.closest(".right-panel") ||
      e.target.closest(".topbar") ||
      e.target.closest(".zoombar") ||
      e.target.closest(".left-sidebar")
    )
      return;

    // Pan: middle mouse, space-held, or alt-drag
    if (e.button === 1 || spaceHeld || e.altKey) {
      e.preventDefault();
      panning = true;
      lx = e.clientX;
      ly = e.clientY;
      viewport.classList.add("panning");
      viewport.setPointerCapture(e.pointerId);
      return;
    }

    const canvasCoords = getCanvasCoords(e.clientX, e.clientY);
    const mmCoords = canvasToMm(canvasCoords.x, canvasCoords.y);

    const l = selShape ? null : selLayer();
    const aspect = getShapeAspect();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const sz = stampSize();

    // 1. Shape handles (when shape is selected or no layer)
    if (selShape) {
      const hw = mmPx(sz.w) / 2,
        hh = mmPx(sz.h) / 2;
      const offX = mmPx(cfg.shapeOffsetXmm || 0);
      const offY = mmPx(cfg.shapeOffsetYmm || 0);
      const scx = canvas.width / 2 + offX,
        scy = canvas.height / 2 + offY;
      const corners = [
        { x: scx - hw, y: scy - hh, role: "size" },
        { x: scx + hw, y: scy - hh, role: "size" },
        { x: scx + hw, y: scy + hh, role: "size" },
        { x: scx - hw, y: scy + hh, role: "size" },
      ];
      for (const c of corners) {
        if (Math.hypot(canvasCoords.x - c.x, canvasCoords.y - c.y) < 14) {
          const origLayerSizes = cfg.layers.map((l) => l.sizeMm);
          const origLayerRadii = cfg.layers.map((l) => l.radiusMm);
          const origLayerOffX = cfg.layers.map((l) => l.offsetXmm);
          const origLayerOffY = cfg.layers.map((l) => l.offsetYmm);
          const origLayerShapes = cfg.layers.map((l) => l.shapeSizeMm ?? 10);
          const origLayerImgW = cfg.layers.map((l) => l.imageWidthMm ?? 10);
          const origLayerImgH = cfg.layers.map((l) => l.imageHeightMm ?? 10);
          activeDrag = {
            type: "shape",
            ring: "proportional",
            startDxMm: mmCoords.dxMm,
            startDyMm: mmCoords.dyMm,
            origSize: {
              w: sz.w,
              h: sz.h,
              ot: cfg.outerRingThickness,
              it: cfg.innerRingThickness,
              i2t: cfg.innerRing2Thickness,
              gap: cfg.ringGap,
              cd: cfg.centerAreaDiameter,
              layerSizes: origLayerSizes,
              layerRadii: origLayerRadii,
              layerOffX: origLayerOffX,
              layerOffY: origLayerOffY,
              layerShapes: origLayerShapes,
              layerImgW: origLayerImgW,
              layerImgH: origLayerImgH,
            },
          };
          break;
        }
      }
    }

    // 2. Check if we clicked on any handles of the active layer first
    if (!activeDrag && l && l.visible) {
      const radius = mmPx(l.radiusMm);
      if (l.mode === "curved") {
        const theta1 = l.startAngle * DEG;
        const theta2 = l.endAngle * DEG;
        const thetaM = (l.startAngle + (l.endAngle - l.startAngle) / 2) * DEG;
        const _he = textEllipseMm(l);
        const hRx = _he.rx;
        const hRy = _he.ry;

        const hRxPx = mmPx(hRx),
          hRyPx = mmPx(hRy);

        const hStart = { x: cx + Math.cos(theta1) * hRxPx, y: cy + Math.sin(theta1) * hRyPx };
        const hEnd = { x: cx + Math.cos(theta2) * hRxPx, y: cy + Math.sin(theta2) * hRyPx };
        const hRad = { x: cx + Math.cos(thetaM) * hRxPx, y: cy + Math.sin(thetaM) * hRyPx };

        const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

        if (dist(canvasCoords, hStart) < 14) {
          activeDrag = { type: "handle", role: "start", layerId: l.id };
        } else if (dist(canvasCoords, hEnd) < 14) {
          activeDrag = { type: "handle", role: "end", layerId: l.id };
        } else if (dist(canvasCoords, hRad) < 14) {
          activeDrag = { type: "handle", role: "radius", layerId: l.id };
        }
      } else {
        const tx = cx + mmPx(l.offsetXmm);
        const ty = cy + mmPx(l.offsetYmm);
        if (Math.hypot(canvasCoords.x - tx, canvasCoords.y - ty) < 14) {
          activeDrag = { type: "handle", role: "translate", layerId: l.id };
        }
      }
    }

    // 2. Check if clicking on the stamp shape outline
    if (!activeDrag) {
      const sz = stampSize();
      const hW = mmPx(sz.w) / 2,
        hH = mmPx(sz.h) / 2;
      const offXmm = cfg.shapeOffsetXmm || 0;
      const offYmm = cfg.shapeOffsetYmm || 0;
      const relDx = mmCoords.dxMm - offXmm;
      const relDy = mmCoords.dyMm - offYmm;
      let hitRing = null;

      if (cfg.shape === "circle") {
        const r = Math.hypot(relDx, relDy);
        const outerR = sz.w / 2;
        const outerInner = Math.max(0, outerR - cfg.outerRingThickness);
        if (r >= outerInner - 1 && r <= outerR + 2) {
          hitRing = "outer";
        }
        if (cfg.rings >= 2 && cfg.innerRingThickness > 0) {
          const gapStart = outerInner - cfg.ringGap;
          const innerOuter = gapStart;
          const innerInner = Math.max(0, gapStart - cfg.innerRingThickness);
          if (r >= innerInner - 1 && r <= innerOuter + 1) hitRing = "inner";
        }
        if (cfg.rings >= 3 && cfg.innerRing2Thickness > 0) {
          const inset2 =
            cfg.outerRingThickness + cfg.ringGap + cfg.innerRingThickness + cfg.ringGap;
          const i3Outer = outerR - inset2 + cfg.innerRing2Thickness;
          const i3Inner = Math.max(0, outerR - inset2);
          if (r >= i3Inner - 1 && r <= i3Outer + 1) hitRing = "inner2";
        }
      } else if (cfg.shape === "oval") {
        const r = Math.hypot(relDx, relDy / (sz.h / sz.w));
        const outerR = sz.w / 2;
        const outerInner = Math.max(0, outerR - cfg.outerRingThickness);
        if (r >= outerInner - 1 && r <= outerR + 2) {
          hitRing = "outer";
        }
        if (cfg.rings >= 2 && cfg.innerRingThickness > 0) {
          const gapStart = outerInner - cfg.ringGap;
          const innerOuter = gapStart;
          const innerInner = Math.max(0, gapStart - cfg.innerRingThickness);
          if (r >= innerInner - 1 && r <= innerOuter + 1) hitRing = "inner";
        }
        if (cfg.rings >= 3 && cfg.innerRing2Thickness > 0) {
          const inset2 =
            cfg.outerRingThickness + cfg.ringGap + cfg.innerRingThickness + cfg.ringGap;
          const i3Outer = Math.max(0, outerR - inset2);
          const i3Inner = Math.max(0, outerR - inset2 - cfg.innerRing2Thickness);
          if (r >= i3Inner - 1 && r <= i3Outer + 1) hitRing = "inner2";
        }
      } else if (cfg.shape === "rectangle") {
        const hw = sz.w / 2,
          hh = sz.h / 2;
        const absDx = Math.abs(relDx),
          absDy = Math.abs(relDy);
        const innerW = Math.max(
          0,
          hw - cfg.outerRingThickness - cfg.ringGap * (cfg.rings > 1 ? 1 : 0),
        );
        const innerH = Math.max(
          0,
          hh - cfg.outerRingThickness - cfg.ringGap * (cfg.rings > 1 ? 1 : 0),
        );
        const onBorder =
          (absDx >= innerW && absDx <= hw + 1 && absDy <= hh + 1) ||
          (absDy >= innerH && absDy <= hh + 1 && absDx <= hw + 1);
        if (onBorder && absDx >= 0 && absDy >= 0) {
          hitRing = "outer";
          if (cfg.rings >= 2 && cfg.innerRingThickness > 0) {
            const innerW2 = Math.max(
              0,
              hw - cfg.outerRingThickness - cfg.ringGap - cfg.innerRingThickness,
            );
            const innerH2 = Math.max(
              0,
              hh - cfg.outerRingThickness - cfg.ringGap - cfg.innerRingThickness,
            );
            const midW = (innerW + innerW2) / 2;
            const midH = (innerH + innerH2) / 2;
            if (
              (absDx >= midW - 1 && absDx <= innerW + 1 && absDy <= hh + 1) ||
              (absDy >= midH - 1 && absDy <= innerH + 1 && absDx <= hw + 1)
            ) {
              hitRing = "inner";
            }
          }
          if (cfg.rings >= 3 && cfg.innerRing2Thickness > 0) {
            const innerW3 = Math.max(
              0,
              hw -
                cfg.outerRingThickness -
                cfg.ringGap -
                cfg.innerRingThickness -
                cfg.ringGap -
                cfg.innerRing2Thickness,
            );
            const innerH3 = Math.max(
              0,
              hh -
                cfg.outerRingThickness -
                cfg.ringGap -
                cfg.innerRingThickness -
                cfg.ringGap -
                cfg.innerRing2Thickness,
            );
            const innerW2 = Math.max(
              0,
              hw - cfg.outerRingThickness - cfg.ringGap - cfg.innerRingThickness,
            );
            const innerH2 = Math.max(
              0,
              hh - cfg.outerRingThickness - cfg.ringGap - cfg.innerRingThickness,
            );
            const midW = (innerW2 + innerW3) / 2;
            const midH = (innerH2 + innerH3) / 2;
            if (
              (absDx >= midW - 1 && absDx <= innerW2 + 1 && absDy <= hh + 1) ||
              (absDy >= midH - 1 && absDy <= innerH2 + 1 && absDx <= hw + 1)
            ) {
              hitRing = "inner2";
            }
          }
        }
      }

      if (hitRing) {
        selShape = true;
        selRing = hitRing;
        selId = null;
        selectedIds = new Set();
        _showEffects = false;
        buildLayerList();
        renderLeftSidebar();
        render();
        activeDrag = { type: "shape", ring: hitRing };
      }
    }

    // 3. If no handle is clicked, hit-test layers to select and drag
    if (!activeDrag) {
      let hitLayer = false;
      for (let i = cfg.layers.length - 1; i >= 0; i--) {
        const layer = cfg.layers[i];
        if (!layer.visible) continue;

        if (layer.type === "shape" || layer.type === "image") {
          const tx = cx + mmPx(layer.offsetXmm);
          const ty = cy + mmPx(layer.offsetYmm);
          const hitR =
            layer.type === "shape"
              ? mmPx(layer.shapeSizeMm) + 10
              : Math.max(mmPx(layer.imageWidthMm), mmPx(layer.imageHeightMm)) / 2 + 10;
          if (Math.hypot(canvasCoords.x - tx, canvasCoords.y - ty) < hitR) {
            hitLayer = true;
            if (e.ctrlKey || e.metaKey) {
              if (selectedIds.has(layer.id)) {
                selectedIds.delete(layer.id);
                if (selId === layer.id)
                  selId = cfg.layers.find((l) => selectedIds.has(l.id))?.id || null;
              } else {
                selectedIds.add(layer.id);
                selId = layer.id;
              }
            } else {
              selId = layer.id;
              selectedIds = new Set([selId]);
            }
            selShape = false;
            selRing = null;
            _showEffects = false;
            buildLayerList();
            buildLayerProps();
            activeDrag = { type: "handle", role: "translate", layerId: layer.id };
            render();
            break;
          }
        } else if (layer.mode === "straight") {
          const tx = cx + mmPx(layer.offsetXmm);
          const ty = cy + mmPx(layer.offsetYmm);

          ctx.font = `${safeWeight(layer.font, layer.weight)} ${mmPx(layer.sizeMm)}px "${layer.font}"`;
          const textWidth = ctx.measureText(layer.text).width;
          const textHeight = mmPx(layer.sizeMm);

          if (
            Math.abs(canvasCoords.x - tx) < textWidth / 2 + 10 &&
            Math.abs(canvasCoords.y - ty) < textHeight / 2 + 10
          ) {
            hitLayer = true;
            if (e.ctrlKey || e.metaKey) {
              if (selectedIds.has(layer.id)) {
                selectedIds.delete(layer.id);
                if (selId === layer.id)
                  selId = cfg.layers.find((l) => selectedIds.has(l.id))?.id || null;
              } else {
                selectedIds.add(layer.id);
                selId = layer.id;
              }
            } else {
              selId = layer.id;
              selectedIds = new Set([selId]);
            }
            selShape = false;
            selRing = null;
            _showEffects = false;
            buildLayerList();
            buildLayerProps();
            activeDrag = { type: "handle", role: "translate", layerId: layer.id };
            render();
            break;
          }
        } else {
          const sz4 = stampSize();
          const hitRx = sz4.w / 2,
            hitRy = sz4.h / 2;
          const rMouse = Math.hypot(mmCoords.dxMm / hitRx, mmCoords.dyMm / hitRy) * hitRx;
          const diffR = Math.abs(rMouse - layer.radiusMm);
          if (diffR < 4) {
            let angle = Math.atan2(mmCoords.dyMm / hitRy, mmCoords.dxMm / hitRx) / DEG;
            if (angle < 0) angle += 360;

            let sAng = layer.startAngle % 360;
            if (sAng < 0) sAng += 360;
            let eAng = layer.endAngle % 360;
            if (eAng < 0) eAng += 360;

            let isInside = false;
            if (sAng <= eAng) {
              isInside = angle >= sAng && angle <= eAng;
            } else {
              isInside = angle >= sAng || angle <= eAng;
            }

            if (isInside) {
              hitLayer = true;
              if (e.ctrlKey || e.metaKey) {
                if (selectedIds.has(layer.id)) {
                  selectedIds.delete(layer.id);
                  if (selId === layer.id)
                    selId = cfg.layers.find((l) => selectedIds.has(l.id))?.id || null;
                } else {
                  selectedIds.add(layer.id);
                  selId = layer.id;
                }
              } else {
                selId = layer.id;
                selectedIds = new Set([selId]);
              }
              selShape = false;
              selRing = null;
              _showEffects = false;
              buildLayerList();
              buildLayerProps();
              activeDrag = {
                type: "layer_translate_curved",
                layerId: layer.id,
                startRadius: layer.radiusMm,
                startAngle: angle,
                startLayerStart: layer.startAngle,
                startLayerEnd: layer.endAngle,
              };
              render();
              break;
            }
          }
        }
      }
      // Clicking empty space — deselect all
      if (!hitLayer) {
        selShape = false;
        selRing = null;
        selId = null;
        selectedIds = new Set();
        _showEffects = false;
        buildLayerList();
        buildLayerProps();
        renderLeftSidebar();
        render();
      }
    }

    if (activeDrag) {
      viewport.classList.add("manipulating");
      viewport.setPointerCapture(e.pointerId);
    }
    // Canvas panning is disabled — the stage stays centered.
  });

  viewport.addEventListener("pointermove", (e) => {
    if (panning) {
      cfg.editorPanX = (cfg.editorPanX || 0) + (e.clientX - lx);
      cfg.editorPanY = (cfg.editorPanY || 0) + (e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
      updateTransform();
      return;
    }
    if (activeDrag) {
      const canvasCoords = getCanvasCoords(e.clientX, e.clientY);
      const mmCoords = canvasToMm(canvasCoords.x, canvasCoords.y);
      const aspect = getShapeAspect();

      // Shape resize / ring thickness adjust
      if (activeDrag.type === "shape") {
        if (activeDrag.ring === "proportional") {
          const origSz = activeDrag.origSize;
          const origDx = activeDrag.startDxMm;
          const origDy = activeDrag.startDyMm;
          const dx = mmCoords.dxMm - origDx;
          const dy = mmCoords.dyMm - origDy;
          const oldR = Math.hypot(origDx, origDy);
          const newR = Math.hypot(mmCoords.dxMm, mmCoords.dyMm);
          if (oldR > 1) {
            const factor = newR / oldR;
            if (cfg.shape === "circle") {
              cfg.outerDiameter = Math.max(
                15,
                Math.min(120, Math.round(origSz.w * factor * 10) / 10),
              );
            } else {
              cfg.width = Math.max(15, Math.min(120, Math.round(origSz.w * factor * 10) / 10));
              cfg.height = Math.max(10, Math.min(90, Math.round(origSz.h * factor * 10) / 10));
            }
            cfg.outerRingThickness = Math.round(origSz.ot * factor * 10) / 10;
            cfg.innerRingThickness = Math.round(origSz.it * factor * 10) / 10;
            cfg.innerRing2Thickness = Math.round(origSz.i2t * factor * 10) / 10;
            cfg.ringGap = Math.round(origSz.gap * factor * 10) / 10;
            cfg.centerAreaDiameter = Math.round(origSz.cd * factor * 10) / 10;
            cfg.layers.forEach((l, i) => {
              l.sizeMm = Math.round(origSz.layerSizes[i] * factor * 10) / 10;
              l.radiusMm = Math.round(origSz.layerRadii[i] * factor * 10) / 10;
              l.offsetXmm = Math.round(origSz.layerOffX[i] * factor * 10) / 10;
              l.offsetYmm = Math.round(origSz.layerOffY[i] * factor * 10) / 10;
              if (l.type === "shape")
                l.shapeSizeMm = Math.round((origSz.layerShapes[i] || 10) * factor * 10) / 10;
              if (l.type === "image") {
                l.imageWidthMm = Math.round((origSz.layerImgW[i] || 10) * factor * 10) / 10;
                l.imageHeightMm = Math.round((origSz.layerImgH[i] || 10) * factor * 10) / 10;
              }
            });
          }
        } else {
          const r = Math.hypot(mmCoords.dxMm, mmCoords.dyMm / aspect) * 2;
          if (activeDrag.ring === "outer") {
            const thickness = Math.max(0.3, Math.min(8, Math.abs(mmCoords.dxMm)));
            cfg.outerRingThickness = Math.round(thickness * 10) / 10;
          } else if (activeDrag.ring === "inner") {
            const thickness = Math.max(0, Math.min(5, Math.abs(mmCoords.dxMm)));
            cfg.innerRingThickness = Math.round(thickness * 10) / 10;
          } else if (r > 10) {
            if (cfg.shape === "circle") {
              cfg.outerDiameter = Math.round(r * 10) / 10;
            } else {
              const ar = cfg.shape === "oval" ? cfg.height / cfg.width : 1;
              const w = Math.round(r * 10) / 10;
              cfg.width = Math.max(15, Math.min(120, w));
              cfg.height = Math.max(10, Math.min(90, Math.round(w * ar * 10) / 10));
            }
          }
        }
        buildLayerProps();
        render();
        return;
      }

      const l = cfg.layers.find((x) => x.id === activeDrag.layerId);
      if (!l) return;

      let angle;
      if (cfg.shape === "oval") {
        const dragSz = stampSize();
        angle = Math.atan2(mmCoords.dyMm / (dragSz.h / 2), mmCoords.dxMm / (dragSz.w / 2)) / DEG;
      } else {
        angle = Math.atan2(mmCoords.dyMm, mmCoords.dxMm) / DEG;
      }
      if (angle < 0) angle += 360;

      if (activeDrag.type === "handle") {
        if (activeDrag.role === "start") {
          l.startAngle = Math.round(angle);
        } else if (activeDrag.role === "end") {
          l.endAngle = Math.round(angle);
        } else if (activeDrag.role === "radius") {
          let newRadius;
          if (cfg.shape === "oval") {
            const dragSz2 = stampSize();
            newRadius =
              Math.hypot(mmCoords.dxMm / (dragSz2.w / 2), mmCoords.dyMm / (dragSz2.h / 2)) *
              (dragSz2.w / 2);
          } else {
            newRadius = Math.hypot(mmCoords.dxMm, mmCoords.dyMm);
          }
          l.radiusMm = Math.round(newRadius * 10) / 10;
        } else if (activeDrag.role === "translate") {
          l.offsetXmm = Math.round(mmCoords.dxMm * 10) / 10;
          l.offsetYmm = Math.round(mmCoords.dyMm * 10) / 10;
        }
      } else if (activeDrag.type === "layer_rotate") {
        const currentSpan = l.endAngle - l.startAngle;
        const newStart = angle + activeDrag.startAngleOffset;
        l.startAngle = Math.round((newStart + 360) % 360);
        l.endAngle = Math.round((newStart + currentSpan + 360) % 360);
      } else if (activeDrag.type === "layer_translate_curved") {
        const angleDelta = angle - activeDrag.startAngle;
        const sz2 = stampSize();
        const rx2 = sz2.w / 2,
          ry2 = sz2.h / 2;
        let newRadius;
        if (cfg.shape === "oval") {
          const dxEllipse = mmCoords.dxMm / rx2;
          const dyEllipse = mmCoords.dyMm / ry2;
          newRadius = Math.hypot(dxEllipse, dyEllipse) * rx2;
        } else {
          newRadius = Math.hypot(mmCoords.dxMm, mmCoords.dyMm);
        }
        const radiusDelta = newRadius - activeDrag.startRadius;
        l.radiusMm =
          Math.round(Math.max(5, Math.min(60, activeDrag.startRadius + radiusDelta)) * 10) / 10;
        l.startAngle = Math.round((activeDrag.startLayerStart + angleDelta + 360) % 360);
        l.endAngle = Math.round((activeDrag.startLayerEnd + angleDelta + 360) % 360);
      }

      buildLayerProps();
      render();
      return;
    }

    // Canvas pan is disabled.
  });

  let wasDragging = false;
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) =>
    viewport.addEventListener(ev, () => {
      if (activeDrag) wasDragging = true;
      panning = false;
      activeDrag = null;
      viewport.classList.remove("panning");
      viewport.classList.remove("manipulating");
      if (wasDragging) {
        wasDragging = false;
        pushHistory();
      }
    }),
  );

  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      // Ring selected → wheel adjusts thickness
      if (selShape && selRing) {
        const step = e.deltaY < 0 ? 0.1 : -0.1;
        if (selRing === "outer") {
          cfg.outerRingThickness = Math.max(
            0.1,
            Math.round((cfg.outerRingThickness + step) * 10) / 10,
          );
        } else if (selRing === "inner") {
          cfg.innerRingThickness = Math.max(
            0,
            Math.round((cfg.innerRingThickness + step) * 10) / 10,
          );
        } else if (selRing === "inner2") {
          cfg.innerRing2Thickness = Math.max(
            0,
            Math.round((cfg.innerRing2Thickness + step) * 10) / 10,
          );
        }
        renderLeftSidebar();
        renderD();
        autoHist();
        return;
      }
      // Text layer selected → wheel adjusts font size
      const l = selLayer();
      if (l && (l.mode === "curved" || l.mode === "straight")) {
        const step = e.deltaY < 0 ? 0.1 : -0.1;
        l.sizeMm = Math.max(1, Math.round((l.sizeMm + step) * 10) / 10);
        renderLeftSidebar();
        renderD();
        autoHist();
        return;
      }
      // Default → zoom
      setZoom(cfg.editorZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    },
    { passive: false },
  );

  viewport.addEventListener("mousemove", (e) => {
    if (activeDrag) return;
    const canvasCoords = getCanvasCoords(e.clientX, e.clientY);
    let cursor = "default";
    if (selShape) {
      const sz = stampSize();
      const hw = mmPx(sz.w) / 2,
        hh = mmPx(sz.h) / 2;
      const offX = mmPx(cfg.shapeOffsetXmm || 0);
      const offY = mmPx(cfg.shapeOffsetYmm || 0);
      const cx = canvas.width / 2 + offX,
        cy = canvas.height / 2 + offY;
      const corners = [
        { x: cx - hw, y: cy - hh, c: "nwse-resize" },
        { x: cx + hw, y: cy - hh, c: "nesw-resize" },
        { x: cx + hw, y: cy + hh, c: "nwse-resize" },
        { x: cx - hw, y: cy + hh, c: "nesw-resize" },
      ];
      for (const cr of corners) {
        if (Math.hypot(canvasCoords.x - cr.x, canvasCoords.y - cr.y) < 14) {
          cursor = cr.c;
          break;
        }
      }
    }
    viewport.style.cursor = cursor;
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if ((mod && e.key === "y") || (mod && e.shiftKey && e.key === "Z")) {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      selectAllLayers();
      return;
    }
    if (mod && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      saveState();
      showToast("Saved");
      return;
    }
    if (e.key === "g" && !mod) {
      e.preventDefault();
      const el = document.getElementById("showGuides");
      if (el) {
        el.checked = !el.checked;
        render();
      }
      return;
    }
    if (e.key === "f" && !mod) {
      e.preventDefault();
      fitView();
      return;
    }
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setZoom(cfg.editorZoom * 1.2);
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setZoom(cfg.editorZoom / 1.2);
    }
    if (e.key === "0") {
      e.preventDefault();
      setZoom(1, true);
    }
    if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      fitView();
    }
    if (e.key === "?" && !mod) {
      e.preventDefault();
      toggleShortcuts();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (!selShape && selId && cfg.layers.length > 1) {
        e.preventDefault();
        const i = cfg.layers.findIndex((l) => l.id === selId);
        if (i !== -1) {
          cfg.layers.splice(i, 1);
          selId = cfg.layers[Math.min(i, cfg.layers.length - 1)].id;
          selectedIds = new Set([selId]);
          autoHist();
          buildLayerList();
          buildLayerProps();
          render();
          showToast("Layer deleted");
        }
      }
    }
  });
}

function syncShapeChips() {
  document
    .querySelectorAll("[data-template]")
    .forEach((b) => b.classList.toggle("active", b.dataset.template === cfg.template));
}

/* ================================================================
   APPLY TEMPLATE
   ================================================================ */
function applyTemplate(name) {
  if (!TEMPLATES[name]) return;
  const styleKeys = [
    "inkColor",
    "opacity",
    "inkBleed",
    "inkBleedAmount",
    "grungeTexture",
    "grungeAmount",
    "rotationJitter",
    "jitterDegrees",
  ];
  const viewKeys = ["editorZoom", "editorPanX", "editorPanY"];
  const saved = {};
  [...styleKeys, ...viewKeys].forEach((k) => {
    saved[k] = cfg[k];
  });
  cfg = Object.assign(buildConfig(name), saved);
  DPI_CURRENT = cfg.dpi || 300;
  selId = cfg.layers[0].id;
  selectedIds = new Set([selId]);
  selShape = false;
  selRing = null;
  syncAll();
  render();
  pushHistory();
  showToast(TEMPLATES[name].label + " applied");
}

/* ================================================================
   SHAPE PANEL VISIBILITY  (show/hide fields based on shape)
   ================================================================ */

/* ================================================================
   GLOBAL INPUT BINDING  (data-bind attributes)
   ================================================================ */
function bindGlobalInputs(root = document) {
  root.querySelectorAll("[data-bind]").forEach((input) => {
    if (input.dataset.bound) return;
    input.dataset.bound = "1";

    const key = input.dataset.bind;
    const ev =
      input.type === "checkbox" || input.type === "color" || input.tagName === "SELECT"
        ? "change"
        : "input";

    // History on action complete
    if (input.type === "range" || input.type === "number") {
      input.addEventListener("change", autoHist);
    }

    input.addEventListener(ev, () => {
      let v = input.type === "checkbox" ? input.checked : input.value;

      // Ring selection sync: when editing outline controls, select that ring on canvas
      if (key === "outerRingThickness") {
        selShape = true;
        selRing = "outer";
        selId = null;
        selectedIds = new Set();
        buildLayerList();
        render();
      } else if (key === "innerRingThickness") {
        selShape = true;
        selRing = "inner";
        selId = null;
        selectedIds = new Set();
        buildLayerList();
        render();
      } else if (key === "innerRing2Thickness") {
        selShape = true;
        selRing = "inner2";
        selId = null;
        selectedIds = new Set();
        buildLayerList();
        render();
      } else if (key === "ringGap") {
        selShape = true;
        selRing = "outer";
        selId = null;
        selectedIds = new Set();
        buildLayerList();
        render();
      }

      // inkColor: sync the color picker ↔ hex text input pair
      if (key === "inkColor") {
        if (input.type === "text") {
          if (!/^#[0-9a-fA-F]{6}$/.test(v)) return; // wait for valid hex
        }
        // Sync sibling inkColor inputs
        document.querySelectorAll('[data-bind="inkColor"]').forEach((x) => {
          if (x !== input) x.value = v;
        });
        syncSwatches(v);
      }

      // Numeric conversion
      if (input.type === "number" || input.type === "range") v = parseFloat(v) || 0;

      cfg[key] = v;

      // Sync paired slider/number
      if (input.type === "range" || input.type === "number") {
        document.querySelectorAll(`[data-bind="${key}"]`).forEach((x) => {
          if (x !== input) x.value = cfg[key];
        });
      }

      if (key === "dpi") syncDPI();
      renderLeftSidebar();
      renderD();
    });
  });
}

function syncGlobalInputs() {
  document.querySelectorAll("[data-bind]").forEach((input) => {
    const v = cfg[input.dataset.bind];
    if (v === undefined) return;
    if (input.type === "checkbox") input.checked = Boolean(v);
    else input.value = v;
  });
  const hexEl = document.getElementById("inkColorHex");
  if (hexEl) hexEl.textContent = cfg.inkColor;
  syncSwatches(cfg.inkColor);
  syncShapeChips();
  renderLeftSidebar();
}

/* ================================================================
   SMART CONTROLS  (smartSize / smartThickness / size row switching)
   ================================================================ */
/* ================================================================
   DYNAMIC LEFT SIDEBAR — context-sensitive tools
   ================================================================ */
function renderRightEditorPanel(html, l) {
  const rep = document.getElementById("repBody");
  if (!rep) return;
  rep.innerHTML = html;
  if (selShape && selRing) {
    bindRingContextInputs(rep);
  } else if (
    l &&
    (l.mode === "curved" || l.mode === "straight") &&
    l.type !== "shape" &&
    l.type !== "image"
  ) {
    bindTextContextInputs(rep, l);
  } else if (l && l.type === "shape") {
    bindShapeLayerContextInputs(rep, l);
  } else if (l && l.type === "image") {
    bindImageContextInputs(rep, l);
  } else {
    bindStampContextInputs(rep);
  }
  initNumberInputs(rep);

  // Inline rename
  const nameEl = rep.querySelector(".ls-editor-name");
  if (nameEl && l) {
    nameEl.addEventListener("dblclick", () => {
      nameEl.contentEditable = "true";
      nameEl.focus();
      document.execCommand("selectAll", false, null);
    });
    const commit = () => {
      nameEl.contentEditable = "false";
      const v = (nameEl.textContent || "").trim();
      if (v) {
        l.name = v;
        l._autoName = false;
      } else {
        l.name = autoLayerName(l);
        l._autoName = true;
      }
      buildLayerList();
    };
    nameEl.addEventListener("blur", commit);
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameEl.blur();
      }
      if (e.key === "Escape") {
        nameEl.textContent = l.name;
        nameEl.blur();
      }
    });
  }
}

let _showEffects = false;

function renderLeftSidebar() {
  const l = selLayer();

  let html = "";
  if (_showEffects) {
    html =
      `<div class="ls-editor-head"><span class="ls-editor-tag">FX</span><span class="ls-editor-name">Effects</span><span class="ls-editor-back" id="effectsBackBtn" style="margin-left:auto">← Back</span></div>` +
      buildEffectsHTML();
  } else if (selShape && selRing) {
    html =
      `<div class="ls-editor-head"><span class="ls-editor-tag">RING</span><span class="ls-editor-name">Ring ${selRing === "outer" ? "1" : selRing === "inner" ? "2" : "3"}</span></div>` +
      buildRingContextHTML();
  } else if (
    l &&
    (l.mode === "curved" || l.mode === "straight") &&
    l.type !== "shape" &&
    l.type !== "image"
  ) {
    html =
      `<div class="ls-editor-head"><span class="ls-editor-tag">${l.mode === "curved" ? "ARC" : "LINE"}</span><span class="ls-editor-name" title="Double-click to rename">${escapeHtml(l.name || "Text")}</span></div>` +
      buildTextContextHTML(l);
  } else if (l && l.type === "shape") {
    html =
      `<div class="ls-editor-head"><span class="ls-editor-tag">SHAPE</span><span class="ls-editor-name" title="Double-click to rename">${escapeHtml(l.name || "Shape")}</span></div>` +
      buildShapeLayerContextHTML(l);
  } else if (l && l.type === "image") {
    html =
      `<div class="ls-editor-head"><span class="ls-editor-tag">IMG</span><span class="ls-editor-name" title="Double-click to rename">${escapeHtml(l.name || "Image")}</span></div>` +
      buildImageContextHTML(l);
  } else {
    html =
      `<div class="ls-editor-head"><span class="ls-editor-tag">STAMP</span><span class="ls-editor-name">Stamp settings</span></div>` +
      buildStampContextHTML();
  }

  renderRightEditorPanel(html, _showEffects ? null : l);

  if (_showEffects) {
    document.querySelectorAll(".tool-rail-panel .rp-section").forEach((sec) => {
      const which = sec.dataset.rp;
      if (which === "layers") sec.style.display = "";
      else sec.style.display = "none";
    });
    const backBtn = document.getElementById("effectsBackBtn");
    if (backBtn)
      backBtn.addEventListener("click", () => {
        _showEffects = false;
        renderLeftSidebar();
        render();
      });
  } else {
    document.querySelectorAll(".tool-rail-panel .rp-section").forEach((sec) => {
      const which = sec.dataset.rp;
      if (which === "layers") sec.style.display = "";
      else sec.style.display = l ? "" : "";
    });
  }
}

function buildEffectsHTML() {
  return `
    <div class="prop-section">
      <div class="prop-label">Opacity</div>
      <div class="slider-row"><input type="range" min="5" max="100" step="1" data-ls="opacity" value="${cfg.opacity}"><input type="number" min="5" max="100" step="1" data-ls="opacity" value="${cfg.opacity}"></div>
    </div>
    <div class="prop-section">
      <div class="slider-row" style="margin-top:2px"><label class="eff-amount-label">Bleed</label><input type="range" min="0" max="2" step="0.05" data-ls="inkBleedAmount" value="${cfg.inkBleedAmount}"><input type="number" min="0" max="2" step="0.05" data-ls="inkBleedAmount" value="${cfg.inkBleedAmount}"></div>
      <div class="slider-row"><label class="eff-amount-label">Grunge</label><input type="range" min="0" max="1" step="0.01" data-ls="grungeAmount" value="${cfg.grungeAmount}"><input type="number" min="0" max="1" step="0.01" data-ls="grungeAmount" value="${cfg.grungeAmount}"></div>
      <div class="slider-row"><label class="eff-amount-label">Jitter</label><input type="range" min="0" max="1.5" step="0.05" data-ls="jitterDegrees" value="${cfg.jitterDegrees}"><input type="number" min="0" max="1.5" step="0.05" data-ls="jitterDegrees" value="${cfg.jitterDegrees}"></div>
    </div>
  `;
}

function buildRingContextHTML() {
  const rv = cfg.ringVisible || {};
  const eye = (ring, visible) =>
    visible
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 10.6A3 3 0 0014.8 14.8M9.9 5.2A9.7 9.7 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.8M6.1 6.2A17 17 0 002 12s4 7 10 7a9.6 9.6 0 003.1-.5"/></svg>';
  return `
    <div class="rp-ring-row" data-rng-row="1">
      <div class="rp-ring-row-head">
        <span class="ring-dot ring-dot-outer"></span>
        <span class="prop-label">1</span>
        <button class="layer-icon-btn" data-rng-vis="outer" title="Show/hide" style="opacity:${(rv.outer ?? 1) ? "1" : "0.4"}">${eye("outer", rv.outer ?? 1)}</button>
        <span class="prop-label rp-ring-val" data-rng-val="1">${cfg.outerRingThickness ?? 1}</span>
      </div>
      <div class="slider-row"><input type="range" min="0.1" max="5" step="0.1" data-rng-width="outer" value="${cfg.outerRingThickness ?? 1}"></div>
    </div>
    ${
      cfg.rings >= 2
        ? `
    <div class="rp-ring-row" data-rng-row="2">
      <div class="rp-ring-row-head">
        <span class="ring-dot ring-dot-inner"></span>
        <span class="prop-label">2</span>
        <button class="layer-icon-btn" data-rng-vis="inner" title="Show/hide" style="opacity:${(rv.inner ?? 1) ? "1" : "0.4"}">${eye("inner", rv.inner ?? 1)}</button>
        <span class="prop-label rp-ring-val" data-rng-val="2">${cfg.innerRingThickness ?? 0.5}</span>
      </div>
      <div class="slider-row"><input type="range" min="0" max="5" step="0.1" data-rng-width="inner" value="${cfg.innerRingThickness ?? 0.5}"></div>
    </div>`
        : ""
    }
    ${
      cfg.rings >= 3
        ? `
    <div class="rp-ring-row" data-rng-row="3">
      <div class="rp-ring-row-head">
        <span class="ring-dot ring-dot-inner2"></span>
        <span class="prop-label">3</span>
        <button class="layer-icon-btn" data-rng-vis="inner2" title="Show/hide" style="opacity:${(rv.inner2 ?? 1) ? "1" : "0.4"}">${eye("inner2", rv.inner2 ?? 1)}</button>
        <span class="prop-label rp-ring-val" data-rng-val="3">${cfg.innerRing2Thickness ?? 0.5}</span>
      </div>
      <div class="slider-row"><input type="range" min="0" max="5" step="0.1" data-rng-width="inner2" value="${cfg.innerRing2Thickness ?? 0.5}"></div>
    </div>`
        : ""
    }
    ${
      cfg.rings >= 2
        ? `
    <div class="rp-ring-gap">
      <div class="prop-label">Gap</div>
      <div class="slider-row"><input type="range" min="0" max="10" step="0.1" data-rng-gap value="${cfg.ringGap || 0}"><input type="number" min="0" max="10" step="0.1" data-rng-gap value="${cfg.ringGap || 0}"></div>
    </div>`
        : ""
    }
  `;
}

function bindRingContextInputs(ctx) {
  // Thickness sliders
  ctx.querySelectorAll("[data-rng-width]").forEach((slider) => {
    const ring = slider.dataset.rngWidth;
    const valEl = ctx.querySelector(
      `[data-rng-val="${ring === "outer" ? "1" : ring === "inner" ? "2" : "3"}"]`,
    );
    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value) || 0;
      if (ring === "outer") cfg.outerRingThickness = v;
      else if (ring === "inner") cfg.innerRingThickness = v;
      else if (ring === "inner2") cfg.innerRing2Thickness = v;
      if (valEl) valEl.textContent = v;
      renderD();
    });
    slider.addEventListener("change", autoHist);
  });
  // Ring visibility toggles
  ctx.querySelectorAll("[data-rng-vis]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ring = btn.dataset.rngVis;
      const rv = cfg.ringVisible || (cfg.ringVisible = {});
      rv[ring] = !(rv[ring] ?? true);
      btn.style.opacity = (rv[ring] ?? 1) ? "1" : "0.4";
      btn.innerHTML =
        (rv[ring] ?? 1)
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 10.6A3 3 0 0014.8 14.8M9.9 5.2A9.7 9.7 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.8M6.1 6.2A17 17 0 002 12s4 7 10 7a9.6 9.6 0 003.1-.5"/></svg>';
      renderD();
    });
  });
  // Gap slider
  const gaps = ctx.querySelectorAll("[data-rng-gap]");
  gaps.forEach((s) => {
    s.addEventListener("input", () => {
      const v = parseFloat(s.value) || 0;
      cfg.ringGap = v;
      gaps.forEach((x) => {
        if (x !== s) x.value = v;
      });
      renderD();
    });
    s.addEventListener("change", autoHist);
  });
}

// Deprecated — text props now live in the left sidebar. Kept as a no-op
// so any remaining call sites stay safe.
/* ── Ring Controls (right panel) ── */
function initRingControls() {
  const r1 = document.getElementById("rpRing1Width");
  const r2 = document.getElementById("rpRing2Width");
  const r3 = document.getElementById("rpRing3Width");
  const gapInput = document.getElementById("rpRingGapInput");
  const gapNum = document.getElementById("rpRingGapNum");

  if (r1) {
    r1.addEventListener("input", () => {
      cfg.outerRingThickness = parseFloat(r1.value) || 0;
      document.getElementById("rpRing1Val").textContent = r1.value;
      renderD();
    });
    r1.addEventListener("change", autoHist);
  }
  if (r2) {
    r2.addEventListener("input", () => {
      cfg.innerRingThickness = parseFloat(r2.value) || 0;
      document.getElementById("rpRing2Val").textContent = r2.value;
      renderD();
    });
    r2.addEventListener("change", autoHist);
  }
  if (r3) {
    r3.addEventListener("input", () => {
      cfg.innerRing2Thickness = parseFloat(r3.value) || 0;
      document.getElementById("rpRing3Val").textContent = r3.value;
      renderD();
    });
    r3.addEventListener("change", autoHist);
  }

  const syncGap = (v) => {
    cfg.ringGap = parseFloat(v) || 0;
    if (gapInput) gapInput.value = cfg.ringGap;
    if (gapNum) gapNum.value = cfg.ringGap;
    renderD();
  };
  if (gapInput) {
    gapInput.addEventListener("input", () => syncGap(gapInput.value));
    gapInput.addEventListener("change", autoHist);
  }
  if (gapNum) {
    gapNum.addEventListener("input", () => syncGap(gapNum.value));
    gapNum.addEventListener("change", autoHist);
  }

  const ringCtrl = document.getElementById("rpRingsBody");
  if (ringCtrl) initNumberInputs(ringCtrl);

  // Ring visibility toggles
  document.querySelectorAll(".ring-vis").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ring = btn.dataset.ring;
      cfg.ringVisible = cfg.ringVisible || {};
      cfg.ringVisible[ring] = !(cfg.ringVisible[ring] ?? true);
      autoHist();
      render();
    });
  });
}

function updateRingControls() {
  const rv = cfg.ringVisible || {};
  const setVisIcon = (ring, btn) => {
    if (!btn) return;
    const visible = rv[ring] ?? true;
    btn.innerHTML = visible
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 10.6A3 3 0 0014.8 14.8M9.9 5.2A9.7 9.7 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.8M6.1 6.2A17 17 0 002 12s4 7 10 7a9.6 9.6 0 003.1-.5"/></svg>';
    btn.style.opacity = visible ? "1" : "0.4";
  };

  const r1 = document.getElementById("rpRing1Width");
  const v1 = document.getElementById("rpRing1Val");
  if (r1) r1.value = cfg.outerRingThickness ?? 1;
  if (v1) v1.textContent = cfg.outerRingThickness ?? 1;
  setVisIcon("outer", document.querySelector('.ring-vis[data-ring="outer"]'));

  const row2 = document.getElementById("rpRingRow2");
  const r2 = document.getElementById("rpRing2Width");
  const v2 = document.getElementById("rpRing2Val");
  if (row2) row2.style.display = cfg.rings >= 2 ? "" : "none";
  if (r2) r2.value = cfg.innerRingThickness ?? 0.5;
  if (v2) v2.textContent = cfg.innerRingThickness ?? 0.5;
  setVisIcon("inner", document.querySelector('.ring-vis[data-ring="inner"]'));

  const row3 = document.getElementById("rpRingRow3");
  const r3 = document.getElementById("rpRing3Width");
  const v3 = document.getElementById("rpRing3Val");
  if (row3) row3.style.display = cfg.rings >= 3 ? "" : "none";
  if (r3) r3.value = cfg.innerRing2Thickness ?? 0.5;
  if (v3) v3.textContent = cfg.innerRing2Thickness ?? 0.5;
  setVisIcon("inner2", document.querySelector('.ring-vis[data-ring="inner2"]'));

  const gapRow = document.getElementById("rpRingGap");
  const gapInput = document.getElementById("rpRingGapInput");
  const gapNum = document.getElementById("rpRingGapNum");
  if (gapRow) gapRow.style.display = cfg.rings >= 2 ? "" : "none";
  if (gapInput) gapInput.value = cfg.ringGap || 0;
  if (gapNum) gapNum.value = cfg.ringGap || 0;
}

function buildStampContextHTML() {
  // Fix: cfg.shape uses 'circle','oval','rectangle' values; use template name too.
  const isCircle = cfg.shape === "circle";
  const isRect = cfg.shape === "rectangle";
  const isOval = cfg.shape === "oval";
  const sizeLabel = isCircle ? "Diameter" : "Width";
  const sizeVal = isCircle ? cfg.outerDiameter || cfg.width : cfg.width;
  const sizeMax = 120;
  const thickAvg =
    ((cfg.outerRingThickness || 0) +
      (cfg.innerRingThickness || 0) +
      (cfg.innerRing2Thickness || 0)) /
    (cfg.rings >= 3 ? 3 : cfg.rings >= 2 ? 2 : 1);

  const rc = cfg.ringColors || {};
  const swatch = (key, label) => `
    <div class="ls-ring-color">
      <label class="ls-row-label">${label}</label>
      <input type="color" class="ls-color-input" data-ls-ring="${key}" value="${rc[key] || cfg.inkColor}">
      <button class="ls-clear-color" data-ls-ring-clear="${key}" title="Use ink color">×</button>
    </div>`;

  return `
    <div class="ls-sub-title">Stamp</div>
    <div class="ls-row"><label class="ls-row-label">${sizeLabel}</label>
      <div class="slider-row"><input type="range" min="10" max="${sizeMax}" step="0.5" data-ls="size" value="${sizeVal}"><input type="number" min="10" max="${sizeMax}" step="0.5" data-ls="size" value="${sizeVal}"></div>
    </div>
    ${
      !isCircle
        ? `<div class="ls-row"><label class="ls-row-label">Height</label>
      <div class="slider-row"><input type="range" min="10" max="90" step="0.5" data-ls="height" value="${cfg.height}"><input type="number" min="10" max="90" step="0.5" data-ls="height" value="${cfg.height}"></div>
    </div>`
        : ""
    }
    <div class="ls-row"><label class="ls-row-label">Thickness</label>
      <div class="slider-row"><input type="range" min="0" max="8" step="0.1" data-ls="thickness" value="${Math.round(thickAvg * 10) / 10}"><input type="number" min="0" max="8" step="0.1" data-ls="thickness" value="${Math.round(thickAvg * 10) / 10}"></div>
    </div>
    <div class="ls-row"><label class="ls-row-label">Center</label>
      <div class="slider-row"><input type="range" min="0" max="45" step="0.5" data-ls="centerAreaDiameter" value="${cfg.centerAreaDiameter}"><input type="number" min="0" max="45" step="0.5" data-ls="centerAreaDiameter" value="${cfg.centerAreaDiameter}"></div>
    </div>
    ${
      isRect
        ? `<div class="ls-row"><label class="ls-row-label">Corner</label>
      <div class="slider-row"><input type="range" min="0" max="20" step="0.5" data-ls="cornerRadius" value="${cfg.cornerRadius}"><input type="number" min="0" max="20" step="0.5" data-ls="cornerRadius" value="${cfg.cornerRadius}"></div>
    </div>`
        : ""
    }
    <div class="ls-row-inline"><label class="ls-row-label">Offset</label>
      <div class="ls-offset-pair">
        <input type="number" min="-30" max="30" step="0.5" data-ls="offsetX" value="${cfg.shapeOffsetXmm || 0}" placeholder="X">
        <input type="number" min="-30" max="30" step="0.5" data-ls="offsetY" value="${cfg.shapeOffsetYmm || 0}" placeholder="Y">
      </div>
    </div>

    <div class="ls-sub-title">Ring colors</div>
    ${swatch("outer", "Outer")}
    ${cfg.rings >= 2 ? swatch("inner", "Middle") : ""}
    ${cfg.rings >= 3 ? swatch("inner2", "Inner") : ""}
    ${cfg.centerAreaDiameter > 0 ? swatch("center", "Center") : ""}
  `;
}

function buildTextContextHTML(l) {
  const fontOpts = fontOptHTML(l.font);
  const weightOpts = (FONT_WEIGHTS[l.font] || [400, 700, 900])
    .map((w) => {
      const names = {
        100: "Thin",
        200: "XLight",
        300: "Light",
        400: "Regular",
        500: "Medium",
        600: "SBold",
        700: "Bold",
        800: "XBold",
        900: "Black",
      };
      return `<option value="${w}"${l.weight == w ? " selected" : ""}>${names[w] || w}</option>`;
    })
    .join("");

  return `
    <div class="ls-sub-title">${escapeHtml(l.name) || "Text"}</div>
    <div class="ls-row"><label class="ls-row-label">Text</label></div>
    <textarea class="ls-textarea" data-ls="text" dir="auto">${escapeHtml(l.text) || ""}</textarea>
    <div class="ls-row"><label class="ls-row-label">Font</label>
      <select class="ls-select" data-ls="font">${fontOpts}</select>
    </div>
    <div class="ls-row-inline">
      <select class="ls-select" data-ls="weight" style="flex:1">${weightOpts}</select>
      <select class="ls-select" data-ls="mode" style="flex:1">
        <option value="curved"${l.mode === "curved" ? " selected" : ""}>Curved</option>
        <option value="straight"${l.mode === "straight" ? " selected" : ""}>Straight</option>
      </select>
    </div>
    ${
      l.mode === "straight"
        ? `<div class="ls-row-inline">
      <select class="ls-select" data-ls="dir" style="flex:1">
        <option value="auto"${l.dir === "auto" ? " selected" : ""}>Auto</option>
        <option value="ltr"${l.dir === "ltr" ? " selected" : ""}>LTR</option>
        <option value="rtl"${l.dir === "rtl" ? " selected" : ""}>RTL</option>
      </select>
    </div>`
        : ""
    }
    <div class="ls-row"><label class="ls-row-label">Size</label>
      <div class="slider-row"><input type="range" min="1" max="18" step="0.1" data-ls="sizeMm" value="${l.sizeMm}"><input type="number" min="1" max="18" step="0.1" data-ls="sizeMm" value="${l.sizeMm}"></div>
    </div>
    <div class="ls-row"><label class="ls-row-label">Spacing</label>
      <div class="slider-row"><input type="range" min="-4" max="20" step="0.5" data-ls="letterSpacing" value="${l.letterSpacing}"><input type="number" min="-4" max="20" step="0.5" data-ls="letterSpacing" value="${l.letterSpacing}"></div>
    </div>
    <div class="ls-row"><label class="ls-row-label">Word sp</label>
      <div class="slider-row"><input type="range" min="-4" max="30" step="0.5" data-ls="wordSpacing" value="${l.wordSpacing}"><input type="number" min="-4" max="30" step="0.5" data-ls="wordSpacing" value="${l.wordSpacing}"></div>
    </div>
    <div class="ls-row"><label class="ls-row-label">Width</label>
      <div class="slider-row"><input type="range" min="0.3" max="3" step="0.05" data-ls="scaleX" value="${l.scaleX}"><input type="number" min="0.3" max="3" step="0.05" data-ls="scaleX" value="${l.scaleX}"></div>
    </div>
    <div class="ls-row"><label class="ls-row-label">Height</label>
      <div class="slider-row"><input type="range" min="0.3" max="3" step="0.05" data-ls="scaleY" value="${l.scaleY}"><input type="number" min="0.3" max="3" step="0.05" data-ls="scaleY" value="${l.scaleY}"></div>
    </div>
    ${
      l.mode === "curved"
        ? `
    <div class="ls-row">
      <label class="ls-row-label">Snap to ring</label>
      <div class="ls-snap-row">
        <button class="ls-mini-btn" data-snap="outer">Outer channel</button>
        ${cfg.rings >= 3 ? `<button class="ls-mini-btn" data-snap="inner">Inner channel</button>` : ""}
        <button class="ls-mini-btn" data-snap="center">Near center</button>
      </div>
    </div>
    <div class="ls-row"><label class="ls-row-label">Radius</label>
      <div class="slider-row"><input type="range" min="3" max="42" step="0.1" data-ls="radiusMm" value="${l.radiusMm}"><input type="number" min="3" max="42" step="0.1" data-ls="radiusMm" value="${l.radiusMm}"></div>
    </div>
    <div class="ls-row"><label class="ls-row-label">Start</label>
      <div class="slider-row"><input type="range" min="0" max="360" step="1" data-ls="startAngle" value="${l.startAngle}"><input type="number" min="0" max="360" step="1" data-ls="startAngle" value="${l.startAngle}"></div>
    </div>
    <div class="ls-row"><label class="ls-row-label">End</label>
      <div class="slider-row"><input type="range" min="0" max="360" step="1" data-ls="endAngle" value="${l.endAngle}"><input type="number" min="0" max="360" step="1" data-ls="endAngle" value="${l.endAngle}"></div>
    </div>
    <label class="ls-toggle"><input type="checkbox" data-ls="flip"${l.flip ? " checked" : ""}><span>Flip</span></label>
    `
        : `
    <div class="ls-row-inline"><label class="ls-row-label">Offset</label>
      <div class="ls-offset-pair">
        <input type="number" min="-50" max="50" step="0.1" data-ls="offsetXmm" value="${l.offsetXmm || 0}" placeholder="X">
        <input type="number" min="-50" max="50" step="0.1" data-ls="offsetYmm" value="${l.offsetYmm || 0}" placeholder="Y">
      </div>
    </div>
    `
    }
    <div class="ls-sub-title">Color</div>
    <div class="ls-color-row">
      <input type="color" class="ls-color-input" data-ls-color value="${l.color || cfg.inkColor}">
      <button class="ls-clear-color" data-ls-color-clear title="Use stamp ink color">Use ink</button>
    </div>
  `;
}

function buildShapeLayerContextHTML(l) {
  const shapeOpts = ["star", "pentagon", "hexagon", "diamond", "cross", "circle"]
    .map(
      (s) =>
        `<option value="${s}"${l.shapeType === s ? " selected" : ""}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`,
    )
    .join("");
  return `
    <div class="ls-sub-title">${escapeHtml(l.name) || "Shape"}</div>
    <div class="ls-row"><label class="ls-row-label">Shape</label>
      <select class="ls-select" data-ls="shapeType">${shapeOpts}</select>
    </div>
    <div class="ls-row"><label class="ls-row-label">Size</label>
      <div class="slider-row"><input type="range" min="1" max="20" step="0.5" data-ls="shapeSizeMm" value="${l.shapeSizeMm || 10}"><input type="number" min="1" max="20" step="0.5" data-ls="shapeSizeMm" value="${l.shapeSizeMm || 10}"></div>
    </div>
    <div class="ls-row"><label class="ls-row-label">Rotation</label>
      <div class="slider-row"><input type="range" min="0" max="360" step="1" data-ls="shapeRotation" value="${l.shapeRotation || 0}"><input type="number" min="0" max="360" step="1" data-ls="shapeRotation" value="${l.shapeRotation || 0}"></div>
    </div>
    <div class="ls-row-inline"><label class="ls-row-label">Offset</label>
      <div class="ls-offset-pair">
        <input type="number" min="-30" max="30" step="0.1" data-ls="offsetXmm" value="${l.offsetXmm || 0}" placeholder="X">
        <input type="number" min="-30" max="30" step="0.1" data-ls="offsetYmm" value="${l.offsetYmm || 0}" placeholder="Y">
      </div>
    </div>
    <label class="ls-toggle"><input type="checkbox" data-ls="shapeFill"${l.shapeFill ? " checked" : ""}><span>Filled</span></label>
    <div class="ls-sub-title">Color</div>
    <div class="ls-color-row">
      <input type="color" class="ls-color-input" data-ls-color value="${l.color || cfg.inkColor}">
      <button class="ls-clear-color" data-ls-color-clear title="Use stamp ink color">Use ink</button>
    </div>
  `;
}

function buildImageContextHTML(l) {
  return `
    <div class="ls-sub-title">${escapeHtml(l.name) || "Image"}</div>
    <div class="ls-row"><label class="ls-row-label">Width</label>
      <div class="slider-row"><input type="range" min="1" max="30" step="0.5" data-ls="imageWidthMm" value="${l.imageWidthMm || 10}"><input type="number" min="1" max="30" step="0.5" data-ls="imageWidthMm" value="${l.imageWidthMm || 10}"></div>
    </div>
    <div class="ls-row"><label class="ls-row-label">Height</label>
      <div class="slider-row"><input type="range" min="1" max="30" step="0.5" data-ls="imageHeightMm" value="${l.imageHeightMm || 10}"><input type="number" min="1" max="30" step="0.5" data-ls="imageHeightMm" value="${l.imageHeightMm || 10}"></div>
    </div>
    <div class="ls-row-inline"><label class="ls-row-label">Offset</label>
      <div class="ls-offset-pair">
        <input type="number" min="-30" max="30" step="0.1" data-ls="offsetXmm" value="${l.offsetXmm || 0}" placeholder="X">
        <input type="number" min="-30" max="30" step="0.1" data-ls="offsetYmm" value="${l.offsetYmm || 0}" placeholder="Y">
      </div>
    </div>
  `;
}

function buildAlignRowHTML() {
  return `<div class="ls-align-row">
    <button class="ls-align-btn" data-align="left" title="Align left"><svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="3" y1="4" x2="15" y2="4"/><line x1="3" y1="9" x2="11" y2="9"/><line x1="3" y1="14" x2="13" y2="14"/></svg></button>
    <button class="ls-align-btn" data-align="centerH" title="Center H"><svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="9" y1="2" x2="9" y2="16"/><line x1="5" y1="7" x2="13" y2="7"/><line x1="6" y1="11" x2="12" y2="11"/></svg></button>
    <button class="ls-align-btn" data-align="right" title="Align right"><svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="3" y1="4" x2="15" y2="4"/><line x1="7" y1="9" x2="15" y2="9"/><line x1="5" y1="14" x2="15" y2="14"/></svg></button>
    <button class="ls-align-btn" data-align="top" title="Align top"><svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="4" y1="3" x2="4" y2="15"/><line x1="9" y1="3" x2="9" y2="11"/><line x1="14" y1="3" x2="14" y2="13"/></svg></button>
    <button class="ls-align-btn" data-align="centerV" title="Center V"><svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="2" y1="9" x2="16" y2="9"/><line x1="7" y1="5" x2="7" y2="13"/><line x1="11" y1="6" x2="11" y2="12"/></svg></button>
    <button class="ls-align-btn" data-align="bottom" title="Align bottom"><svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="4" y1="3" x2="4" y2="15"/><line x1="9" y1="7" x2="9" y2="15"/><line x1="14" y1="5" x2="14" y2="15"/></svg></button>
    <button class="ls-align-btn" data-align="distributeV" title="Distribute"><svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="3" y1="4" x2="15" y2="4"/><line x1="3" y1="9" x2="15" y2="9"/><line x1="3" y1="14" x2="15" y2="14"/></svg></button>
  </div>`;
}

const LS_NUMERIC = new Set([
  "size",
  "height",
  "thickness",
  "ringGap",
  "centerAreaDiameter",
  "cornerRadius",
  "offsetX",
  "offsetY",
  "sizeMm",
  "letterSpacing",
  "wordSpacing",
  "scaleX",
  "scaleY",
  "radiusMm",
  "startAngle",
  "endAngle",
  "offsetXmm",
  "offsetYmm",
  "shapeSizeMm",
  "shapeRotation",
  "imageWidthMm",
  "imageHeightMm",
  "opacity",
  "inkBleedAmount",
  "grungeAmount",
  "jitterDegrees",
]);

function bindStampContextInputs(ctx) {
  // Quick template chips
  ctx.querySelectorAll("[data-tpl]").forEach((btn) => {
    btn.addEventListener("click", () => applyShapeKeepLayers(btn.dataset.tpl));
  });
  // Ring color pickers
  ctx.querySelectorAll("[data-ls-ring]").forEach((input) => {
    const k = input.dataset.lsRing;
    input.addEventListener("input", () => {
      cfg.ringColors = cfg.ringColors || {};
      cfg.ringColors[k] = input.value;
      renderD();
    });
    input.addEventListener("change", autoHist);
  });
  ctx.querySelectorAll("[data-ls-ring-clear]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.lsRingClear;
      if (cfg.ringColors) cfg.ringColors[k] = null;
      renderLeftSidebar();
      renderD();
      autoHist();
    });
  });
  // All data-ls inputs
  ctx.querySelectorAll("[data-ls]").forEach((input) => {
    const key = input.dataset.ls;
    const ev = input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input";
    if (input.type === "range" || input.type === "number")
      input.addEventListener("change", autoHist);
    input.addEventListener(ev, () => {
      let v = input.type === "checkbox" ? input.checked : input.value;
      if (LS_NUMERIC.has(key)) v = parseFloat(v) || 0;
      if (key === "size") {
        if (cfg.shape === "circle") cfg.outerDiameter = v;
        else {
          cfg.width = v;
          cfg.outerDiameter = v;
        }
      } else if (key === "thickness") {
        cfg.outerRingThickness = v;
        if (cfg.rings >= 2) cfg.innerRingThickness = Math.round(v * 0.5 * 10) / 10;
        if (cfg.rings >= 3) cfg.innerRing2Thickness = Math.round(v * 0.75 * 10) / 10;
      } else if (key === "centerAreaDiameter") cfg.centerAreaDiameter = v;
      else if (key === "cornerRadius") cfg.cornerRadius = v;
      else if (key === "offsetX") cfg.shapeOffsetXmm = v;
      else if (key === "offsetY") cfg.shapeOffsetYmm = v;
      else if (key === "height") cfg.height = v;
      else if (key === "opacity") cfg.opacity = v;
      else if (key === "inkBleedAmount") cfg.inkBleedAmount = v;
      else if (key === "grungeAmount") cfg.grungeAmount = v;
      else if (key === "jitterDegrees") cfg.jitterDegrees = v;
      // Sync paired slider/number
      if (input.type === "range" || input.type === "number") {
        ctx.querySelectorAll(`[data-ls="${key}"]`).forEach((x) => {
          if (x !== input) x.value = v;
        });
      }
      renderD();
    });
  });
  // Align buttons
  bindAlignButtons(ctx);
}

/* Switch stamp template/geometry but keep current layers intact. */
function applyShapeKeepLayers(name) {
  if (!TEMPLATES[name]) return;
  const t = TEMPLATES[name];
  cfg.template = name;
  cfg.shape = t.shape;
  cfg.outerDiameter = t.outerDiameter;
  cfg.width = t.width;
  cfg.height = t.height;
  cfg.outerRingThickness = t.outerRingThickness;
  cfg.innerRingThickness = t.innerRingThickness;
  cfg.innerRing2Thickness = t.innerRing2Thickness || t.innerRingThickness * 0.8;
  cfg.ringGap = t.ringGap;
  cfg.centerAreaDiameter = t.centerAreaDiameter;
  cfg.cornerRadius = t.cornerRadius;
  cfg.rings = t.rings;
  syncAll();
  renderLeftSidebar();
  render();
  pushHistory();
}

function bindTextContextInputs(ctx, l) {
  ctx.querySelectorAll("[data-ls]").forEach((input) => {
    const key = input.dataset.ls;
    const ev = input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input";
    if (input.type === "range" || input.type === "number")
      input.addEventListener("change", autoHist);
    input.addEventListener(ev, () => {
      let v = input.type === "checkbox" ? input.checked : input.value;
      if (LS_NUMERIC.has(key)) v = parseFloat(v) || 0;
      if (key === "font") {
        l.font = v;
        renderLeftSidebar();
      } else if (key === "weight") {
        l.weight = parseInt(v) || 400;
      } else if (key === "mode") {
        l.mode = v;
        renderLeftSidebar();
      } else if (key === "dir") {
        l.dir = v;
      } else if (key === "text") {
        l.text = v;
        if (l._autoName) l.name = autoLayerName(l);
        buildLayerList();
        const head = document.querySelector("#lsContext .ls-editor-name");
        if (head && document.activeElement !== head) head.textContent = l.name;
      } else if (key === "flip") {
        l.flip = input.checked;
      } else {
        l[key] = v;
      }
      // Sync paired slider/number
      if (input.type === "range" || input.type === "number") {
        ctx.querySelectorAll(`[data-ls="${key}"]`).forEach((x) => {
          if (x !== input) x.value = v;
        });
      }
      autoHist();
      renderD();
    });
  });
  bindLayerExtras(ctx, l);
}

function bindShapeLayerContextInputs(ctx, l) {
  ctx.querySelectorAll("[data-ls]").forEach((input) => {
    const key = input.dataset.ls;
    const ev = input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input";
    if (input.type === "range" || input.type === "number")
      input.addEventListener("change", autoHist);
    input.addEventListener(ev, () => {
      let v = input.type === "checkbox" ? input.checked : input.value;
      if (LS_NUMERIC.has(key)) v = parseFloat(v) || 0;
      l[key] = v;
      if (input.type === "range" || input.type === "number") {
        ctx.querySelectorAll(`[data-ls="${key}"]`).forEach((x) => {
          if (x !== input) x.value = v;
        });
      }
      autoHist();
      renderD();
    });
  });
  bindLayerExtras(ctx, l);
}

/* Wire up the per-layer color picker + curved-text "Snap to ring" buttons.
   Reused by text/shape/image contexts. */
function bindLayerExtras(ctx, l) {
  const color = ctx.querySelector("[data-ls-color]");
  if (color) {
    color.addEventListener("input", () => {
      l.color = color.value;
      renderD();
    });
    color.addEventListener("change", autoHist);
  }
  const clear = ctx.querySelector("[data-ls-color-clear]");
  if (clear) {
    clear.addEventListener("click", () => {
      l.color = null;
      renderLeftSidebar();
      renderD();
      autoHist();
    });
  }
  ctx.querySelectorAll("[data-snap]").forEach((btn) => {
    btn.addEventListener("click", () => {
      l.radiusMm = +ringChannelRadiusMm(btn.dataset.snap).toFixed(1);
      renderLeftSidebar();
      renderD();
      autoHist();
    });
  });
}

function bindImageContextInputs(ctx, l) {
  bindShapeLayerContextInputs(ctx, l);
}

function bindAlignButtons(root) {
  root.querySelectorAll("[data-align]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const layers =
        selectedIds.size > 0
          ? cfg.layers.filter((l) => selectedIds.has(l.id))
          : selLayer()
            ? [selLayer()]
            : [];
      if (!layers.length) return;
      const align = btn.dataset.align;
      layers.forEach((ly) => {
        if (ly.mode === "curved") {
          if (align === "centerH") {
            ly.startAngle = 0;
            ly.endAngle = 180;
          } else if (align === "left") {
            ly.startAngle = 200;
            ly.endAngle = 340;
          } else if (align === "right") {
            ly.startAngle = 200;
            ly.endAngle = 340;
            ly.flip = true;
          } else if (align === "top") {
            ly.startAngle = 225;
            ly.endAngle = 315;
          } else if (align === "bottom") {
            ly.startAngle = 135;
            ly.endAngle = 45;
            ly.flip = true;
          }
        } else {
          if (align === "left") ly.offsetXmm = -4;
          else if (align === "right") ly.offsetXmm = 4;
          else if (align === "centerH") ly.offsetXmm = 0;
          else if (align === "top") ly.offsetYmm = -4;
          else if (align === "bottom") ly.offsetYmm = 4;
          else if (align === "centerV") ly.offsetYmm = 0;
          else if (align === "distributeV") {
            const sorted = [...layers].sort((a, b) => (a.offsetYmm || 0) - (b.offsetYmm || 0));
            const step = sorted.length > 1 ? 8 / (sorted.length - 1) : 0;
            sorted.forEach((ly2, i) => {
              ly2.offsetYmm = -4 + step * i;
            });
          }
        }
      });
      autoHist();
      renderLeftSidebar();
      renderD();
    });
  });
}

/* ================================================================
   SWATCHES
   ================================================================ */
function buildSwatches() {
  const row = document.getElementById("swatchRow");
  row.innerHTML = SWATCHES.map(
    (c) =>
      `<div class="color-swatch" data-color="${c}" style="background:${c}" title="${c}"></div>`,
  ).join("");
  row.querySelectorAll("[data-color]").forEach((s) =>
    s.addEventListener("click", () => {
      cfg.inkColor = s.dataset.color;
      syncGlobalInputs();
      render();
    }),
  );
}

function syncSwatches(color) {
  document
    .querySelectorAll("#swatchRow [data-color]")
    .forEach((s) =>
      s.classList.toggle("active", s.dataset.color.toLowerCase() === (color || "").toLowerCase()),
    );
}

/* ================================================================
   LAYER LIST
   ================================================================ */
const ICO_EYE_ON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICO_EYE_OFF = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 10.6A3 3 0 0014.8 14.8M9.9 5.2A9.7 9.7 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.8M6.1 6.2A17 17 0 002 12s4 7 10 7a9.6 9.6 0 003.1-.5"/></svg>`;
const ICO_DUP = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></svg>`;
const ICO_DEL = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>`;

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function buildLayerList() {
  const list = document.getElementById("layerList");
  const rv = cfg.ringVisible || {};
  const stampActive = selShape && !selRing ? " active" : "";
  const ringItem = (key, label, thick) => {
    const visible = rv[key] !== false;
    const active = selShape && selRing === key ? " active" : "";
    return `<div class="layer-item layer-item--ring${active}" data-stamp="ring-${key}">
      <span class="layer-vis" data-act="ring-vis" data-ring="${key}" title="Show/hide">${visible ? ICO_EYE_ON : ICO_EYE_OFF}</span>
      <span class="layer-name">${label}</span>
      <span class="layer-tag" style="background:rgba(13,153,255,.18);color:var(--accent-hi)">RING</span>
      <span class="layer-tag" title="Thickness (mm)">${(thick ?? 0).toFixed(1)}</span>
    </div>`;
  };
  let stampHtml = `<div class="layer-item layer-item--stamp${stampActive}" data-stamp="shape">
      <span class="layer-vis" title="Stamp outline">${ICO_EYE_ON}</span>
      <span class="layer-name">Stamp outline (${cfg.shape || "circle"})</span>
      <span class="layer-tag" style="background:rgba(255,180,60,.18);color:#ffb43c">SHAPE</span>
    </div>`;
  stampHtml += ringItem("outer", "Ring 1 · outer", cfg.outerRingThickness);
  if ((cfg.rings || 1) >= 2)
    stampHtml += ringItem("inner", "Ring 2 · middle", cfg.innerRingThickness);
  if ((cfg.rings || 1) >= 3)
    stampHtml += ringItem("inner2", "Ring 3 · inner", cfg.innerRing2Thickness);

  list.innerHTML =
    stampHtml +
    cfg.layers
      .map(
        (l) =>
          `<div class="layer-item${selectedIds.has(l.id) && !selShape ? " active" : ""}" data-id="${l.id}">
      <span class="layer-vis" data-act="vis" title="Show/hide">${l.visible ? ICO_EYE_ON : ICO_EYE_OFF}</span>
      <span class="layer-name" title="Double-click to rename">${escapeHtml(l.name || autoLayerName(l))}</span>
      <span class="layer-tag">${l.type === "shape" ? (l.shapeType || "SHAPE").toUpperCase().slice(0, 4) : l.type === "image" ? "IMG" : l.mode === "curved" ? "ARC" : "LINE"}</span>
      <span class="layer-icon-btn" data-act="dup" title="Duplicate">${ICO_DUP}</span>
      <span class="layer-icon-btn" data-act="del" title="Delete">${ICO_DEL}</span>
    </div>`,
      )
      .join("");

  // Stamp/ring entries — click to open shape or ring editor
  list.querySelectorAll(".layer-item[data-stamp]").forEach((item) => {
    item.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "ring-vis") {
        const key = e.target.closest("[data-ring]").dataset.ring;
        cfg.ringVisible = cfg.ringVisible || {};
        cfg.ringVisible[key] = !(cfg.ringVisible[key] !== false);
        autoHist();
        buildLayerList();
        render();
        return;
      }
      const target = item.dataset.stamp;
      selId = null;
      selectedIds = new Set();
      _showEffects = false;
      selShape = true;
      selRing = target === "shape" ? null : target.replace("ring-", "");
      buildLayerList();
      renderLeftSidebar();
      render();
    });
  });

  list.querySelectorAll(".layer-item:not([data-stamp])").forEach((item) => {
    const id = item.dataset.id;
    item.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;

      // Bulk visibility toggle
      if (act === "vis") {
        if (e.ctrlKey || e.metaKey) {
          multiSelected().forEach((l) => {
            l.visible = !l.visible;
          });
        } else {
          const l = cfg.layers.find((x) => x.id === id);
          if (l) l.visible = !l.visible;
        }
        buildLayerList();
        render();
        return;
      }

      // Duplicate: if multi-selected, dup all selected
      if (act === "dup") {
        autoHist();
        const sel = selectedIds.has(id)
          ? multiSelected()
          : [cfg.layers.find((x) => x.id === id)].filter(Boolean);
        if (sel.length === 0) return;
        const copies = sel.map((l) => {
          const i = cfg.layers.findIndex((x) => x.id === l.id);
          const copy = makeLayer({ ...l, id: uid(), name: (l.name || "Layer") + " copy" });
          cfg.layers.splice(i + 1, 0, copy);
          return copy;
        });
        selId = copies[0].id;
        selectedIds = new Set(copies.map((c) => c.id));
        buildLayerList();
        buildLayerProps();
        render();
        return;
      }

      // Delete: if multi-selected, del all selected
      if (act === "del") {
        autoHist();
        const toDel = selectedIds.has(id)
          ? multiSelected()
          : [cfg.layers.find((x) => x.id === id)].filter(Boolean);
        if (toDel.length >= cfg.layers.length) {
          showToast("Need at least one layer");
          return;
        }
        toDel.forEach((l) => {
          const i = cfg.layers.findIndex((x) => x.id === l.id);
          if (i !== -1) cfg.layers.splice(i, 1);
        });
        selId = cfg.layers[0].id;
        selectedIds = new Set([selId]);
        buildLayerList();
        buildLayerProps();
        render();
        return;
      }

      // Multi-select with Ctrl/Cmd+click
      selShape = false;
      selRing = null;
      if (e.ctrlKey || e.metaKey) {
        if (selectedIds.has(id)) {
          if (selectedIds.size > 1) selectedIds.delete(id);
        } else {
          selectedIds.add(id);
        }
        selId = id;
      } else {
        selectedIds = new Set([id]);
        selId = id;
      }
      buildLayerList();
      buildLayerProps();
      // Make it obvious the editor updated.
      const ls = document.getElementById("toolRailPanel") || document.getElementById("leftSidebar");
      if (ls) {
        ls.classList.remove("flash");
        void ls.offsetWidth;
        ls.classList.add("flash");
      }
    });

    // Double-click the name to rename in place.
    const nameEl = item.querySelector(".layer-name");
    if (nameEl) {
      nameEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        nameEl.contentEditable = "true";
        nameEl.focus();
        document.execCommand("selectAll", false, null);
      });
      const commit = () => {
        nameEl.contentEditable = "false";
        const l = cfg.layers.find((x) => x.id === id);
        if (!l) return;
        const v = (nameEl.textContent || "").trim();
        if (v) {
          l.name = v;
          l._autoName = false;
        } else {
          l.name = autoLayerName(l);
          l._autoName = true;
        }
        buildLayerList();
        renderLeftSidebar();
      };
      nameEl.addEventListener("blur", commit);
      nameEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          nameEl.blur();
        }
        if (e.key === "Escape") {
          nameEl.textContent = cfg.layers.find((x) => x.id === id)?.name || "";
          nameEl.blur();
        }
        e.stopPropagation();
      });
    }
  });
}

/* ================================================================
   LAYER EDITOR
   ================================================================ */
function buildLayerProps() {
  renderLeftSidebar();
}

/* ================================================================
   SYNC ALL
   ================================================================ */
function syncDPI() {
  DPI_CURRENT = cfg.dpi || 300;
  const px = (DPI_CURRENT / 25.4).toFixed(2);
  const el = document.getElementById("exportNote");
  if (el) el.textContent = `${DPI_CURRENT} DPI · 1 mm = ${px} px · print-ready output`;
  if (cfg.dpi !== undefined) {
    document.querySelectorAll('[data-bind="dpi"]').forEach((s) => (s.value = cfg.dpi));
  }
}

function syncAll() {
  syncDPI();
  syncShapeChips();
  syncGlobalInputs(); // sets all data-bind values from cfg
  buildLayerList();
  buildLayerProps();
}

/* ================================================================
   EXPORT
   ================================================================ */
function download(url, filename, revoke) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPNG(whiteBg = false) {
  exporting = true;
  render();
  let src = canvas;
  if (whiteBg) {
    const o = document.createElement("canvas");
    o.width = canvas.width;
    o.height = canvas.height;
    const oc = o.getContext("2d");
    oc.fillStyle = "#fff";
    oc.fillRect(0, 0, o.width, o.height);
    oc.drawImage(canvas, 0, 0);
    src = o;
  }
  download(
    src.toDataURL("image/png"),
    whiteBg ? "stamp-white-300dpi.png" : "stamp-transparent-300dpi.png",
  );
  showToast(whiteBg ? "PNG (white bg) exported" : "PNG (transparent) exported");
  exporting = false;
  render();
}

/* SVG arc path helper */
function arcPathSVG(cx, cy, rx, ry, startDeg, endDeg, flip) {
  let sDeg = startDeg;
  let eDeg = endDeg;
  let sweep = 1;
  if (flip) {
    sDeg = endDeg;
    eDeg = startDeg;
    sweep = 0;
  }
  // Ensure the arc has a meaningful span — clamp to avoid degenerate arcs
  const span = (eDeg - sDeg + 360) % 360 || 360;
  const s = sDeg * DEG,
    e = (sDeg + span) * DEG;
  const x1 = cx + Math.cos(s) * rx,
    y1 = cy + Math.sin(s) * ry;
  const x2 = cx + Math.cos(e) * rx,
    y2 = cy + Math.sin(e) * ry;
  const large = span > 180 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${rx.toFixed(2)},${ry.toFixed(2)},0,${large},${sweep},${x2.toFixed(2)},${y2.toFixed(2)}`;
}

function escXml(s) {
  return String(s).replace(
    /[<>&"']/g,
    (c) => ({ "<": "&#60;", ">": "&#62;", "&": "&#38;", '"': "&#34;", "'": "&#39;" })[c],
  );
}

function exportSVG() {
  const sz = stampSize();
  const pad = cfg.paddingMm;
  const vwMm = sz.w + pad * 2;
  const vhMm = sz.h + pad * 2;
  const wPx = Math.round(mmPx(vwMm));
  const hPx = Math.round(mmPx(vhMm));
  const stampW = mmPx(sz.w),
    stampH = mmPx(sz.h);
  const cx = wPx / 2,
    cy = hPx / 2;
  const offSvgX = mmPx(cfg.shapeOffsetXmm || 0);
  const offSvgY = mmPx(cfg.shapeOffsetYmm || 0);
  const scx = cx + offSvgX,
    scy = cy + offSvgY;
  const rx = stampW / 2,
    ry = stampH / 2;
  const color = cfg.inkColor;
  const op = clamp(cfg.opacity / 100, 0, 1).toFixed(3);
  const insetPx = mmPx(cfg.outerRingThickness + cfg.ringGap);
  const cr = mmPx(cfg.cornerRadius).toFixed(2);
  const rv = cfg.ringVisible || {};

  let shapes = "",
    defs = "",
    texts = "";

  // ── Geometry SVG ──────────────────────────────────────────────
  if (cfg.shape === "rectangle") {
    const o = mmPx(cfg.outerRingThickness);
    shapes += `<rect x="${(scx - rx + o / 2).toFixed(2)}" y="${(scy - ry + o / 2).toFixed(2)}" width="${(stampW - o).toFixed(2)}" height="${(stampH - o).toFixed(2)}" rx="${cr}" fill="none" stroke="${color}" stroke-width="${o.toFixed(2)}" opacity="${op}"/>`;
    if (cfg.rings >= 2 && cfg.innerRingThickness > 0 && rv.inner !== false) {
      const inset = mmPx(cfg.outerRingThickness + cfg.ringGap);
      const il = mmPx(cfg.innerRingThickness);
      const iw = stampW - inset * 2 - il,
        ih = stampH - inset * 2 - il;
      if (iw > 0 && ih > 0) {
        shapes += `<rect x="${(scx - rx + inset + il / 2).toFixed(2)}" y="${(scy - ry + inset + il / 2).toFixed(2)}" width="${iw.toFixed(2)}" height="${ih.toFixed(2)}" rx="${cr}" fill="none" stroke="${color}" stroke-width="${il.toFixed(2)}" opacity="${op}"/>`;
      }
    }
  } else {
    const o = mmPx(cfg.outerRingThickness);
    shapes += `<ellipse cx="${scx}" cy="${scy}" rx="${(rx - o / 2).toFixed(2)}" ry="${(ry - o / 2).toFixed(2)}" fill="none" stroke="${color}" stroke-width="${o.toFixed(2)}" opacity="${op}"/>`;
    if (cfg.rings >= 2 && cfg.innerRingThickness > 0 && rv.inner !== false) {
      const il = mmPx(cfg.innerRingThickness);
      shapes += `<ellipse cx="${scx}" cy="${scy}" rx="${(rx - insetPx - il / 2).toFixed(2)}" ry="${(ry - insetPx - il / 2).toFixed(2)}" fill="none" stroke="${color}" stroke-width="${il.toFixed(2)}" opacity="${op}"/>`;
    }
    if (cfg.rings >= 3 && cfg.innerRing2Thickness > 0 && rv.inner2 !== false) {
      const inset2 = mmPx(
        cfg.outerRingThickness + cfg.ringGap + cfg.innerRingThickness + cfg.ringGap,
      );
      const il2 = mmPx(cfg.innerRing2Thickness);
      shapes += `<ellipse cx="${scx}" cy="${scy}" rx="${(rx - inset2).toFixed(2)}" ry="${(ry - inset2).toFixed(2)}" fill="none" stroke="${color}" stroke-width="${il2.toFixed(2)}" opacity="${op}"/>`;
    }
    if (cfg.centerAreaDiameter > 0) {
      const crd = mmPx(cfg.centerAreaDiameter / 2);
      const ilc = Math.max(mmPx(0.4), mmPx(cfg.innerRingThickness || 0.8));
      shapes += `<circle cx="${scx}" cy="${scy}" r="${crd.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${ilc.toFixed(2)}" opacity="${op}"/>`;
    }
  }

  // ── Text layers SVG ───────────────────────────────────────────
  cfg.layers.forEach((l, i) => {
    if (!l.visible || !l.text.trim()) return;
    const fs = mmPx(l.sizeMm).toFixed(2);
    const dir = layerDir(l);
    // FIX: correct bidi attribute value for SVG
    const bidi = dir === "rtl" ? ' unicode-bidi="bidi-override"' : "";
    const ws = l.wordSpacing ? ` word-spacing="${l.wordSpacing}"` : "";
    const scl =
      l.scaleX !== 1 || l.scaleY !== 1
        ? ` transform="scale(${l.scaleX || 1},${l.scaleY || 1})"`
        : "";
    const common = `font-family="${escXml(l.font)}" font-size="${fs}" font-weight="${safeWeight(l.font, l.weight)}" fill="${color}" opacity="${op}" letter-spacing="${l.letterSpacing}"${ws} direction="${dir}"${bidi}${scl}`;

    if (l.mode === "curved") {
      const pid = "tp" + i;
      let svgRx = mmPx(l.radiusMm),
        svgRy;
      if (cfg.shape === "oval") {
        const svgSz = stampSize();
        const aspect = svgSz.h / svgSz.w;
        svgRy = mmPx(Math.max(2, l.radiusMm * aspect));
      } else {
        svgRy = svgRx;
      }
      defs += `<path id="${pid}" d="${arcPathSVG(scx, scy, svgRx, svgRy, l.startAngle, l.endAngle, l.flip)}" fill="none"/>`;
      texts += `<text ${common}><textPath href="#${pid}" startOffset="50%" text-anchor="middle">${escXml(l.text)}</textPath></text>`;
    } else {
      const tx = (scx + mmPx(l.offsetXmm)).toFixed(2);
      const ty = (scy + mmPx(l.offsetYmm)).toFixed(2);
      texts += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" ${common}>${escXml(l.text)}</text>`;
    }
  });

  const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${vwMm.toFixed(2)}mm" height="${vhMm.toFixed(2)}mm" viewBox="0 0 ${wPx} ${hPx}">
<defs>${defs}</defs>
${shapes}
${texts}
</svg>`;

  download(
    URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml" })),
    "stamp-vector.svg",
    true,
  );
  showToast("SVG exported");
}

function saveConfig() {
  const data = JSON.stringify(cfg, null, 2);
  download(
    URL.createObjectURL(new Blob([data], { type: "application/json" })),
    "stamp-project.json",
    true,
  );
  showToast("Project saved");
}

function loadConfigFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      cfg = buildConfig(data.template || "oval");
      Object.assign(cfg, data);
      DPI_CURRENT = cfg.dpi || 300;
      if (!Array.isArray(cfg.layers) || cfg.layers.length === 0) {
        cfg.layers = defaultLayers();
      }
      cfg.layers = cfg.layers.map((l) => makeLayer(l));
      selId = cfg.layers[0].id;
      selectedIds = new Set([selId]);
      syncAll();
      render();
      pushHistory();
      showToast("Project loaded");
    } catch {
      showToast("Invalid project file");
    }
  };
  r.readAsText(file);
  e.target.value = "";
}

/* ================================================================
   RIGHT PANEL COLLAPSIBLE SECTIONS
   ================================================================ */
function openSection(key) {
  const sec = document.querySelector(`.ts-section:has([data-ts="${key}"])`);
  if (sec) sec.classList.remove("ts-collapsed");
}

function initTabs() {
  // Left sidebar: chevron toggles for sections
  document.querySelectorAll(".ts-chevron").forEach((chevron) => {
    chevron.addEventListener("click", () => {
      const key = chevron.dataset.ts;
      const sec = key ? document.querySelector(`.ts-section:has([data-ts="${key}"])`) : null;
      if (sec) sec.classList.toggle("ts-collapsed");
    });
  });
  // Right panel: accordion headers
  document.querySelectorAll(".tool-rail-panel .rp-section").forEach((sec) => {
    const header = sec.querySelector(".rp-header");
    if (!header) return;
    header.addEventListener("click", () => {
      sec.classList.toggle("rp-open");
    });
  });
}

/* ================================================================
   RING COUNT PILLS
   ================================================================ */
/* ================================================================
   LEFT SIDEBAR SHAPE CHIPS
   ================================================================ */
function initLeftSidebarShapes() {
  document.querySelectorAll("[data-template]").forEach((btn) => {
    btn.addEventListener("click", () => applyTemplate(btn.dataset.template));
  });
}

function syncLeftSidebarShapes() {
  document
    .querySelectorAll("[data-template]")
    .forEach((b) => b.classList.toggle("active", b.dataset.template === cfg.template));
}

/* ── Shared reset helper ────────────────────────────────────────── */
function resetStamp() {
  cfg = buildConfig("oval");
  cfg.seed = Math.floor(Math.random() * 1e6);
  DPI_CURRENT = cfg.dpi || 300;
  selId = cfg.layers[0].id;
  selectedIds = new Set([selId]);
  selShape = false;
  selRing = null;
  guideLines = [];
  Object.keys(imageCache).forEach((k) => delete imageCache[k]);
  syncAll();
  render();
  pushHistory();
}

/* ── Shape picker mini panel ────────────────────────────────────── */
function initShapePicker() {
  const btn = document.getElementById("addShape");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const l = makeLayer({
      name: "Shape",
      text: "★",
      font: "Noto Sans",
      sizeMm: 5,
      mode: "straight",
      offsetXmm: 0,
      offsetYmm: 0,
    });
    cfg.layers.push(l);
    selId = l.id;
    selectedIds = new Set([selId]);
    selShape = false;
    selRing = null;
    pushHistory();
    buildLayerList();
    buildLayerProps();
    render();
    showToast("Shape added");
  });
}

/* ── Import logo ────────────────────────────────────────────────── */
function initImportLogo() {
  const btn = document.getElementById("importLogo");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/svg+xml,image/webp";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const maxMm = 12;
          let w = maxMm,
            h = maxMm;
          if (img.width > img.height) {
            h = maxMm * (img.height / img.width);
          } else {
            w = maxMm * (img.width / img.height);
          }
          const l = makeLayer({
            type: "image",
            name: "Image",
            imageData: ev.target.result,
            imageWidthMm: Math.round(w * 10) / 10,
            imageHeightMm: Math.round(h * 10) / 10,
            offsetXmm: 0,
            offsetYmm: 0,
          });
          cfg.layers.push(l);
          selId = l.id;
          selectedIds = new Set([selId]);
          selShape = false;
          selRing = null;
          pushHistory();
          buildLayerList();
          buildLayerProps();
          render();
          openSection("text");
          showToast("Logo imported");
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

/* ================================================================
   PRESETS — save/load/manage stamp configurations
   ================================================================ */
const PRESETS_KEY = "stampMaker_presets";

function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY)) || [];
  } catch {
    return [];
  }
}

function savePresetsList(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function savePreset(name) {
  const presets = loadPresets();
  presets.push({ name, config: JSON.parse(JSON.stringify(cfg)), date: Date.now() });
  savePresetsList(presets);
  renderPresetsList();
  showToast("Preset saved: " + name);
}

function loadPreset(index) {
  const presets = loadPresets();
  if (!presets[index]) return;
  const p = presets[index];
  cfg = JSON.parse(JSON.stringify(p.config));
  cfg.seed = cfg.seed || Math.floor(Math.random() * 1e6);
  DPI_CURRENT = cfg.dpi || 300;
  selId = cfg.layers[0]?.id || null;
  selectedIds = selId ? new Set([selId]) : new Set();
  selShape = false;
  selRing = null;
  syncAll();
  render();
  pushHistory();
  showToast("Loaded: " + p.name);
}

function deletePreset(index) {
  const presets = loadPresets();
  const name = presets[index]?.name || "?";
  presets.splice(index, 1);
  savePresetsList(presets);
  renderPresetsList();
  showToast("Deleted: " + name);
}

function renderPresetsList() {
  const list = document.getElementById("presetsList");
  if (!list) return;
  const presets = loadPresets();
  if (presets.length === 0) {
    list.innerHTML =
      '<div class="tb-preset-item" style="color:var(--text-dim);cursor:default;opacity:.6">No presets saved yet</div>';
    return;
  }
  list.innerHTML = presets
    .map(
      (p, i) =>
        `<div class="tb-preset-item tb-preset-saved" data-pi="${i}">
      <span class="tb-preset-name">${escapeHtml(p.name)}</span>
      <span class="tb-preset-delete" data-del="${i}" title="Delete">&times;</span>
    </div>`,
    )
    .join("");
  list.querySelectorAll(".tb-preset-saved").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("tb-preset-delete")) {
        e.stopPropagation();
        deletePreset(parseInt(e.target.dataset.del));
        return;
      }
      loadPreset(parseInt(el.dataset.pi));
      closePresetsMenu();
    });
  });
}

function initPresets() {
  const dropdown = document.getElementById("presetsDropdown");
  const menu = document.getElementById("presetsMenu");
  if (!dropdown || !menu) return;

  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.style.display !== "none";
    menu.style.display = open ? "none" : "block";
    dropdown.classList.toggle("open", !open);
    if (!open) renderPresetsList();
  });

  // Save action
  const saveEl = menu.querySelector('[data-action="save"]');
  if (saveEl)
    saveEl.addEventListener("click", () => {
      const name = prompt("Preset name:", cfg.template + " preset");
      if (name && name.trim()) {
        savePreset(name.trim());
        menu.style.display = "none";
        dropdown.classList.remove("open");
      }
    });

  // Export Config
  const exportConfigEl = menu.querySelector('[data-action="exportConfig"]');
  if (exportConfigEl)
    exportConfigEl.addEventListener("click", () => {
      exportConfigJSON();
      menu.style.display = "none";
      dropdown.classList.remove("open");
    });

  // Import Config
  const importConfigEl = menu.querySelector('[data-action="importConfig"]');
  const importFile = document.getElementById("importConfigFile");
  if (importConfigEl)
    importConfigEl.addEventListener("click", () => {
      importFile?.click();
      menu.style.display = "none";
      dropdown.classList.remove("open");
    });
  if (importFile)
    importFile.addEventListener("change", (e) => {
      if (e.target.files[0]) importConfigJSON(e.target.files[0]);
      e.target.value = "";
    });

  // Close on outside click
  document.addEventListener("click", () => {
    menu.style.display = "none";
    dropdown.classList.remove("open");
  });
  menu.addEventListener("click", (e) => e.stopPropagation());
}

function closePresetsMenu() {
  const menu = document.getElementById("presetsMenu");
  const dropdown = document.getElementById("presetsDropdown");
  if (menu) menu.style.display = "none";
  if (dropdown) dropdown.classList.remove("open");
}

function initExportDropdown() {
  const dropdown = document.getElementById("exportDropdown");
  const menu = document.getElementById("exportMenu");
  if (!dropdown || !menu) return;

  const closeMenu = () => {
    menu.style.display = "none";
    dropdown.classList.remove("open");
  };

  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.style.display !== "none";
    menu.style.display = open ? "none" : "block";
    dropdown.classList.toggle("open", !open);
    if (!open) renderPresetsList();
  });

  const bind = (action, fn) => {
    const el = menu.querySelector(`[data-action="${action}"]`);
    if (el)
      el.addEventListener("click", () => {
        fn();
        closeMenu();
      });
  };

  bind("saveProject", () => {
    saveState();
    showToast("Saved");
  });
  bind("save", () => {
    const name = prompt("Preset name:", cfg.template + " preset");
    if (name && name.trim()) savePreset(name.trim());
  });
  bind("exportConfig", () => exportConfigJSON());
  bind("importConfig", () => document.getElementById("importConfigFile")?.click());
  bind("manage", () => {
    /* future: manage dialog */ showToast("Use the × on each preset to delete");
  });
  bind("pngTransparent", () => exportPNG(false));
  bind("pngWhite", () => exportPNG(true));
  bind("svgExport", () => exportSVG());

  const importFile = document.getElementById("importConfigFile");
  if (importFile && !importFile._wired) {
    importFile._wired = true;
    importFile.addEventListener("change", (e) => {
      if (e.target.files[0]) importConfigJSON(e.target.files[0]);
      e.target.value = "";
    });
  }

  document.addEventListener("click", closeMenu);
  menu.addEventListener("click", (e) => e.stopPropagation());
}

/* ================================================================
   CONFIG EXPORT / IMPORT (JSON)
   ================================================================ */
function exportConfigJSON() {
  const data = JSON.stringify(cfg, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stamp-${cfg.template}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Config exported");
}

function importConfigJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.template || !imported.layers) throw new Error("Invalid config");
      cfg = imported;
      cfg.seed = cfg.seed || Math.floor(Math.random() * 1e6);
      DPI_CURRENT = cfg.dpi || 300;
      selId = cfg.layers[0]?.id || null;
      selectedIds = selId ? new Set([selId]) : new Set();
      selShape = false;
      selRing = null;
      syncAll();
      render();
      pushHistory();
      showToast("Config imported: " + cfg.template);
    } catch (err) {
      showToast("Import failed: " + err.message);
    }
  };
  reader.readAsText(file);
}

function initConfigActions() {
  // Config export/import now handled via presets menu
}

/* ================================================================
   AUTO-ALIGN — auto-position text after paste/type
   ================================================================ */
function autoAlignLayer(l) {
  if (!l) return;
  if (l.mode === "curved") {
    const isBottom = l.flip;
    if (isBottom) {
      l.startAngle = 200;
      l.endAngle = 340;
    } else {
      l.startAngle = 200;
      l.endAngle = 340;
    }
    l.radiusMm = stampSize().w * 0.38;
  } else {
    l.offsetXmm = 0;
    l.offsetYmm = l.offsetYmm || 0;
  }
}

function initAutoAlign() {
  // When text content changes via paste, auto-align if it's the first text
  document.addEventListener("paste", (e) => {
    const active = document.activeElement;
    if (!active || active.tagName !== "TEXTAREA" || !active.dataset.layer) return;
    const l = selLayer();
    if (!l) return;
    // Check if the text was default "NEW TEXT"
    if (l.text === "NEW TEXT" || l.text === "") {
      setTimeout(() => {
        autoAlignLayer(l);
        renderLeftSidebar();
        render();
      }, 10);
    }
  });
}

/* ================================================================
   CUSTOM NUMBER INPUT — +/- arrows + mouse wheel
   ================================================================ */
const ARROW_UP =
  '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 2v6M2.5 4.5L5 2l2.5 2.5"/></svg>';
const ARROW_DN =
  '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 2v6M2.5 5.5L5 8l2.5-2.5"/></svg>';

function initNumberInputs(root) {
  root.querySelectorAll('input[type="number"]:not(.num-ready)').forEach((input) => {
    input.classList.add("num-ready");

    // Skip if already wrapped
    if (input.parentElement.classList.contains("num-wrap")) return;

    // Wheel support
    input.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const step = parseFloat(input.step) || 1;
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);
        let v = parseFloat(input.value) || 0;
        v += e.deltaY < 0 ? step : -step;
        if (!isNaN(min)) v = Math.max(min, v);
        if (!isNaN(max)) v = Math.min(max, v);
        // Snap to step precision
        const dec = (step.toString().split(".")[1] || "").length;
        v = parseFloat(v.toFixed(dec));
        input.value = v;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { passive: false },
    );

    // Wrap with +/- arrows
    const wrap = document.createElement("div");
    wrap.className = "num-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const arrows = document.createElement("div");
    arrows.className = "num-arrows";

    const btnUp = document.createElement("button");
    btnUp.className = "num-arrow";
    btnUp.innerHTML = ARROW_UP;
    btnUp.tabIndex = -1;
    btnUp.type = "button";

    const btnDn = document.createElement("button");
    btnDn.className = "num-arrow";
    btnDn.innerHTML = ARROW_DN;
    btnDn.tabIndex = -1;
    btnDn.type = "button";

    const stepNum = () => parseFloat(input.step) || 1;
    const clamp = (v) => {
      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      if (!isNaN(min)) v = Math.max(min, v);
      if (!isNaN(max)) v = Math.min(max, v);
      return v;
    };
    const snap = (v) => {
      const dec = (input.step || "1").toString().split(".")[1]?.length || 0;
      return parseFloat(v.toFixed(dec));
    };

    // Hold-to-repeat
    let holdTimer = null,
      holdInterval = null;
    const startHold = (dir) => {
      const tick = () => {
        let v = parseFloat(input.value) || 0;
        v = snap(clamp(v + dir * stepNum()));
        input.value = v;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      tick();
      holdTimer = setTimeout(() => {
        holdInterval = setInterval(tick, 50);
      }, 400);
    };
    const stopHold = () => {
      clearTimeout(holdTimer);
      clearInterval(holdInterval);
      holdTimer = holdInterval = null;
    };

    btnUp.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startHold(1);
    });
    btnDn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startHold(-1);
    });
    btnUp.addEventListener("mouseup", stopHold);
    btnDn.addEventListener("mouseup", stopHold);
    btnUp.addEventListener("mouseleave", stopHold);
    btnDn.addEventListener("mouseleave", stopHold);
    btnUp.addEventListener("click", (e) => e.preventDefault());
    btnDn.addEventListener("click", (e) => e.preventDefault());

    arrows.appendChild(btnUp);
    arrows.appendChild(btnDn);
    wrap.appendChild(arrows);
  });
}

/* ================================================================
   SHAPE ZONE — click/drag shapes from sidebar to add to stamp
   ================================================================ */
const SHAPE_SYMBOLS = {
  star: "★",
  pentagon: "⬠",
  hexagon: "⬡",
  diamond: "◆",
  cross: "✚",
  circle: "●",
};

function initShapeZone() {
  const grid = document.getElementById("lsShapeGrid");
  if (!grid) return;

  // Click to add shape
  grid.querySelectorAll("[data-add-shape]").forEach((item) => {
    item.addEventListener("click", () => {
      const type = item.dataset.addShape;
      const sym = SHAPE_SYMBOLS[type] || "●";
      const l = makeLayer({
        name: "Shape",
        text: sym,
        font: "Noto Sans",
        sizeMm: 5,
        mode: "straight",
        offsetXmm: 0,
        offsetYmm: 0,
      });
      cfg.layers.push(l);
      selId = l.id;
      selectedIds = new Set([selId]);
      selShape = false;
      selRing = null;
      pushHistory();
      buildLayerList();
      buildLayerProps();
      render();
      showToast("Shape added: " + type);
    });

    // Drag support
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", item.dataset.addShape);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
  });

  // Drop on canvas
  const viewport = document.getElementById("viewport");
  if (!viewport) return;
  viewport.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  viewport.addEventListener("drop", (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/plain");
    if (!type || !SHAPE_SYMBOLS[type]) return;
    const sym = SHAPE_SYMBOLS[type];
    // Convert drop position to mm coordinates
    const rect = viewport.getBoundingClientRect();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const dxMm =
      ((e.clientX - rect.left - rect.width / 2) * (canvas.width / rect.width)) /
      (DPI_CURRENT / 25.4);
    const dyMm =
      ((e.clientY - rect.top - rect.height / 2) * (canvas.height / rect.height)) /
      (DPI_CURRENT / 25.4);
    const l = makeLayer({
      name: "Shape",
      text: sym,
      font: "Noto Sans",
      sizeMm: 5,
      mode: "straight",
      offsetXmm: Math.round(dxMm * 10) / 10,
      offsetYmm: Math.round(dyMm * 10) / 10,
    });
    cfg.layers.push(l);
    selId = l.id;
    selectedIds = new Set([selId]);
    selShape = false;
    selRing = null;
    pushHistory();
    buildLayerList();
    buildLayerProps();
    render();
    showToast("Shape dropped: " + type);
  });
}

/* ================================================================
   SIDEBAR RESIZE — removed (panel has fixed width now)
   ================================================================ */
function initSidebarResize() {
  /* no-op — sidebar resize handle removed */
}

/* Removed auto-fit on resize — canvas stays at user's zoom/pan position */

/* ================================================================
   INIT
   ================================================================ */
function init() {
  // Restore saved state from localStorage
  const loaded = loadState();

  // Build UI
  initTabs();
  buildSwatches();
  bindGlobalInputs(document);
  initLeftSidebarShapes();
  initShapePicker();
  initImportLogo();
  initNumberInputs(document);
  initPresets();
  initConfigActions();
  initAutoAlign();
  initShapeZone();
  initSidebarResize();
  if (loaded) {
    buildLayerList();
    buildLayerProps();
    syncGlobalInputs();
    render();
    updateTransform();
    pushHistory();
  } else {
    buildLayerList();
    buildLayerProps();
    syncGlobalInputs();
  }

  /* Layer controls */
  document.getElementById("addCurved").addEventListener("click", () => {
    const l = makeLayer({ name: "NEW TEXT", text: "NEW TEXT", mode: "curved" });
    cfg.layers.push(l);
    selId = l.id;
    selectedIds = new Set([selId]);
    pushHistory();
    buildLayerList();
    buildLayerProps();
    render();
    openSection("text");
  });

  document.getElementById("addLine").addEventListener("click", () => {
    const l = makeLayer({ name: "NEW TEXT", text: "NEW TEXT", mode: "straight", offsetYmm: 6 });
    cfg.layers.push(l);
    selId = l.id;
    selectedIds = new Set([selId]);
    pushHistory();
    buildLayerList();
    buildLayerProps();
    render();
    openSection("text");
  });

  /* Export — most items are inside the dropdown (wired by initExportDropdown).
     Guard the direct-ID lookups so missing legacy buttons don't crash init. */
  const _on = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  };
  _on("pngTransparent", "click", () => exportPNG(false));
  _on("pngWhite", "click", () => exportPNG(true));
  initExportDropdown();
  _on("svgExport", "click", exportSVG);
  _on("saveConfig", "click", saveConfig);
  _on("loadConfig", "click", () => {
    const f = document.getElementById("loadConfigFile");
    if (f) f.click();
  });
  _on("loadConfigFile", "change", loadConfigFile);

  /* Alignment */
  document.querySelectorAll("[data-align]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const align = btn.dataset.align;
      const layers = multiSelected();
      if (layers.length === 0 && !selShape) {
        showToast("Select a layer to align");
        return;
      }
      if (layers.length === 0) return;

      const sz = stampSize();
      const hw = sz.w / 2,
        hh = sz.h / 2;
      guideLines = [];

      layers.forEach((l) => {
        if (l.mode === "straight") {
          if (align === "left") {
            l.offsetXmm = -hw + l.sizeMm * 0.3;
            guideLines.push({ type: "v", mm: -hw });
          }
          if (align === "centerH") {
            l.offsetXmm = 0;
            guideLines.push({ type: "v", mm: 0 });
          }
          if (align === "right") {
            l.offsetXmm = hw - l.sizeMm * 0.3;
            guideLines.push({ type: "v", mm: hw });
          }
          if (align === "top") {
            l.offsetYmm = -hh + l.sizeMm * 0.3;
            guideLines.push({ type: "h", mm: -hh });
          }
          if (align === "centerV") {
            l.offsetYmm = 0;
            guideLines.push({ type: "h", mm: 0 });
          }
          if (align === "bottom") {
            l.offsetYmm = hh - l.sizeMm * 0.3;
            guideLines.push({ type: "h", mm: hh });
          }
        } else if (l.mode === "curved") {
          if (align === "centerH") {
            const span = l.endAngle - l.startAngle;
            l.startAngle = 90 - span / 2;
            l.endAngle = 90 + span / 2;
            guideLines.push({ type: "v", mm: 0 });
          }
          if (align === "left") {
            const span = l.endAngle - l.startAngle;
            l.startAngle = 180 - span / 2;
            l.endAngle = 180 + span / 2;
            guideLines.push({ type: "v", mm: -hw });
          }
          if (align === "right") {
            const span = l.endAngle - l.startAngle;
            l.startAngle = 0 - span / 2;
            l.endAngle = 0 + span / 2;
            guideLines.push({ type: "v", mm: hw });
          }
          if (align === "centerV") {
            l.radiusMm = ((hw + hh) / 2) * 0.7;
            guideLines.push({ type: "h", mm: 0 });
          }
        }
      });

      if (align === "distributeV") {
        const straight = layers.filter((l) => l.mode === "straight");
        if (straight.length < 2) {
          showToast("Need 2+ straight layers");
          return;
        }
        const sorted = straight.sort((a, b) => a.offsetYmm - b.offsetYmm);
        const minY = sorted[0].offsetYmm;
        const maxY = sorted[sorted.length - 1].offsetYmm;
        const step = (maxY - minY) / (sorted.length - 1) || 0;
        sorted.forEach((l, i) => {
          l.offsetYmm = minY + step * i;
        });
      }

      autoHist();
      buildLayerProps();
      render();
      showGuideLines();
      const names = {
        left: "Align left",
        right: "Align right",
        top: "Align top",
        bottom: "Align bottom",
        centerH: "Center horizontal",
        centerV: "Center vertical",
        distributeV: "Distribute vertically",
      };
      showToast(names[align] || align);
    });
  });

  /* Guide lines fade-out animation */
  function showGuideLines() {
    clearTimeout(showGuideLines._t);
    render();
    guideLines = [];
    showGuideLines._t = setTimeout(() => render(), 1200);
  }

  /* Undo / Redo / Reset */
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);
  document.getElementById("resetBtn").addEventListener("click", () => {
    resetStamp();
    showToast("Stamp reset to defaults");
  });

  /* Zoom controls */
  document.getElementById("zoomIn").addEventListener("click", () => setZoom(cfg.editorZoom * 1.2));
  document.getElementById("zoomOut").addEventListener("click", () => setZoom(cfg.editorZoom / 1.2));
  document.getElementById("zoom100").addEventListener("click", () => setZoom(1, true));
  document.getElementById("zoomFit").addEventListener("click", fitView);
  document.getElementById("zoomReset")?.addEventListener("click", resetView);
  document.getElementById("zoomDouble")?.addEventListener("click", () => setZoom(2, true));
  document.getElementById("zoomHalf")?.addEventListener("click", () => setZoom(0.5, true));

  /* Save button */
  document.getElementById("saveBtn").addEventListener("click", () => {
    saveState();
    showToast("Saved");
  });

  /* Pan/zoom */
  bindPanZoom();

  /* Shortcuts modal */
  document.getElementById("helpBtn").addEventListener("click", toggleShortcuts);
  document.getElementById("shortcutsClose").addEventListener("click", toggleShortcuts);
  document.getElementById("shortcutsOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) toggleShortcuts();
  });

  /* Guide toggle */
  document.getElementById("showGuides").addEventListener("change", () => render());

  /* Sidebar collapse toggle */
  const workArea = document.querySelector(".work-area");
  const sbToggle = document.getElementById("sidebarToggle");
  const SB_KEY = "stamp.sidebarCollapsed";
  const applySidebar = (collapsed) => {
    workArea.classList.toggle("sidebar-collapsed", collapsed);
    sbToggle.setAttribute("aria-pressed", String(!collapsed));
    try {
      localStorage.setItem(SB_KEY, collapsed ? "1" : "0");
    } catch {}
  };
  // Default: collapsed on small screens
  let sbStart = false;
  try {
    sbStart = localStorage.getItem(SB_KEY) === "1";
  } catch {}
  if (window.innerWidth <= 720 && localStorage.getItem(SB_KEY) === null) sbStart = true;
  applySidebar(sbStart);
  sbToggle.addEventListener("click", () => {
    applySidebar(!workArea.classList.contains("sidebar-collapsed"));
  });
  // Keyboard shortcut: [
  window.addEventListener("keydown", (e) => {
    if (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      applySidebar(!workArea.classList.contains("sidebar-collapsed"));
    }
  });

  /* Right editor panel toggle */
  const rightPanel = document.getElementById("rightEditorPanel");
  const rpToggle = document.getElementById("rightPanelToggle");
  const rpClose = document.getElementById("rightPanelClose");
  const RP_KEY = "stamp.rightPanelCollapsed";
  const applyRightPanel = (collapsed) => {
    rightPanel.classList.toggle("rep-collapsed", collapsed);
    if (rpToggle) rpToggle.setAttribute("aria-pressed", String(!collapsed));
    try {
      localStorage.setItem(RP_KEY, collapsed ? "1" : "0");
    } catch {}
  };
  let rpStart = false;
  try {
    rpStart = localStorage.getItem(RP_KEY) === "1";
  } catch {}
  applyRightPanel(rpStart);
  if (rpToggle)
    rpToggle.addEventListener("click", () => {
      applyRightPanel(!rightPanel.classList.contains("rep-collapsed"));
    });
  if (rpClose)
    rpClose.addEventListener("click", () => {
      applyRightPanel(true);
    });
  window.addEventListener("keydown", (e) => {
    if (e.key === "]" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      applyRightPanel(!rightPanel.classList.contains("rep-collapsed"));
    }
  });

  /* Topbar effect toggles — open effects panel on click */
  document.querySelectorAll(".tb-eff-toggle input[type=checkbox]").forEach((cb) => {
    const key = cb.dataset.eff;
    if (key && cfg[key] !== undefined) cb.checked = Boolean(cfg[key]);
    cb.addEventListener("change", () => {
      const k = cb.dataset.eff;
      if (k) {
        cfg[k] = cb.checked;
      }
      _showEffects = true;
      renderLeftSidebar();
      renderD();
    });
  });

  /* Color combo: click hex text → open picker, picker change → update hex text */
  const hexEl = document.getElementById("inkColorHex");
  const pickerEl = document.getElementById("inkColorPicker");
  if (hexEl && pickerEl) {
    hexEl.addEventListener("click", () => pickerEl.click());
    pickerEl.addEventListener("input", () => {
      const v = pickerEl.value;
      cfg.inkColor = v;
      hexEl.textContent = v;
      syncSwatches(v);
      renderD();
    });
  }

  /* Initial render — always render first so canvas dimensions are correct */
  render();
  if (!loaded) {
    setZoom(0.75, true);
    pushHistory();
  } else {
    updateTransform();
  }
  document.fonts.ready.then(() => {
    render();
  });
}

init();

/* ── Draggable floating Editor panel ─────────────────────────── */
(function enableEditorPanelDrag() {
  const panel = document.getElementById("rightEditorPanel");
  if (!panel) return;
  const header = panel.querySelector(".rep-header");
  if (!header) return;

  const STORAGE = "stamp.editorPanelPos";
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
      applyPos(saved.left, saved.top);
    }
  } catch (_) {}

  function applyPos(left, top) {
    const parent = panel.parentElement;
    const pr = parent.getBoundingClientRect();
    const w = panel.offsetWidth || 248;
    const h = panel.offsetHeight || 300;
    left = Math.max(0, Math.min(left, pr.width - Math.min(w, pr.width)));
    top = Math.max(0, Math.min(top, pr.height - Math.min(40, pr.height)));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  let dragging = false,
    sx = 0,
    sy = 0,
    ox = 0,
    oy = 0;

  header.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".rep-close")) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const parent = panel.parentElement;
    const pr = parent.getBoundingClientRect();
    const r = panel.getBoundingClientRect();
    ox = r.left - pr.left;
    oy = r.top - pr.top;
    sx = e.clientX;
    sy = e.clientY;
    dragging = true;
    panel.classList.add("rep-dragging");
    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  header.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    applyPos(ox + (e.clientX - sx), oy + (e.clientY - sy));
  });

  function end(e) {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("rep-dragging");
    try {
      header.releasePointerCapture(e.pointerId);
    } catch (_) {}
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({
          left: parseFloat(panel.style.left) || 0,
          top: parseFloat(panel.style.top) || 0,
        }),
      );
    } catch (_) {}
  }
  header.addEventListener("pointerup", end);
  header.addEventListener("pointercancel", end);

  window.addEventListener("resize", () => {
    if (panel.style.left) applyPos(parseFloat(panel.style.left), parseFloat(panel.style.top));
  });
})();
