// Level 4 - "Color" (graphic design: colour matching), inspired by
// color.method.ac. Every player plays it (the group is not split).
//
// Six stages, in order: HUE, SATURATION, COMPLEMENTARY, ANALOGOUS, TRIADIC,
// TETRADIC. Each stage shows a colour in the centre of a colour wheel; the
// player drags on the wheel to pick a colour (shown in the ring around the
// centre) and presses "Confirmar":
//   - HUE: the same hue as the centre colour.
//   - SATURATION: the wheel turns into one hue going from grey to vivid; pick
//     the centre colour's saturation.
//   - COMPLEMENTARY / ANALOGOUS / TRIADIC / TETRADIC: the colour at +180° /
//     +30° / +120° / +90° (clockwise) from the centre colour; a small scheme
//     diagram shows where it is.
// A confirmation is graded (Perfecto / Muy bien / Bien / Regular / Mal); "Bien"
// or better passes the stage. Every stage round has a timer: when it runs out a
// NEW colour is generated for the same stage, until the six stages are matched.
import { $, vibrate } from "../../ui.js";

export const ROUND_SECONDS = 20;
const L = 50; // lightness of every colour (pure, vivid colours)

// offset: target hue relative to the given colour (null = saturation stage).
export const STAGES = [
  { key: "hue", name: "HUE", offset: 0, help: "Encontrá el mismo tono (hue) que el color del centro." },
  { key: "saturation", name: "SATURATION", offset: null, help: "Mismo tono: encontrá la saturación del centro (de gris a vivo)." },
  { key: "complementary", name: "COMPLEMENTARY", offset: 180, help: "Elegí el complementario: el color opuesto en la rueda (180°)." },
  { key: "analogous", name: "ANALOGOUS", offset: 30, help: "Elegí el análogo: el vecino a 30° en sentido horario." },
  { key: "triadic", name: "TRIADIC", offset: 120, help: "Elegí el triádico: el color a 120° en sentido horario." },
  { key: "tetradic", name: "TETRADIC", offset: 90, help: "Elegí el tetrádico (cuadrado): el color a 90° en sentido horario." }
];

// Grades by error (degrees of hue, or saturation points). Index <= PASS passes.
const GRADES = ["Perfecto", "Muy bien", "Bien", "Regular", "Mal"];
const HUE_LIMITS = [6, 12, 20, 35];
const SAT_LIMITS = [5, 10, 15, 25];
const PASS = 2; // "Bien" or better

const hsl = (h, s) => `hsl(${Math.round(h)}, ${Math.round(s)}%, ${L}%)`;
export const hueDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export function gradeOf(error, isSat) {
  const limits = isSat ? SAT_LIMITS : HUE_LIMITS;
  const i = limits.findIndex((l) => error <= l);
  return i === -1 ? GRADES.length - 1 : i;
}

export function initColor({ onComplete } = {}) {
  const wheel = $("#cw-wheel");
  const pickRing = $("#cw-pick");
  const centre = $("#cw-centre");
  const knob = $("#cw-knob");
  const timerArc = $("#cw-timer-arc");
  const timeEl = $("#cw-time");
  const stageEl = $("#cw-stage");
  const helpEl = $("#cw-help");
  const schemeEl = $("#cw-scheme");
  const msgEl = $("#cw-msg");
  const stepsEl = $("#cw-steps");
  const confirmBtn = $("#cw-confirm");

  const st = {
    stage: 0,
    done: STAGES.map(() => false),
    grades: STAGES.map(() => null),
    base: { h: 0, s: 100 }, // colour shown in the centre
    target: { h: 0, s: 100 }, // colour to pick
    pick: null, // hue (degrees) or saturation (0-100), depending on the stage
    left: ROUND_SECONDS * 1000,
    rounds: 0, // stage rounds played (a timeout starts a new one)
    finished: false,
    locked: false // short pause after a pass
  };
  let last = 0;
  let timer = 0;

  // Stage chips (built once).
  const chips = STAGES.map((s) => {
    const c = document.createElement("span");
    c.className = "cw-step";
    c.textContent = s.name;
    stepsEl.appendChild(c);
    return c;
  });

  const stage = () => STAGES[st.stage];
  const isSat = () => stage().offset === null;

  function setMsg(text, kind = "info") {
    msgEl.textContent = text;
    msgEl.dataset.kind = kind;
  }

  // Colour currently picked (or null).
  function pickColor() {
    if (st.pick === null) return null;
    return isSat() ? hsl(st.base.h, st.pick) : hsl(st.pick, 100);
  }

  // Small diagram of the colour scheme: given colour, target "?" and the other
  // members of the scheme (faint).
  function renderScheme() {
    const off = stage().offset;
    if (off === null || off === 0) {
      schemeEl.innerHTML = "";
      return;
    }
    const members = { 180: [180], 30: [30, -30], 120: [120, 240], 90: [90, 180, 270] }[off];
    const pt = (deg, r = 24) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return { x: 30 + r * Math.cos(a), y: 30 + r * Math.sin(a) };
    };
    const b = pt(0);
    const t = pt(off);
    const faint = members
      .filter((m) => m !== off)
      .map((m) => {
        const p = pt(m);
        return `<circle cx="${p.x}" cy="${p.y}" r="5" class="faint"/>`;
      })
      .join("");
    schemeEl.innerHTML = `
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle cx="30" cy="30" r="24" class="orbit"/>
        <line x1="${b.x}" y1="${b.y}" x2="${t.x}" y2="${t.y}" class="link"/>
        ${faint}
        <circle cx="${b.x}" cy="${b.y}" r="6.5" style="fill:${hsl(st.base.h, 100)}" class="given"/>
        <circle cx="${t.x}" cy="${t.y}" r="6.5" class="target"/>
        <text x="${t.x}" y="${t.y + 0.5}">?</text>
      </svg>`;
  }

  function renderWheel() {
    if (isSat()) {
      wheel.style.background = `conic-gradient(${hsl(st.base.h, 0)}, ${hsl(st.base.h, 100)})`;
      wheel.classList.add("sat");
    } else {
      wheel.style.background =
        "conic-gradient(hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))";
      wheel.classList.remove("sat");
    }
  }

  function renderPick() {
    const c = pickColor();
    pickRing.style.background = c || "#d4d4d8";
    pickRing.classList.toggle("empty", !c);
    if (st.pick === null) {
      knob.hidden = true;
    } else {
      knob.hidden = false;
      const deg = isSat() ? (st.pick / 100) * 360 : st.pick;
      knob.style.transform = `rotate(${deg}deg)`;
      knob.firstElementChild.style.background = c;
    }
    confirmBtn.disabled = st.pick === null || st.finished || st.locked;
  }

  function renderTimer() {
    const frac = Math.max(0, st.left / (ROUND_SECONDS * 1000));
    timerArc.style.strokeDashoffset = String(100 - frac * 100);
    timerArc.classList.toggle("low", frac < 0.25);
    timeEl.textContent = String(Math.ceil(st.left / 1000));
  }

  function renderSteps() {
    chips.forEach((c, i) => {
      c.classList.toggle("done", st.done[i]);
      c.classList.toggle("current", i === st.stage && !st.finished);
      c.title = st.grades[i] !== null ? GRADES[st.grades[i]] : "";
    });
  }

  function render() {
    stageEl.textContent = `${st.stage + 1}/6 · ${stage().name}`;
    helpEl.textContent = stage().help;
    centre.style.background = isSat() ? hsl(st.base.h, st.base.s) : hsl(st.base.h, 100);
    renderScheme();
    renderWheel();
    renderPick();
    renderTimer();
    renderSteps();
  }

  // New colour for the current stage (new round).
  function newRound() {
    const h = randInt(0, 359);
    if (isSat()) {
      const s = randInt(15, 90);
      st.base = { h, s };
      st.target = { h, s };
    } else {
      st.base = { h, s: 100 };
      st.target = { h: (h + stage().offset) % 360, s: 100 };
    }
    st.pick = null;
    st.left = ROUND_SECONDS * 1000;
    st.locked = false;
    st.rounds++;
    render();
  }

  function pickAt(e) {
    const r = wheel.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // Ignore touches on the centre disc.
    if (Math.hypot(dx, dy) < r.width * 0.24) return false;
    const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360; // 0 = top, clockwise
    st.pick = isSat() ? Math.round((deg / 360) * 100) : Math.round(deg) % 360;
    renderPick();
    return true;
  }

  let dragging = false;
  wheel.addEventListener("pointerdown", (e) => {
    if (st.finished || st.locked) return;
    if (pickAt(e)) {
      dragging = true;
      wheel.setPointerCapture && wheel.setPointerCapture(e.pointerId);
    }
  });
  wheel.addEventListener("pointermove", (e) => {
    if (dragging) pickAt(e);
  });
  const stopDrag = () => (dragging = false);
  wheel.addEventListener("pointerup", stopDrag);
  wheel.addEventListener("pointercancel", stopDrag);

  function confirm() {
    if (st.finished || st.locked || st.pick === null) return;
    const sat = isSat();
    const error = sat ? Math.abs(st.pick - st.target.s) : hueDiff(st.pick, st.target.h);
    const g = gradeOf(error, sat);
    const diff = sat ? `${Math.round(error)} % de saturación` : `${Math.round(error)}° de tono`;
    if (g <= PASS) {
      st.done[st.stage] = true;
      st.grades[st.stage] = g;
      st.locked = true;
      vibrate([20, 40, 20]);
      setMsg(`✅ ${GRADES[g]}: diferencia de ${diff}.`, "success");
      renderPick();
      renderSteps();
      setTimeout(nextStage, 900);
    } else {
      vibrate([40, 30, 40]);
      setMsg(`${g === 3 ? "🟠" : "❌"} ${GRADES[g]}: diferencia de ${diff}. Probá de nuevo.`, "error");
    }
  }

  function nextStage() {
    if (st.finished) return;
    if (st.stage === STAGES.length - 1) {
      win();
      return;
    }
    st.stage++;
    setMsg("Arrastrá sobre la rueda para elegir y tocá Confirmar.");
    newRound();
  }

  function win() {
    st.finished = true;
    st.locked = false;
    stop();
    renderSteps();
    renderPick();
    setMsg("🎨 ¡Completaste las 6 armonías de color!", "success");
    vibrate([30, 60, 30]);
    onComplete && onComplete({ rounds: st.rounds });
  }

  // --- Timer (runs only while this screen is visible) -------------------------
  const isActive = () => document.body.dataset.screen === "screen-color" && !document.hidden;

  function tick() {
    const now = performance.now();
    const dt = Math.min(250, now - last);
    last = now;
    if (!isActive() || st.finished || st.locked) return;
    st.left -= dt;
    if (st.left <= 0) {
      setMsg("⏱️ Se acabó el tiempo: color nuevo.", "warning");
      vibrate(30);
      newRound();
      return;
    }
    renderTimer();
  }

  function start() {
    if (timer) return;
    last = performance.now();
    timer = setInterval(tick, 100);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
  }

  confirmBtn.addEventListener("click", confirm);

  function restart() {
    stop();
    st.stage = 0;
    st.done = STAGES.map(() => false);
    st.grades = STAGES.map(() => null);
    st.rounds = 0;
    st.finished = false;
    setMsg("Arrastrá sobre la rueda para elegir y tocá Confirmar.");
    newRound();
    start();
  }

  // Key live data for the coordinator's monitor (js/monitor.js).
  function snapshot() {
    return {
      stage: st.stage,
      stageName: stage().name,
      done: st.done.slice(),
      grades: st.grades.map((g) => (g === null ? "" : GRADES[g])),
      time: Math.max(0, Math.ceil(st.left / 1000)),
      sat: isSat(),
      base: { ...st.base },
      target: { ...st.target },
      pick: st.pick === null ? -1 : st.pick,
      rounds: st.rounds,
      msg: msgEl.textContent,
      finished: st.finished
    };
  }

  restart();
  return { restart, snapshot };
}
