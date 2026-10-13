// Level 1 — "Matrix Protocol" (real-time arcade / Pac-Man style).
//
// The hero (😎) moves around a 7x7 maze with the arrow keys / on-screen D-pad and
// must intercept the phone booth (📞), which also wanders. An agent (🕵🏻) chases
// the hero:
//   - DISPARAR (Ammo) fires a projectile in the facing direction; hitting an
//     agent freezes it for a few seconds.
//   - BYPASS rebuilds the maze live (limited uses + cooldown).
//   - ENCRYPT freezes the nearest active agent (single use per attempt).
// If the agent catches the hero the attempt restarts with a fresh maze, until the
// hero reaches the phone, which marks level_1_completed in Firebase.
// All feedback goes to the HUD status line, never to toasts: toasts sit at the
// bottom of the screen, over the D-pad and action buttons, and blocked play.
import {
  GRID_SIZE,
  AGENT_COUNT,
  generateLevel1,
  regenerateWalls,
  openCells,
  bfsDistances
} from "./generator.js";
import { $, vibrate } from "../../ui.js";

// --- Tuning ------------------------------------------------------------------
const HERO_MS = 150; // time per cell for the hero
const AGENT_MS = 300; // agents move at half the hero's speed (gives room to react)
const PHONE_MS = 420; // phone wander interval
const PROJ_MS = 70; // projectile step interval
const PHONE_MOVE_CHANCE = 0.6; // phone sometimes stays put (catchable)

const FREEZE_ENCRYPT_MS = 5000; // ENCRYPT freeze
const FREEZE_SHOT_MS = 4000; // projectile freeze

const BYPASS_USES = 3;
const BYPASS_COOLDOWN_MS = 1500;
const ENCRYPT_USES = 1;
const AMMO = 3;

const DEFAULT_STATUS = "Llegá al 📞 y esquivá al 🕵🏻";
const STATUS_MS = 1800; // how long a transient status message stays

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
const STEP_DIRS = Object.values(DIRS);

const now = () => performance.now();

export function initLevel1({ onComplete } = {}) {
  const board = $("#l1-board");
  const mazeEl = $("#l1-maze");
  const tokensEl = $("#l1-tokens");
  const attemptsEl = $("#l1-attempts");
  const statusEl = $("#l1-status");
  const ammoEl = $("#l1-ammo");
  const bypassEl = $("#l1-bypass-n");
  const encryptEl = $("#l1-encrypt-n");
  const fireBtn = $("#l1-fire");
  const bypassBtn = $("#l1-bypass");
  const encryptBtn = $("#l1-encrypt");
  const dpad = $("#l1-dpad");

  const state = {
    size: GRID_SIZE,
    walls: null,
    hero: { x: 0, y: 0 },
    dir: { x: 0, y: 0 },
    wantDir: null,
    agents: [],
    phone: { x: 0, y: 0 },
    projectiles: [],
    attempts: 1,
    ammo: AMMO,
    bypassUses: BYPASS_USES,
    encryptUses: ENCRYPT_USES,
    lastBypassAt: -Infinity,
    solved: false,
    pendingReset: false
  };

  let raf = 0;
  let last = 0;
  let running = false;
  let heroAcc = 0;
  let phoneAcc = 0;
  let projAcc = 0;
  let agentAcc = new Array(AGENT_COUNT).fill(0);
  let statusTimer = 0;

  // Shows a message in the HUD status line. `kind` (info / warning / error /
  // success) sets its colour; after `ms` it reverts to the default hint
  // (ms = 0 keeps it until the next message).
  function setStatus(msg, kind = "info", ms = STATUS_MS) {
    statusEl.textContent = msg;
    statusEl.dataset.kind = kind;
    clearTimeout(statusTimer);
    if (ms) {
      statusTimer = setTimeout(() => {
        statusEl.textContent = DEFAULT_STATUS;
        statusEl.dataset.kind = "info";
      }, ms);
    }
  }

  // --- Tokens (hero / agents / phone float above the maze grid) --------------
  function makeToken(cls, emoji) {
    const el = document.createElement("div");
    el.className = "l1-token " + cls;
    const sp = document.createElement("span");
    sp.textContent = emoji;
    el.appendChild(sp);
    tokensEl.appendChild(el);
    return { el, sp };
  }

  const heroToken = makeToken("hero", "😎");
  const agentTokens = Array.from({ length: AGENT_COUNT }, () => makeToken("agent", "🕵🏻"));
  const phoneToken = makeToken("phone", "📞");
  const projPool = [];

  function setToken(token, x, y) {
    const tf = `translate(${x * 100}%, ${y * 100}%)`;
    if (token.el.style.transform !== tf) token.el.style.transform = tf;
  }

  function syncProjectiles() {
    const ps = state.projectiles;
    while (projPool.length < ps.length) projPool.push(makeToken("projectile", "•"));
    while (projPool.length > ps.length) projPool.pop().el.remove();
    ps.forEach((p, i) => setToken(projPool[i], p.x, p.y));
  }

  // --- Rendering -------------------------------------------------------------
  function renderMaze() {
    board.style.setProperty("--n", state.size);
    mazeEl.innerHTML = "";
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const cell = document.createElement("div");
        cell.className = "l1-cell" + (state.walls[y][x] ? " wall" : "");
        mazeEl.appendChild(cell);
      }
    }
  }

  function sizeTokens() {
    const width = board.clientWidth || 320;
    board.style.setProperty("--cell", width / state.size + "px");
  }

  function paint(t = now()) {
    setToken(heroToken, state.hero.x, state.hero.y);
    setToken(phoneToken, state.phone.x, state.phone.y);
    agentTokens.forEach((token, i) => {
      const a = state.agents[i];
      token.el.hidden = !a;
      if (!a) return;
      setToken(token, a.x, a.y);
      token.el.classList.toggle("frozen", a.frozenUntil > t);
    });
    syncProjectiles();
  }

  function updateHud() {
    attemptsEl.textContent = state.attempts;
    ammoEl.textContent = state.ammo;
    bypassEl.textContent = state.bypassUses;
    encryptEl.textContent = state.encryptUses;
    fireBtn.disabled = state.ammo <= 0;
    bypassBtn.disabled = state.bypassUses <= 0;
    encryptBtn.disabled = state.encryptUses <= 0;
  }

  // --- Level lifecycle -------------------------------------------------------
  function newAttempt() {
    const level = generateLevel1(state.size);
    state.size = level.size;
    state.walls = level.walls;
    state.hero = { ...level.hero };
    state.phone = { ...level.phone };
    state.agents = level.agents.map((a) => ({ ...a, prev: null, frozenUntil: 0 }));
    state.dir = { x: 0, y: 0 };
    state.wantDir = null;
    state.projectiles = [];
    state.ammo = AMMO;
    state.bypassUses = BYPASS_USES;
    state.encryptUses = ENCRYPT_USES;
    state.lastBypassAt = -Infinity;
    state.pendingReset = false;

    renderMaze();
    sizeTokens();
    paint();
    updateHud();
  }

  function newPuzzle() {
    state.attempts = 1;
    state.solved = false;
    newAttempt();
    setStatus(DEFAULT_STATUS, "info", 0);
    if (isActive() && !document.hidden) start();
  }

  function isActive() {
    return document.body.dataset.screen === "screen-level1";
  }

  // --- Rules -----------------------------------------------------------------
  function inBounds(p) {
    return p.x >= 0 && p.y >= 0 && p.x < state.size && p.y < state.size;
  }

  function canMove(from, dir) {
    const n = { x: from.x + dir.x, y: from.y + dir.y };
    return inBounds(n) && !state.walls[n.y][n.x];
  }

  function stepHero() {
    if (state.solved || state.pendingReset) return;
    if (state.wantDir && canMove(state.hero, state.wantDir)) state.dir = state.wantDir;
    if (state.dir.x || state.dir.y) {
      if (canMove(state.hero, state.dir)) {
        state.hero = { x: state.hero.x + state.dir.x, y: state.hero.y + state.dir.y };
      }
    }
    collide();
  }

  function stepAgent(i) {
    if (state.solved || state.pendingReset) return;
    const a = state.agents[i];
    if (a.frozenUntil > now()) return;

    const dist = bfsDistances(state.walls, state.size, state.hero);
    const others = state.agents.filter((_, j) => j !== i);

    let opts = STEP_DIRS.map((d) => ({ x: a.x + d.x, y: a.y + d.y })).filter(
      (n) =>
        inBounds(n) &&
        !state.walls[n.y][n.x] &&
        !(a.prev && n.x === a.prev.x && n.y === a.prev.y) // don't reverse
    );
    if (!opts.length && a.prev) opts = [{ ...a.prev }]; // dead end: allow reverse
    if (!opts.length) return;

    let candidates = opts.filter((n) => !others.some((o) => o.x === n.x && o.y === n.y));
    if (!candidates.length) candidates = opts;

    let best = candidates[0];
    let bestDist = dist[best.y][best.x];
    for (const n of candidates) {
      const d = dist[n.y][n.x];
      if (d < bestDist || (d === bestDist && Math.random() < 0.5)) {
        best = n;
        bestDist = d;
      }
    }

    a.prev = { x: a.x, y: a.y };
    a.x = best.x;
    a.y = best.y;
    collide();
  }

  function stepPhone() {
    if (state.solved || state.pendingReset) return;
    if (Math.random() > PHONE_MOVE_CHANCE) return;
    const opts = STEP_DIRS.map((d) => ({
      x: state.phone.x + d.x,
      y: state.phone.y + d.y
    })).filter(
      (n) =>
        inBounds(n) &&
        !state.walls[n.y][n.x] &&
        !(n.x === state.hero.x && n.y === state.hero.y) // never walk onto the hero
    );
    if (!opts.length) return;
    state.phone = opts[Math.floor(Math.random() * opts.length)];
    collide();
  }

  function stepProjectiles() {
    if (state.solved || state.pendingReset) return;
    const t = now();
    const survivors = [];
    for (const p of state.projectiles) {
      const n = { x: p.x + p.dir.x, y: p.y + p.dir.y };
      if (!inBounds(n) || state.walls[n.y][n.x]) continue; // hit a wall / left the grid

      const hitIndex = state.agents.findIndex((a) => a.x === n.x && a.y === n.y);
      if (hitIndex !== -1) {
        const agent = state.agents[hitIndex];
        if (agent.frozenUntil <= t) {
          agent.frozenUntil = t + FREEZE_SHOT_MS;
          vibrate(20);
        }
        continue; // projectile is consumed either way
      }
      p.x = n.x;
      p.y = n.y;
      survivors.push(p);
    }
    state.projectiles = survivors;
  }

  function collide() {
    if (state.solved || state.pendingReset) return;
    if (state.hero.x === state.phone.x && state.hero.y === state.phone.y) {
      win();
      return;
    }
    const t = now();
    const caught = state.agents.some(
      (a) => a.frozenUntil <= t && a.x === state.hero.x && a.y === state.hero.y
    );
    if (caught) onCaught();
  }

  function win() {
    state.solved = true;
    state.projectiles = [];
    stop();
    setStatus("¡Exploit ejecutado! Cabina alcanzada 📞", "success", 0);
    vibrate([30, 60, 30]);
    onComplete && onComplete();
  }

  function onCaught() {
    state.pendingReset = true;
    state.attempts++;
    attemptsEl.textContent = state.attempts;
    vibrate([60, 40, 60]);
  }

  // --- Actions ---------------------------------------------------------------
  function setDir(dirName) {
    const d = DIRS[dirName];
    if (!d) return;
    state.wantDir = d;
  }

  function fire() {
    if (state.solved || state.ammo <= 0) {
      if (state.ammo <= 0) setStatus("Sin municiones 🔫", "warning");
      return;
    }
    state.ammo--;
    const d = state.dir.x || state.dir.y ? { ...state.dir } : { x: 1, y: 0 };
    const start = { x: state.hero.x, y: state.hero.y };
    const spawn = { x: start.x + d.x, y: start.y + d.y };
    const origin = inBounds(spawn) && !state.walls[spawn.y][spawn.x] ? spawn : start;
    state.projectiles.push({ x: origin.x, y: origin.y, dir: d });
    vibrate(15);
    updateHud();
    syncProjectiles();
  }

  function bypass() {
    if (state.solved) return;
    const t = now();
    if (state.bypassUses <= 0) {
      setStatus("Ya no te quedan BYPASS", "warning");
      return;
    }
    if (t - state.lastBypassAt < BYPASS_COOLDOWN_MS) {
      setStatus("BYPASS enfriando…", "warning");
      return;
    }
    state.lastBypassAt = t;
    state.bypassUses--;

    const keep = [state.hero, ...state.agents.map((a) => ({ x: a.x, y: a.y }))];
    state.walls = regenerateWalls(state.size, keep);
    state.agents.forEach((a) => (a.prev = null));
    relocatePhone();

    renderMaze();
    sizeTokens();
    paint(t);
    updateHud();
    setStatus("Laberinto reconfigurado ⚔️");
    vibrate([15, 30, 15]);
  }

  function relocatePhone() {
    const dist = bfsDistances(state.walls, state.size, state.hero);
    const occupied = [state.hero, ...state.agents];
    const cells = openCells(state.walls, state.size).filter(
      (c) =>
        dist[c.y][c.x] !== Infinity &&
        !occupied.some((o) => o.x === c.x && o.y === c.y)
    );
    if (!cells.length) return;
    cells.sort((a, b) => dist[b.y][b.x] - dist[a.y][a.x]);
    const top = Math.max(1, Math.ceil(cells.length * 0.4));
    state.phone = cells[Math.floor(Math.random() * top)];
  }

  function encrypt() {
    if (state.solved) return;
    if (state.encryptUses <= 0) {
      setStatus("ENCRYPT ya fue usado", "warning");
      return;
    }
    const t = now();
    const dist = bfsDistances(state.walls, state.size, state.hero);
    let bestIndex = -1;
    let bestDist = Infinity;
    state.agents.forEach((a, i) => {
      if (a.frozenUntil > t) return;
      const d = dist[a.y][a.x];
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    });
    if (bestIndex === -1) {
      setStatus("No hay agentes activos para congelar", "warning");
      return;
    }
    state.encryptUses--;
    state.agents[bestIndex].frozenUntil = t + FREEZE_ENCRYPT_MS;
    updateHud();
    paint(t);
    setStatus("Agente congelado ❄️");
    vibrate([20, 40, 20]);
  }

  // --- Main loop -------------------------------------------------------------
  function start() {
    if (running || state.solved) return;
    if (!isActive() || document.hidden) return;
    running = true;
    last = now();
    heroAcc = phoneAcc = projAcc = 0;
    agentAcc.fill(0);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    const t = now();
    let dt = t - last;
    last = t;
    if (dt < 0) dt = 0;
    if (dt > 150) dt = 150; // clamp after the tab was throttled

    heroAcc += dt;
    while (heroAcc >= HERO_MS && !state.solved && !state.pendingReset) {
      heroAcc -= HERO_MS;
      stepHero();
    }

    for (let i = 0; i < state.agents.length; i++) {
      agentAcc[i] += dt;
      while (agentAcc[i] >= AGENT_MS && !state.solved && !state.pendingReset) {
        agentAcc[i] -= AGENT_MS;
        stepAgent(i);
      }
    }

    phoneAcc += dt;
    while (phoneAcc >= PHONE_MS && !state.solved && !state.pendingReset) {
      phoneAcc -= PHONE_MS;
      stepPhone();
    }

    projAcc += dt;
    while (projAcc >= PROJ_MS && !state.solved && !state.pendingReset) {
      projAcc -= PROJ_MS;
      stepProjectiles();
    }

    if (state.solved) {
      stop();
      return;
    }
    if (state.pendingReset) {
      state.pendingReset = false;
      newAttempt();
      setStatus("🚨 ¡Te atraparon! Laberinto nuevo", "error");
    }
    paint(t);
  }

  // --- Input -----------------------------------------------------------------
  const KEY_DIRS = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", a: "left", s: "down", d: "right",
    W: "up", A: "left", S: "down", D: "right"
  };

  function onKey(e) {
    if (!isActive()) return;
    const dir = KEY_DIRS[e.key];
    if (dir) {
      e.preventDefault();
      setDir(dir);
      return;
    }
    if (e.key === " " || e.key === "f" || e.key === "F") {
      e.preventDefault();
      fire();
    } else if (e.key === "b" || e.key === "B") {
      e.preventDefault();
      bypass();
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      encrypt();
    }
  }

  dpad.querySelectorAll("button[data-move]").forEach((btn) => {
    const press = (e) => {
      e.preventDefault();
      setDir(btn.dataset.move);
    };
    btn.addEventListener("pointerdown", press);
  });

  fireBtn.addEventListener("click", fire);
  bypassBtn.addEventListener("click", bypass);
  encryptBtn.addEventListener("click", encrypt);

  window.addEventListener("keydown", onKey);

  // --- Visibility / lifecycle hooks -----------------------------------------
  const sync = () => {
    if (isActive() && !document.hidden && !state.solved) start();
    else stop();
  };
  new MutationObserver(sync).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-screen"]
  });
  document.addEventListener("visibilitychange", sync);

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(sizeTokens).observe(board);
  } else {
    window.addEventListener("resize", sizeTokens);
  }

  // --- Go --------------------------------------------------------------------
  newAttempt();
  updateHud();
  sync();

  return { newPuzzle };
}
