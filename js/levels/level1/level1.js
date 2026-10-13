// Level 1 — "Matrix Protocol": grid rendering, command building, execution engine.
import { generateLevel1, GRID_SIZE } from "./generator.js";
import { $, $$, sleep, vibrate, toast } from "../../ui.js";

const DIRS = {
  up: { x: 0, y: -1, label: "moverArriba" },
  down: { x: 0, y: 1, label: "moverAbajo" },
  left: { x: -1, y: 0, label: "moverIzquierda" },
  right: { x: 1, y: 0, label: "moverDerecha" }
};
const STEP_MS = 220;

export function initLevel1({ onComplete }) {
  const gridEl = $("#l1-grid");
  const terminalEl = $("#l1-terminal");
  const runBtn = $("#l1-run");

  const state = {
    size: GRID_SIZE,
    grid: null,
    pos: { x: 0, y: 0 },
    step: 1,
    commands: [],
    running: false,
    solved: false
  };

  // --- Setup -----------------------------------------------------------------

  function newPuzzle() {
    const { size, grid } = generateLevel1();
    state.size = size;
    state.grid = grid;
    state.pos = { x: 0, y: 0 };
    state.commands = [];
    state.solved = false;
    state.running = false;
    runBtn.disabled = false;
    gridEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    renderGrid();
    renderTerminal();
  }

  function renderGrid() {
    gridEl.innerHTML = "";
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const cell = state.grid[y][x];
        const div = document.createElement("div");
        div.className = `l1-cell type-${cell.type}`;
        div.dataset.x = x;
        div.dataset.y = y;
        if (state.pos.x === x && state.pos.y === y) {
          div.classList.add("hero");
          div.textContent = "😎";
        } else if (cell.type === "agent") {
          div.innerHTML = `🕶️<span class="l1-hp">${cell.hp}</span>`;
        } else if (cell.type === "gate") {
          div.textContent = cell.open ? "🚪" : "🔐";
        } else if (cell.type === "booth") {
          div.textContent = "📞";
        } else if (cell.type === "wall") {
          div.textContent = "🧱";
        } else {
          div.classList.add("binary");
          div.textContent = (x + y) % 2 === 0 ? "01" : "10";
        }
        gridEl.appendChild(div);
      }
    }
  }

  function commandLabel(cmd) {
    if (cmd.type === "move") return `${DIRS[cmd.dir].label}(${cmd.steps})`;
    if (cmd.type === "bypass") return `bypassFirewall(${cmd.power})`;
    if (cmd.type === "decrypt") return `decryptGate(key)`;
    return "?";
  }

  function renderTerminal() {
    terminalEl.innerHTML = "";
    if (state.commands.length === 0) {
      const li = document.createElement("li");
      li.className = "l1-empty";
      li.textContent = "> _ (agregá comandos abajo)";
      terminalEl.appendChild(li);
      return;
    }
    state.commands.forEach((cmd, i) => {
      const li = document.createElement("li");
      li.className = "l1-cmd";
      li.dataset.index = i;
      li.innerHTML = `<span class="l1-cmd-text">> ${commandLabel(cmd)}</span>`;
      const del = document.createElement("button");
      del.className = "l1-del";
      del.type = "button";
      del.textContent = "❌";
      del.setAttribute("aria-label", "Quitar comando");
      del.addEventListener("click", () => {
        state.commands.splice(i, 1);
        renderTerminal();
      });
      li.appendChild(del);
      terminalEl.appendChild(li);
    });
  }

  function addCommand(cmd) {
    if (state.running) return;
    state.commands.push(cmd);
    renderTerminal();
    vibrate(15);
  }

  // --- Controls --------------------------------------------------------------

  $$("#l1-steps .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.step = Number(chip.dataset.step);
      $$("#l1-steps .chip").forEach((c) => c.classList.toggle("active", c === chip));
    });
  });

  $$("#l1-dpad button").forEach((btn) => {
    btn.addEventListener("click", () => {
      addCommand({ type: "move", dir: btn.dataset.move, steps: state.step });
    });
  });

  $$("#l1-actions button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.action === "bypass") {
        const raw = await promptModal({
          title: "⚔️ Bypass de firewall",
          question: "Defensa (HP) del agente a neutralizar:",
          placeholder: "2, 3 o 4"
        });
        if (raw === null) return;
        const power = parseInt(raw, 10);
        if (!power) { toast("Ingresá un valor numérico", "warning"); return; }
        addCommand({ type: "bypass", power });
      } else if (btn.dataset.action === "decrypt") {
        addCommand({ type: "decrypt" });
      }
    });
  });

  runBtn.addEventListener("click", runExploit);

  // --- Gate puzzle modal -----------------------------------------------------

  function promptModal({ title, question, placeholder = "" }) {
    return new Promise((resolve) => {
      const modal = $("#l1-modal");
      const titleEl = $("#l1-modal-title");
      const qEl = $("#l1-modal-q");
      const input = $("#l1-modal-input");
      const okBtn = $("#l1-modal-ok");
      const cancelBtn = $("#l1-modal-cancel");

      titleEl.textContent = title;
      qEl.textContent = question;
      input.value = "";
      input.placeholder = placeholder;
      modal.classList.remove("hidden");
      setTimeout(() => input.focus(), 60);

      function cleanup(value) {
        modal.classList.add("hidden");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        input.removeEventListener("keydown", onKey);
        resolve(value);
      }
      function onOk() { cleanup(input.value.trim()); }
      function onCancel() { cleanup(null); }
      function onKey(e) { if (e.key === "Enter") onOk(); }

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      input.addEventListener("keydown", onKey);
    });
  }

  async function solveGate() {
    const value = 8 + Math.floor(Math.random() * 8); // 8..15 -> 4-bit binary
    const binary = value.toString(2).padStart(4, "0");
    const answer = await promptModal({
      title: "🔐 Puerta cifrada",
      question: `Clave: ¿cuánto es (${binary})₂ en decimal?`,
      placeholder: "número decimal"
    });
    if (answer === null) return false;
    return parseInt(answer, 10) === value;
  }

  // --- Execution engine ------------------------------------------------------

  const inBounds = (p) => p.x >= 0 && p.y >= 0 && p.x < state.size && p.y < state.size;

  function neighbors(p) {
    return Object.values(DIRS).map((d) => ({ x: p.x + d.x, y: p.y + d.y }));
  }

  function setHighlight(index, variant) {
    $$("#l1-terminal .l1-cmd").forEach((li) => {
      const i = Number(li.dataset.index);
      li.classList.toggle("active", i === index);
      li.classList.toggle("fail", i === index && variant === "fail");
    });
  }

  function clearHighlight() {
    $$("#l1-terminal .l1-cmd").forEach((li) => li.classList.remove("active", "fail"));
  }

  async function doMove(dir, steps) {
    const d = DIRS[dir];
    for (let s = 0; s < steps; s++) {
      const next = { x: state.pos.x + d.x, y: state.pos.y + d.y };
      if (!inBounds(next)) return { ok: false, reason: "Saliste del tablero" };
      const cell = state.grid[next.y][next.x];
      if (cell.type === "wall") return { ok: false, reason: "Chocaste con un firewall" };
      if (cell.type === "agent") return { ok: false, reason: "Un agente bloquea el paso (usá bypassFirewall)" };
      if (cell.type === "gate" && !cell.open) return { ok: false, reason: "La puerta está cifrada (usá decryptGate)" };
      state.pos = next;
      renderGrid();
      await sleep(STEP_MS);
      if (cell.type === "booth") return { ok: true, done: true };
    }
    return { ok: true };
  }

  async function doBypass(power) {
    const target = neighbors(state.pos)
      .filter(inBounds)
      .find((n) => state.grid[n.y][n.x].type === "agent" && state.grid[n.y][n.x].hp === power);
    if (!target) {
      return { ok: false, reason: "No hay un agente adyacente con esa defensa" };
    }
    state.grid[target.y][target.x] = { type: "data" };
    renderGrid();
    vibrate([20, 40, 20]);
    await sleep(STEP_MS + 120);
    return { ok: true };
  }

  async function doDecrypt() {
    const gatePos = neighbors(state.pos)
      .filter(inBounds)
      .find((n) => state.grid[n.y][n.x].type === "gate");
    if (!gatePos) return { ok: false, reason: "No estás junto a una puerta cifrada" };
    const ok = await solveGate();
    if (!ok) return { ok: false, reason: "Clave incorrecta" };
    state.grid[gatePos.y][gatePos.x].open = true;
    renderGrid();
    await sleep(STEP_MS);
    return { ok: true };
  }

  async function runCommand(cmd) {
    if (cmd.type === "move") return doMove(cmd.dir, cmd.steps);
    if (cmd.type === "bypass") return doBypass(cmd.power);
    if (cmd.type === "decrypt") return doDecrypt();
    return { ok: true };
  }

  async function runExploit() {
    if (state.running || state.solved) return;
    if (state.commands.length === 0) {
      toast("Agregá al menos un comando al script", "warning");
      return;
    }
    state.running = true;
    runBtn.disabled = true;
    vibrate(30);

    // Reset hero to start before each run.
    state.pos = { x: 0, y: 0 };
    renderGrid();

    let reached = false;
    for (let i = 0; i < state.commands.length; i++) {
      setHighlight(i, "active");
      const res = await runCommand(state.commands[i]);
      if (!res.ok) {
        setHighlight(i, "fail");
        vibrate([40, 60, 40]);
        toast("BUG: " + res.reason, "error");
        state.running = false;
        runBtn.disabled = false;
        return;
      }
      if (res.done) { reached = true; break; }
    }

    clearHighlight();
    state.running = false;
    runBtn.disabled = false;

    if (reached) {
      state.solved = true;
      runBtn.disabled = true;
      toast("¡Exploit ejecutado! Llegaste a la cabina 📞", "success");
      vibrate([30, 50, 30]);
      onComplete && onComplete();
    } else {
      toast("El script terminó sin llegar a la cabina", "warning");
    }
  }

  newPuzzle();
  return { newPuzzle };
}
