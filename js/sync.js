// Real-time synchronization with the room node (design section 6.1).
import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Subscribes to live room updates. Returns the unsubscribe function.
export function subscribeRoom(roomId, onData, onError) {
  const roomRef = ref(db, `rooms/${roomId}`);
  return onValue(
    roomRef,
    (snapshot) => onData(snapshot.val()),
    (error) => {
      if (onError) onError(error);
    }
  );
}

export function countCompleted(players, field) {
  return Object.values(players || {}).filter((p) => p && p[field] === true).length;
}

// Players that gate a level: everyone still connected (plus `selfId`, so a
// player never waits on their own presence flag). A player who dropped out does
// not block the rest of the group; they rejoin the flow when they reconnect.
export function activePlayers(players, selfId) {
  return Object.entries(players || {})
    .filter(([id, p]) => p && (p.connected !== false || id === selfId))
    .map(([, p]) => p);
}

// True once every active player has `field === true`: the next level unlocks
// for the whole group at that moment, with no coordinator action.
export function everyoneCompleted(players, field, selfId) {
  const list = activePlayers(players, selfId);
  return list.length > 0 && list.every((p) => p[field] === true);
}

// Subscribes to the whole `rooms` node (coordinator room list). Returns the
// unsubscribe function.
export function subscribeRooms(onData, onError) {
  return onValue(
    ref(db, "rooms"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => {
      if (onError) onError(error);
    }
  );
}
