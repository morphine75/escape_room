// Level 3 - Game B: "Robot Ciego" (batch programming).
//
// The robot cannot see: the player writes the WHOLE program first (Avanzar /
// Girar izquierda / Girar derecha) and then runs it. The robot executes it step
// by step from the start; if it hits a wall or leaves the grid the run fails,
// the failing command is highlighted and the robot goes back to the start, so
// the player can debug the program and run it again. Reaching the goal 🏁 at
// any point of the program completes the level.
//
// The 6x6 grid is generated locally with random obstacles and always has a path
// from the start to the goal (BFS check).
import { $, vibrate } from "../../ui.js";

export const GRID = 6;
const OBSTACLES = 7;
const MAX_COMMANDS = 40;
const STEP_MS = 380;
const START = { x: 0, y: 0, dir: 1 }; // facing right
const GOAL = { x: GRID - 1, y: GRID - 1 };

// dir: 0 = up, 1 = right, 2 = down, 3 = left
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const ARROWS = ["⬆️", "➡️", "⬇️", "⬅️"];
const LABELS = { forward: "⬆️ Avanzar", left: "↩️ Girar izq.", right: "↪️ Girar der." };
const SHORT = { forward: "⬆️", left: "↩️", right: "↪️" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function reachable(walls) {
  const seen = new Set(["0,0"]);
  const queue = [{ x: 0, y: 0 }];
  while (queue.length) {
    const c = queue.shift();
    if (c.x === GOAL.x && c.y === GOAL.y) return true;
    for (let d = 0; d < 4; d++) {
      const x = c.x + DX[d];
      const y = c.y + DY[d];
      const k = x + "," + y;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID || walls[y][x] || seen.has(k)) continue;
      seen.add(k);
      queue.push({ x, y });
    }
  }
  return false;
}

// Random obstacles, retried until the goal is reachable from the start.
export function generateRobotGrid() {
  for (;;) {
    const walls = Array.from({ length: GRID }, () => Array(GRID).fill(false));
    let placed = 0;
    while (placed < OBSTACLES) {
      const x = Math.floor(Math.random() * GRID);
      const y = Math.floor(Math.random() * GRID);
      const reserved =
        (x === START.x && y === START.y) ||
        (x === GOAL.x && y === GOAL.y) ||
        (x === START.x + 1 && y === START.y); // first cell in front of the robot stays open
      if (reserved || walls[y][x]) continue;
      walls[y][x] = true;
      placed++;
    }
    if (reachable(walls)) return walls;
  }
}

export function initRobot({ onComplete } = {}) {
  const gridEl = $("#robot-grid");
  const listEl = $("#robot-cmds");
  const countEl = $("#robot-count");
  const msgEl = $("#robot-msg");
  const runBtn = $("#robot-run");
  const undoBtn = $("#robot-undo");
  const clearBtn = $("#robot-clear");
  const newBtn = $("#robot-new");
  const cmdBtns = [...document.querySelectorAll("#robot-pad [data-cmd]")];

  let walls = generateRobotGrid();
  let robot = { ...START };
  let program = [];
  let running = false;
  let finished = false;
  let runId = 0; // invalidates an animation in progress on restart
  // What the program list / grid currently highlight (for the coordinator's monitor).
  const view = { active: -1, error: -1, crash: null };

  // Cells are created once; render() only updates their classes / content.
  const cells = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const c = document.createElement("div");
      c.className = "robot-cell";
      gridEl.appendChild(c);
      cells.push(c);
    }
  }

  function setMsg(text, kind = "info") {
    msgEl.textContent = text;
    msgEl.dataset.kind = kind;
  }

  function renderGrid(crash = null) {
    view.crash = crash;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const c = cells[y * GRID + x];
        let cls = "robot-cell";
        let txt = "";
        if (robot.x === x && robot.y === y) {
          cls += " bot";
          txt = ARROWS[robot.dir];
        } else if (GOAL.x === x && GOAL.y === y) {
          cls += " goal";
          txt = "🏁";
        } else if (walls[y][x]) {
          cls += " wall";
        }
        if (crash && crash.x === x && crash.y === y) cls += " crash";
        c.className = cls;
        c.textContent = txt;
      }
    }
  }

  function renderProgram(active = -1, error = -1) {
    view.active = active;
    view.error = error;
    listEl.innerHTML = "";
    if (!program.length) {
      const em = document.createElement("em");
      em.textContent = "Sin comandos: armá el programa con los botones.";
      listEl.appendChild(em);
    }
    program.forEach((cmd, i) => {
      const chip = document.createElement("span");
      chip.className = "robot-chip";
      if (i === active) chip.classList.add("active");
      if (i === error) chip.classList.add("error");
      chip.textContent = `${i + 1}. ${SHORT[cmd]}`;
      chip.title = LABELS[cmd];
      listEl.appendChild(chip);
    });
    const target = listEl.querySelector(".active, .error");
    if (target) target.scrollIntoView({ block: "nearest", inline: "nearest" });
    else listEl.scrollTop = listEl.scrollHeight;
    countEl.textContent = String(program.length);
  }

  function setBusy(busy) {
    running = busy;
    [...cmdBtns, runBtn, undoBtn, clearBtn, newBtn].forEach((b) => (b.disabled = busy || finished));
  }

  function add(cmd) {
    if (running || finished) return;
    if (program.length >= MAX_COMMANDS) {
      setMsg(`Máximo ${MAX_COMMANDS} comandos.`, "warning");
      return;
    }
    program.push(cmd);
    vibrate(8);
    setMsg("Programando… cuando termines, tocá ▶️ Ejecutar.");
    renderProgram();
  }

  async function run() {
    if (running || finished) return;
    if (!program.length) {
      setMsg("⚠️ No hay comandos para ejecutar.", "warning");
      return;
    }
    const id = ++runId;
    setBusy(true);
    robot = { ...START };
    renderGrid();
    setMsg("Ejecutando programa…");

    for (let i = 0; i < program.length; i++) {
      renderProgram(i);
      await sleep(STEP_MS);
      if (id !== runId) return; // restarted meanwhile
      const cmd = program[i];
      if (cmd === "left") robot.dir = (robot.dir + 3) % 4;
      else if (cmd === "right") robot.dir = (robot.dir + 1) % 4;
      else {
        const nx = robot.x + DX[robot.dir];
        const ny = robot.y + DY[robot.dir];
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || walls[ny][nx]) {
          renderProgram(-1, i);
          renderGrid({ x: nx, y: ny });
          setMsg(`💥 ¡Colisión en el comando ${i + 1}! Corregí el programa y volvé a ejecutarlo.`, "error");
          vibrate([40, 40, 40]);
          await sleep(1200);
          if (id !== runId) return;
          robot = { ...START };
          renderGrid();
          setBusy(false);
          return;
        }
        robot.x = nx;
        robot.y = ny;
      }
      renderGrid();
      if (robot.x === GOAL.x && robot.y === GOAL.y) {
        finished = true;
        renderProgram(i);
        setBusy(false);
        setMsg(`🏆 ¡Meta alcanzada con ${i + 1} comandos! Algoritmo correcto.`, "success");
        vibrate([30, 50, 30]);
        onComplete && onComplete({ commands: i + 1 });
        return;
      }
    }
    robot = { ...START };
    renderGrid();
    renderProgram();
    setBusy(false);
    setMsg("⚠️ El programa terminó sin llegar a la meta. Agregá comandos.", "warning");
  }

  function restart(newMaze = true) {
    runId++;
    if (newMaze) walls = generateRobotGrid();
    robot = { ...START };
    program = [];
    finished = false;
    setBusy(false);
    renderGrid();
    renderProgram();
    setMsg("El robot mira a la derecha ➡️. Armá todo el programa y después ejecutalo.");
  }

  cmdBtns.forEach((b) => b.addEventListener("click", () => add(b.dataset.cmd)));
  runBtn.addEventListener("click", run);
  undoBtn.addEventListener("click", () => {
    if (running || finished || !program.length) return;
    program.pop();
    renderProgram();
  });
  clearBtn.addEventListener("click", () => {
    if (running || finished) return;
    program = [];
    renderProgram();
  });
  newBtn.addEventListener("click", () => {
    if (!running && !finished) restart(true);
  });

  restart(false);
  // Key live data for the coordinator's monitor (js/monitor.js).
  function snapshot() {
    return {
      program: program.join(","),
      commands: program.length,
      running,
      finished,
      robot: { ...robot },
      msg: msgEl.textContent,
      // Visual replica (dashboard stage 2).
      walls: walls.map((row) => row.map((w) => (w ? 1 : 0)).join("")).join(""),
      active: view.active,
      error: view.error,
      crash: view.crash
    };
  }

  return { restart, snapshot };
}
