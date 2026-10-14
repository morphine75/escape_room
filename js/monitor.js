// Live monitor (player side): lets the coordinator watch what is happening on
// this player's screen from the dashboard ("👁️ Ver pantalla").
//
// Nothing is sent unless someone is watching. The dashboard registers itself
// under live/{roomId}/{playerId}/watchers/{dashboardId}; while that node has
// any watcher, this client publishes a small snapshot of its current screen to
// live/{roomId}/{playerId}/state every PUBLISH_MS (only when it changed, plus a
// heartbeat every HEARTBEAT_MS so the dashboard can tell a frozen phone from a
// quiet one).
//
// The data lives OUTSIDE rooms/{roomId}: every player listens to the whole room
// node, so mirroring there would broadcast each update to all phones.
import { db } from "./firebase.js";
import { ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const PUBLISH_MS = 500;
const HEARTBEAT_MS = 4000;

let unwatch = null;
let timer = 0;
let provider = null;
let path = null;
let last = "";
let lastSent = 0;
let seq = 0;

// Starts listening for watchers. `getState()` returns a plain object describing
// the current screen (see liveState() in app.js).
export function startMonitor(roomId, playerId, getState) {
  stopMonitor();
  provider = getState;
  path = `live/${roomId}/${playerId}`;
  unwatch = onValue(
    ref(db, path + "/watchers"),
    (snap) => {
      const watchers = snap.val();
      if (watchers && Object.keys(watchers).length) begin();
      else end();
    },
    () => end() // e.g. rules not published yet: just stay silent
  );
}

export function stopMonitor() {
  if (unwatch) unwatch();
  unwatch = null;
  end();
}

function begin() {
  if (timer) return;
  last = "";
  publish();
  timer = setInterval(publish, PUBLISH_MS);
}

function end() {
  if (timer) clearInterval(timer);
  timer = 0;
}

function publish() {
  if (!provider || !path) return;
  let state;
  try {
    // JSON round trip drops `undefined` values, which Firebase rejects.
    state = JSON.parse(JSON.stringify(provider()));
  } catch (_) {
    return;
  }
  state.hidden = document.hidden; // app in the background / screen locked
  const json = JSON.stringify(state);
  const now = Date.now();
  if (json === last && now - lastSent < HEARTBEAT_MS) return;
  last = json;
  lastSent = now;
  // `seq` makes every write a real change, so the heartbeat reaches the
  // dashboard even when nothing else changed.
  set(ref(db, path + "/state"), { ...state, seq: ++seq }).catch(() => {});
}
