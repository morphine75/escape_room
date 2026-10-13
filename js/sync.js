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

export function allCompleted(players, field, required) {
  const list = Object.values(players || {});
  const total = Number(required) || list.length;
  if (list.length < total) return false;
  return list.filter((p) => p && p[field] === true).length >= total;
}
