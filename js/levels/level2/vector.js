// Level 2 - Game B: "Shape Type" (vector curve adjustment).
//
// Every round generates a RANDOM target curve: a cubic Bézier (S or C shaped)
// with random end points and TWO control points ("puntos de fuga" / handles, as
// in a vector editor). The dotted guide shows the target shape; the player's
// curve starts with both control points displaced to random positions and must
// be fixed by dragging the two red nodes onto their targets.
//
// Precision: each node is scored against its own target with a tolerance scaled
// to the canvas (~8% of the shorter side, DESIGN.md section 9 #3); the round's
// precision is that of the WORST node, so both have to be placed. A node turns
// green once it is within the required precision. The level is passed when a
// drag ends with every node >= 85%.
import { $, toast, vibrate } from "../../ui.js";

const TARGET_PRECISION = 85;
export const NODES = 2; // control points of the cubic Bézier
const HIT_RADIUS = 30; // px: touch area around a node
const MIN_START_DIST = 0.3; // normalised distance between a node's start and its target

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

// Distance from point p to the line through a and b (normalised units).
function distToLine(p, a, b) {
  const len = dist(a, b) || 1;
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
}

// Random target shape: start on the left, end on the right, control points in
// the left / right halves. "S" puts them on opposite sides of the start-end
// line, "C" on the same side. Retried until the curve is clearly bent and the
// two control points are well apart, so it never degenerates into a line.
export function generateShape() {
  for (;;) {
    const start = { x: rand(0.08, 0.22), y: rand(0.25, 0.85) };
    const end = { x: rand(0.78, 0.92), y: rand(0.15, 0.75) };
    const cps = [
      { x: rand(0.22, 0.5), y: rand(0.08, 0.92) },
      { x: rand(0.5, 0.78), y: rand(0.08, 0.92) }
    ];
    const bent = cps.every((c) => distToLine(c, start, end) > 0.18);
    const apart = dist(cps[0], cps[1]) > 0.3;
    if (bent && apart) return { start, end, targets: cps };
  }
}

// Random starting positions for the draggable nodes: far from their own target
// and not on top of each other.
export function displacedNodes(targets) {
  for (;;) {
    const nodes = targets.map(() => ({ x: rand(0.08, 0.92), y: rand(0.08, 0.92) }));
    const far = nodes.every((n, i) => dist(n, targets[i]) > MIN_START_DIST);
    const apart = dist(nodes[0], nodes[1]) > 0.15;
    if (far && apart) return nodes;
  }
}

export function initVector({ onComplete }) {
  const canvas = $("#vector-canvas");
  const precisionEl = $("#vector-precision");
  const msgEl = $("#vector-msg");
  const ctx = canvas.getContext("2d");

  const size = { w: 0, h: 0, dpr: 1 };
  let shape = generateShape();
  let nodes = displacedNodes(shape.targets);
  let dragging = -1; // index of the node being dragged
  let finished = false;

  const clamp = (v) => Math.min(0.97, Math.max(0.03, v));
  const toPx = (p) => ({ x: p.x * size.w, y: p.y * size.h });
  const tolerance = () => 0.08 * Math.min(size.w, size.h);

  function nodePrecision(i) {
    if (tolerance() <= 0) return 0;
    const d = dist(toPx(nodes[i]), toPx(shape.targets[i]));
    return Math.max(0, Math.round(100 - (d / tolerance()) * 100));
  }

  const precisions = () => nodes.map((_, i) => nodePrecision(i));
  const precision = () => Math.min(...precisions());

  function updateReadout() {
    const ps = precisions();
    precisionEl.textContent = String(Math.min(...ps));
    if (finished) return;
    msgEl.textContent = ps
      .map((p, i) => `Punto ${i + 1}: ${p >= TARGET_PRECISION ? "✔" : p + "%"}`)
      .join(" · ");
  }

  function drawCubic(cps, { dotted = false, color, glow = false, width = 4 }) {
    const A = toPx(shape.start);
    const B = toPx(shape.end);
    const C1 = toPx(cps[0]);
    const C2 = toPx(cps[1]);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.bezierCurveTo(C1.x, C1.y, C2.x, C2.y, B.x, B.y);
    ctx.lineWidth = glow ? width + 2 : width;
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    if (glow) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = color;
    }
    if (dotted) ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.restore();
  }

  // Handle lines: start -> node 1 and end -> node 2, like a vector editor.
  function drawHandles(cps, color, dashed) {
    const ends = [toPx(shape.start), toPx(shape.end)];
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    if (dashed) ctx.setLineDash([4, 6]);
    cps.forEach((c, i) => {
      const p = toPx(c);
      ctx.beginPath();
      ctx.moveTo(ends[i].x, ends[i].y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, size.w, size.h);

    // Target silhouette (dotted guide) with its handles and faint target markers.
    drawHandles(shape.targets, "rgba(100, 116, 139, 0.45)", true);
    drawCubic(shape.targets, { dotted: true, color: "#64748b" });
    if (!finished) {
      shape.targets.forEach((t) => {
        const p = toPx(t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
        ctx.fill();
      });
    }

    // Current curve with its handles.
    const color = finished ? "#22c55e" : "#2563eb";
    drawHandles(nodes, "rgba(147, 197, 253, 0.7)", false);
    drawCubic(nodes, { color, glow: finished });

    // Fixed end points (anchors).
    [shape.start, shape.end].forEach((a) => {
      const p = toPx(a);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
    });

    // Draggable control points ("puntos de fuga"): red until placed, then green.
    const ps = precisions();
    nodes.forEach((n, i) => {
      const p = toPx(n);
      const ok = finished || ps[i] >= TARGET_PRECISION;
      ctx.beginPath();
      ctx.arc(p.x, p.y, dragging === i ? 15 : 12, 0, Math.PI * 2);
      ctx.fillStyle = ok ? "#22c55e" : "#ef4444";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), p.x, p.y + 0.5);
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    size.w = rect.width;
    size.h = rect.height;
    size.dpr = dpr;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateReadout();
    draw();
  }

  // New random curve and new displaced nodes (each round / coordinator reset).
  function restart() {
    finished = false;
    dragging = -1;
    shape = generateShape();
    nodes = displacedNodes(shape.targets);
    updateReadout();
    draw();
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Index of the node under the pointer (closest one within the touch radius).
  function nodeAt(p) {
    let best = -1;
    let bestD = HIT_RADIUS;
    nodes.forEach((n, i) => {
      const d = dist(p, toPx(n));
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  function onDown(e) {
    if (finished) return;
    const i = nodeAt(pointerPos(e));
    if (i === -1) return;
    dragging = i;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    vibrate(8);
    draw();
  }

  function onMove(e) {
    if (dragging === -1 || finished) return;
    const p = pointerPos(e);
    nodes[dragging] = { x: clamp(p.x / size.w), y: clamp(p.y / size.h) };
    updateReadout();
    draw();
  }

  function onUp() {
    if (dragging === -1 || finished) return;
    dragging = -1;
    const p = precision();
    if (p >= TARGET_PRECISION) win(p);
    else draw();
  }

  function win(p) {
    finished = true;
    nodes = shape.targets.map((t) => ({ ...t }));
    precisionEl.textContent = String(p);
    msgEl.textContent = "¡Curva reconstruida! ✨";
    draw();
    vibrate([30, 50, 30]);
    toast("¡Curva reconstruida! ✨", "success");
    onComplete && onComplete({ precision: p });
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }

  // Initial sizing. The screen is already visible when this runs (the player
  // controller shows it before initialising), so the canvas has a real size.
  // ResizeObserver keeps it correct on rotation / resize afterwards.
  resize();

  // Key live data for the coordinator's monitor (js/monitor.js).
  function snapshot() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const pt = (p) => ({ x: r(p.x), y: r(p.y) });
    return {
      precision: finished ? Number(precisionEl.textContent) : precision(),
      points: precisions(),
      finished,
      aspect: size.h ? r(size.w / size.h) : 1,
      start: pt(shape.start),
      end: pt(shape.end),
      targets: shape.targets.map(pt),
      nodes: nodes.map(pt)
    };
  }

  return { restart, snapshot };
}
