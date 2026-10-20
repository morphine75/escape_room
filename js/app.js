// Player-side controller: registration -> lobby -> Level 1 -> wait -> Level 2 -> wait
// -> Level 3 -> wait -> Level 4 -> wait -> victory.
// The coordinator only starts the round. After that, every client unlocks the next
// level by itself as soon as all active players have cleared the current one: no
// coordinator action is needed. Screen choice is driven by the live room state.
import "./nozoom.js"; // must run first: blocks pinch / double-tap / Ctrl zoom
import { isConfigured } from "./firebase.js";
import { subscribeRoom, subscribeRooms, activePlayers, everyoneCompleted } from "./sync.js";
import {
  joinRoom, markLevelComplete, completeLevel1, completeLevel2,
  trackPresence, stopPresence, normalizeRoomId
} from "./room.js";
import { loadSession, clearSession } from "./session.js";
import { showScreen, toast, $ } from "./ui.js";
import { initLevel1 } from "./levels/level1/level1.js";
import { initVector } from "./levels/level2/vector.js";
import { initHanoi } from "./levels/level3/hanoi.js";
import { initColor } from "./levels/level4/color.js";
import { initRain } from "./digitalrain.js";
import { startMonitor, stopMonitor } from "./monitor.js";

const state = {
  roomId: null,
  playerId: null,
  name: null,
  data: null,
  // Level controllers are created once and reused; on a coordinator reset they
  // are restarted instead of re-initialised (re-init would double-bind events).
  level1Ctl: null,
  level1NeedsRestart: false,
  // Level 2 / 3 / 4 games, keyed by game ("vector", "hanoi", "color"). One
  // controller per game for the whole session: re-creating a controller would
  // bind its events twice.
  gameCtls: {},
  gamesToRestart: new Set(),
  gameStartedSeen: false,
  assigning: false,
  roomsUnsub: null, // live room list, only while the registration screen is shown
  roomsData: null,
  roomsTimeout: 0,
  presenceFor: null, // "roomId/playerId" whose presence is currently armed
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
    startSubscription();
  } else {
    showRegister();
  }
}

// --- Registration ------------------------------------------------------------

// Shows the registration screen and starts listening to the room list.
function showRegister() {
  showScreen("screen-register");
  startRoomList();
}

// Live list of rooms for the "Sala" dropdown, so players never type the code.
// Only active while registering: it reads the whole rooms node.
function startRoomList() {
  if (state.roomsUnsub) return;
  // If the list does not arrive soon (no signal), offer typing the code too.
  clearTimeout(state.roomsTimeout);
  state.roomsTimeout = setTimeout(() => {
    if (!state.roomsData) showManualRoom("La lista de salas tarda en cargar: podés escribir el código.");
  }, 6000);
  state.roomsUnsub = subscribeRooms(
    (rooms) => {
      clearTimeout(state.roomsTimeout);
      state.roomsData = rooms;
      renderRoomOptions();
    },
    (err) => {
      // e.g. PERMISSION_DENIED when database.rules.json was not re-published:
      // fall back to typing the room code so nobody is stuck.
      clearTimeout(state.roomsTimeout);
      state.roomsUnsub = null;
      console.warn("Room list unavailable:", err && err.message);
      showManualRoom("No se pudo cargar la lista de salas: escribí el código de tu sala.");
    }
  );
}

// Fallback: hide the dropdown (if it has no data) and show the code input.
function showManualRoom(message) {
  const select = $("#reg-room");
  const input = $("#reg-room-code");
  if (!state.roomsData) select.classList.add("hidden");
  input.classList.remove("hidden");
  $("#reg-join").disabled = false;
  if (message) toast(message, "warning", 5000);
}

// Room chosen in the dropdown, or typed in the fallback input.
function chosenRoom() {
  const select = $("#reg-room");
  const input = $("#reg-room-code");
  if (!input.classList.contains("hidden") && input.value.trim()) return input.value;
  return select.classList.contains("hidden") ? "" : select.value;
}

function stopRoomList() {
  clearTimeout(state.roomsTimeout);
  if (state.roomsUnsub) state.roomsUnsub();
  state.roomsUnsub = null;
}

// Rooms in the lobby can be joined; rooms already playing are listed disabled
// (joinRoom() rejects them anyway). Keeps the current choice; preselects the
// last room used on this device, or the only open room.
function renderRoomOptions() {
  const select = $("#reg-room");
  const rooms = state.roomsData || {};
  const previous = select.value || loadSession().roomId || "";
  const ids = Object.keys(rooms).sort();
  const open = ids.filter((id) => rooms[id] && rooms[id].started !== true);
  const playing = ids.filter((id) => rooms[id] && rooms[id].started === true);
  const count = (id) => Object.keys(rooms[id].players || {}).length;
  const label = (id) => `${id} · ${count(id)} jugador${count(id) === 1 ? "" : "es"}`;

  select.innerHTML = "";
  const add = (value, text, disabled = false) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    o.disabled = disabled;
    select.appendChild(o);
  };
  if (!open.length) {
    add("", "No hay salas abiertas: esperá al coordinador", true);
  } else if (open.length > 1) {
    add("", "Elegí tu sala…", true);
  }
  open.forEach((id) => add(id, label(id)));
  playing.forEach((id) => add(id, `${id} · en curso`, true));

  if (open.includes(previous)) select.value = previous;
  else if (open.length === 1) select.value = open[0];
  else select.value = "";
  // Rooms listed: the dropdown is the way in (hide the fallback input).
  select.classList.remove("hidden");
  $("#reg-room-code").classList.add("hidden");
  $("#reg-join").disabled = !open.length;
}

function wireRegister() {
  const joinBtn = $("#reg-join");
  const nameInput = $("#reg-name");

  const session = loadSession();
  if (session.name) nameInput.value = session.name;

  joinBtn.addEventListener("click", async () => {
    const roomId = normalizeRoomId(chosenRoom());
    const name = nameInput.value.trim();
    if (!roomId) { toast("Elegí la sala de tu grupo", "warning"); return; }
    if (!name) { toast("Ingresá tu nombre", "warning"); return; }

    joinBtn.disabled = true;
    try {
      const res = await joinRoom(roomId, name);
      if (!res.ok) { toast(res.error, "error"); return; }
      stopRoomList();
      state.roomId = roomId;
      state.playerId = res.playerId;
      state.name = name;
      // Fresh registration -> a fresh round for this device.
      state.gameStartedSeen = false;
      state.level1NeedsRestart = true;
      restartAllGames();
      startSubscription();
    } catch (err) {
      toast("Error al unirse: " + err.message, "error");
    } finally {
      // Still on the registration screen (join failed): refresh the list,
      // which also re-enables the button when there is an open room.
      if (state.roomsUnsub) renderRoomOptions();
      else joinBtn.disabled = false;
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
    stopPresence(state.roomId, state.playerId).catch(() => {});
    stopMonitor();
    state.presenceFor = null;
    clearSession();
    toast("La sala no existe o fue cerrada", "error");
    showRegister();
    return;
  }
  state.data = data;

  const me = (data.players && data.players[state.playerId]) || null;
  if (!me) {
    // Removed by the coordinator: cancel the pending onDisconnect write so it
    // cannot re-create this player as a nameless record.
    stopPresence(state.roomId, state.playerId).catch(() => {});
    stopMonitor();
    state.presenceFor = null;
    clearSession();
    toast("Tu registro ya no está en la sala", "error");
    showRegister();
    return;
  }

  // Arm presence once per session, and again if a network drop already fired
  // onDisconnect (connected=false) while this tab kept running.
  const presenceKey = state.roomId + "/" + state.playerId;
  if (state.presenceFor !== presenceKey || me.connected === false) {
    if (state.presenceFor !== presenceKey) startMonitor(state.roomId, state.playerId, liveState);
    state.presenceFor = presenceKey;
    trackPresence(state.roomId, state.playerId).catch(() => {});
  }

  updateHeader(me);

  if (!data.started) {
    // If the game had started and now we are back in the lobby, the coordinator
    // reset it: flag the levels so they restart for the next round.
    if (state.gameStartedSeen) {
      state.gameStartedSeen = false;
      state.level1NeedsRestart = true;
      restartAllGames();
    }
    renderLobby(data);
    return;
  }

  state.gameStartedSeen = true;

  const players = data.players;
  if (!me.level_1_completed) {
    renderLevel1(data, me);
    return;
  }
  if (!me.level_2_game) {
    // Level 1 saved but no game yet (e.g. the assignment failed or the page was
    // refreshed mid-way): assign it now.
    ensureNextGame(1);
    renderWait(data, 1);
    return;
  }
  if (!everyoneCompleted(players, "level_1_completed", state.playerId)) {
    renderWait(data, 1);
    return;
  }
  if (!me.level_2_completed) {
    renderVector();
    return;
  }
  if (!me.level_3_game) {
    ensureNextGame(2);
    renderWait(data, 2);
    return;
  }
  if (!everyoneCompleted(players, "level_2_completed", state.playerId)) {
    renderWait(data, 2);
    return;
  }
  if (!me.level_3_completed) {
    renderHanoi();
    return;
  }
  if (!everyoneCompleted(players, "level_3_completed", state.playerId)) {
    renderWait(data, 3);
    return;
  }
  if (!me.level_4_completed) {
    renderColor();
    return;
  }
  if (!everyoneCompleted(players, "level_4_completed", state.playerId)) {
    renderWait(data, 4);
    return;
  }
  renderVictory();
}

const saveError = (e) => toast("No se pudo guardar el progreso: " + e.message, "error");

// Marks `level` (1 or 2) as completed and self-assigns the next level's game in
// one transaction (room.js). `extra` carries the level result (Level 2 score /
// precision). Also used to repair a missing assignment after a refresh.
function ensureNextGame(level, extra = {}) {
  if (state.assigning) return;
  state.assigning = true;
  const done = level === 1
    ? completeLevel1(state.roomId, state.playerId)
    : completeLevel2(state.roomId, state.playerId, extra);
  done.catch(saveError).finally(() => {
    state.assigning = false;
  });
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
  const list = activePlayers(data.players, state.playerId);
  const done = list.filter((p) => p.level_1_completed === true).length;
  const total = list.length;
  $("#l1-ready").textContent = `👤 ${me.name} (${done}/${total} listos)`;

  if (!state.level1Ctl) {
    state.level1Ctl = initLevel1({
      onComplete: () => ensureNextGame(1)
    });
    state.level1NeedsRestart = false;
  } else if (state.level1NeedsRestart) {
    state.level1Ctl.newPuzzle();
    state.level1NeedsRestart = false;
  }
}

const WAIT_TEXT = {
  1: ["¡Nivel 1 superado! 📞", "Esperando al resto del equipo. El Nivel 2 empieza solo cuando todos terminen."],
  2: ["¡Nivel 2 superado! 🎯", "Esperando al resto del equipo. El Nivel 3 empieza solo cuando todos terminen."],
  3: ["¡Nivel 3 superado! 🧠", "Esperando al resto del equipo. El Nivel 4 empieza solo cuando todos terminen."],
  4: ["¡Nivel 4 superado! 🎨", "Esperando al resto del equipo. La misión termina cuando todos completen el Nivel 4."]
};

function renderWait(data, level) {
  showScreen("screen-wait");
  const key = `level_${level}_completed`;
  const list = activePlayers(data.players, state.playerId);
  const done = list.filter((p) => p[key] === true).length;
  const total = list.length;

  $("#wait-title").textContent = WAIT_TEXT[level][0];
  $("#wait-count").textContent = `${done} / ${total} completaron`;
  $("#wait-bar").style.width = total ? Math.min(100, (done / total) * 100) + "%" : "0%";
  $("#wait-hint").textContent = WAIT_TEXT[level][1];
}

// Shows a Level 2 / 3 mini-game: creates its controller the first time and
// restarts it when a coordinator reset flagged it.
function showGame(screenId, kind, createFn) {
  showScreen(screenId);
  const ctl = state.gameCtls[kind];
  if (!ctl) {
    state.gameCtls[kind] = createFn();
  } else if (state.gamesToRestart.has(kind)) {
    ctl.restart();
  }
  state.gamesToRestart.delete(kind);
}

function restartAllGames() {
  Object.keys(state.gameCtls).forEach((k) => state.gamesToRestart.add(k));
}

function renderVector() {
  showGame("screen-vector", "vector", () =>
    initVector({ onComplete: ({ precision }) => ensureNextGame(2, { level_2_precision: precision }) })
  );
}

function renderHanoi() {
  showGame("screen-hanoi", "hanoi", () =>
    initHanoi({
      onComplete: ({ moves }) =>
        markLevelComplete(state.roomId, state.playerId, 3, { level_3_moves: moves }).catch(saveError)
    })
  );
}

function renderColor() {
  showGame("screen-color", "color", () =>
    initColor({
      onComplete: ({ rounds }) =>
        markLevelComplete(state.roomId, state.playerId, 4, { level_4_rounds: rounds }).catch(saveError)
    })
  );
}

// --- Live monitor --------------------------------------------------------------

// Mini-game shown on each screen (keys of state.gameCtls).
const SCREEN_GAME = {
  "screen-vector": "vector",
  "screen-hanoi": "hanoi",
  "screen-color": "color"
};

// Snapshot of what this phone is showing, published by js/monitor.js only while
// the coordinator is watching this player from the dashboard.
function liveState() {
  const screen = document.body.dataset.screen || "";
  const live = { screen };
  const ctl = screen === "screen-level1" ? state.level1Ctl : state.gameCtls[SCREEN_GAME[screen]];
  if (ctl && ctl.snapshot) live.game = ctl.snapshot();
  if (screen === "screen-wait") {
    live.wait = { title: $("#wait-title").textContent, count: $("#wait-count").textContent };
  }
  return live;
}

function renderVictory() {
  showScreen("screen-victory");
}

boot();
