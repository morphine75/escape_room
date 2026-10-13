// Player-side controller: registration -> lobby -> Level 1 -> wait -> Level 2 -> victory.
// Screen choice is driven entirely by the live room state in Firebase.
import { isConfigured } from "./firebase.js";
import { subscribeRoom, countCompleted } from "./sync.js";
import { joinRoom, markLevelComplete, markConnected, normalizeRoomId } from "./room.js";
import { loadSession, clearSession } from "./session.js";
import { showScreen, toast, $ } from "./ui.js";
import { initLevel1 } from "./levels/level1/level1.js";
import { initSerif } from "./levels/level2/serif.js";
import { initVector } from "./levels/level2/vector.js";
import { initRain } from "./digitalrain.js";

const state = {
  roomId: null,
  playerId: null,
  name: null,
  data: null,
  // Level controllers are created once and reused; on a coordinator reset they
  // are restarted instead of re-initialised (re-init would double-bind events).
  level1Ctl: null,
  level2Ctl: null,
  level2Kind: null,
  level1NeedsRestart: false,
  level2NeedsRestart: false,
  gameStartedSeen: false,
  unsub: null
};

function boot() {
  if (!isConfigured) {
    toast("Firebase no está configurado. Editá js/firebase-config.js", "error", 8000);
  }
  initRain();
  wireRegister();

  const session = loadSession();
  if (session.roomId && session.playerId) {
    state.roomId = session.roomId;
    state.playerId = session.playerId;
    state.name = session.name;
    markConnected(state.roomId, state.playerId).catch(() => {});
    startSubscription();
  } else {
    showScreen("screen-register");
  }
}

// --- Registration ------------------------------------------------------------

function wireRegister() {
  const joinBtn = $("#reg-join");
  const roomInput = $("#reg-room");
  const nameInput = $("#reg-name");

  const session = loadSession();
  if (session.roomId) roomInput.value = session.roomId;
  if (session.name) nameInput.value = session.name;

  joinBtn.addEventListener("click", async () => {
    const roomId = normalizeRoomId(roomInput.value);
    const name = nameInput.value.trim();
    if (!roomId) { toast("Ingresá el código de la sala", "warning"); return; }
    if (!name) { toast("Ingresá tu nombre", "warning"); return; }

    joinBtn.disabled = true;
    try {
      const res = await joinRoom(roomId, name);
      if (!res.ok) { toast(res.error, "error"); return; }
      state.roomId = roomId;
      state.playerId = res.playerId;
      state.name = name;
      // Fresh registration -> a fresh round for this device.
      state.gameStartedSeen = false;
      state.level1NeedsRestart = true;
      state.level2NeedsRestart = true;
      startSubscription();
    } catch (err) {
      toast("Error al unirse: " + err.message, "error");
    } finally {
      joinBtn.disabled = false;
    }
  });
}

// --- Live synchronization ----------------------------------------------------

function startSubscription() {
  if (state.unsub) state.unsub();
  state.unsub = subscribeRoom(
    state.roomId,
    onData,
    (err) => toast("Error de conexión: " + err.message, "error")
  );
}

function onData(data) {
  if (!data) {
    clearSession();
    toast("La sala no existe o fue cerrada", "error");
    showScreen("screen-register");
    return;
  }
  state.data = data;

  const me = (data.players && data.players[state.playerId]) || null;
  if (!me) {
    clearSession();
    toast("Tu registro ya no está en la sala", "error");
    showScreen("screen-register");
    return;
  }

  updateHeader(me);

  if (!data.started) {
    // If the game had started and now we are back in the lobby, the coordinator
    // reset it: flag the levels so they restart for the next round.
    if (state.gameStartedSeen) {
      state.gameStartedSeen = false;
      state.level1NeedsRestart = true;
      state.level2NeedsRestart = true;
    }
    renderLobby(data);
    return;
  }

  state.gameStartedSeen = true;

  const phase = data.current_phase || 1;
  if (phase === 1) {
    if (me.level_1_completed) renderWait(data, 1);
    else renderLevel1(data, me);
    return;
  }
  if (phase === 2) {
    if (me.level_2_completed) { renderWait(data, 2); return; }
    if (me.level_2_game === "serif") renderSerif();
    else if (me.level_2_game === "vector") renderVector();
    else renderWait(data, 2);
    return;
  }
  renderVictory();
}

function updateHeader(me) {
  $("#hdr-left").textContent = "🕵🏻 " + state.roomId;
  $("#hdr-right").textContent = "👤 " + (me.name || state.name || "");
}

// --- Screen renderers --------------------------------------------------------

function renderLobby(data) {
  showScreen("screen-lobby");
  const players = Object.values(data.players || {});
  const total = data.required_players || 0;
  $("#lobby-room").textContent = "Sala " + state.roomId;
  $("#lobby-count").textContent = `${players.length} / ${total}`;
  $("#lobby-bar").style.width = total ? Math.min(100, (players.length / total) * 100) + "%" : "0%";

  const ul = $("#lobby-players");
  ul.innerHTML = "";
  players.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.name + (p.connected === false ? " · desconectado" : "");
    ul.appendChild(li);
  });
}

function renderLevel1(data, me) {
  showScreen("screen-level1");
  const done = countCompleted(data.players, "level_1_completed");
  const total = data.required_players || Object.keys(data.players || {}).length;
  $("#l1-ready").textContent = `👤 ${me.name} (${done}/${total} listos)`;

  if (!state.level1Ctl) {
    state.level1Ctl = initLevel1({
      onComplete: () => {
        markLevelComplete(state.roomId, state.playerId, 1).catch((e) =>
          toast("No se pudo guardar el progreso: " + e.message, "error")
        );
      }
    });
    state.level1NeedsRestart = false;
  } else if (state.level1NeedsRestart) {
    state.level1Ctl.newPuzzle();
    state.level1NeedsRestart = false;
  }
}

function renderWait(data, level) {
  showScreen("screen-wait");
  const key = level === 1 ? "level_1_completed" : "level_2_completed";
  const players = Object.values(data.players || {});
  const done = players.filter((p) => p && p[key] === true).length;
  const total = data.required_players || players.length;

  $("#wait-title").textContent =
    level === 1 ? "Esperando al resto del equipo…" : "Esperando al resto del equipo (fase final)…";
  $("#wait-count").textContent = `${done} / ${total} completaron`;
  $("#wait-bar").style.width = total ? Math.min(100, (done / total) * 100) + "%" : "0%";
  $("#wait-hint").textContent =
    level === 1
      ? "Cuando todos terminen se desbloquea el Nivel 2."
      : "Cuando todos terminen, el equipo gana la partida.";
}

// Creates the Level 2 controller once (serif or vector) and restarts it on reset.
function ensureLevel2(kind, createFn) {
  if (!state.level2Ctl || state.level2Kind !== kind) {
    state.level2Ctl = createFn();
    state.level2Kind = kind;
    state.level2NeedsRestart = false;
  } else if (state.level2NeedsRestart) {
    state.level2Ctl.restart();
    state.level2NeedsRestart = false;
  }
}

function renderSerif() {
  showScreen("screen-serif");
  ensureLevel2("serif", () =>
    initSerif({
      onComplete: ({ score }) => {
        markLevelComplete(state.roomId, state.playerId, 2, { level_2_score: score }).catch((e) =>
          toast("No se pudo guardar el progreso: " + e.message, "error")
        );
      }
    })
  );
}

function renderVector() {
  showScreen("screen-vector");
  ensureLevel2("vector", () =>
    initVector({
      onComplete: ({ precision }) => {
        markLevelComplete(state.roomId, state.playerId, 2, { level_2_precision: precision }).catch((e) =>
          toast("No se pudo guardar el progreso: " + e.message, "error")
        );
      }
    })
  );
}

function renderVictory() {
  showScreen("screen-victory");
}

boot();
