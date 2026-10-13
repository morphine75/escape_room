# Hack the Institute: Mission Zero

Real-time, collaborative web escape room for visiting high-school groups.
Plain HTML5 + CSS3 + Vanilla JS (ES6 modules) with **Firebase Realtime Database**.
No build step, no framework.

## Project structure

```
escape_room/
├── index.html            # Player app (registration → lobby → Nivel 1 → Nivel 2 → victoria)
├── dashboard.html        # Coordinator / projector screen
├── css/                  # base + level1 + level2 + dashboard styles
├── js/
│   ├── firebase-config.js   # <-- put YOUR Firebase config here
│   ├── firebase.js          # SDK init
│   ├── session.js           # localStorage session (resume after refresh)
│   ├── ui.js                # toasts, screens, haptics
│   ├── room.js              # room + player operations
│   ├── sync.js              # realtime listeners
│   ├── app.js               # player controller
│   ├── dashboard.js         # coordinator controller
│   └── levels/
│       ├── level1/          # generator.js + level1.js (Matrix Protocol)
│       └── level2/          # serif.js + vector.js
├── database.rules.json   # Firebase rules (see warning below)
└── plan/                 # construction plan
```

## 1. Create the Firebase project

1. In the [Firebase console](https://console.firebase.google.com/) create a project.
2. **Build → Realtime Database → Create database** (choose a region).
3. **Project settings → General → Your apps → Web app** and copy the config object.

## 2. Configure the app

Open `js/firebase-config.js` and replace every `REPLACE_ME` value with your project's
config. `databaseURL` is required (this project uses the Realtime Database, not Firestore):

```js
export const firebaseConfig = {
  apiKey: "…",
  authDomain: "…",
  databaseURL: "https://<your-project>-default-rtdb.firebaseio.com",
  projectId: "…",
  storageBucket: "…",
  messagingSenderId: "…",
  appId: "…"
};
```

## 3. Database rules

`database.rules.json` currently allows **public read/write** — quick for running events,
but insecure. Paste it into **Realtime Database → Rules** for a quick start, or tighten it
(e.g. restrict by room) before exposing the app publicly.

## 4. Run locally

ES modules require an HTTP server (opening the file directly with `file://` will not work).
With XAMPP, place the project under `htdocs/` and open:

```
http://localhost/escape_room/index.html
http://localhost/escape_room/dashboard.html
```

## 5. Deploy to your own hosting

Upload the whole folder (it is fully static). Only `index.html`, `dashboard.html`,
`css/`, and `js/` are needed at runtime; `plan/`, `*.md` and `database.rules.json`
are optional. The host must return `text/javascript` for `.js` files.

HTTPS is **not** required: the Realtime Database works over plain HTTP too (verified),
so a simple HTTP host is enough.

## How a round works

1. Coordinator opens `dashboard.html`, creates a room and sets `N` (required players).
2. Players open `index.html`, enter the room code and their name → realtime lobby.
3. Coordinator presses **Iniciar partida**.
4. Everyone plays **Nivel 1 (Matrix Protocol)** individually: a real-time 7×7 maze
   arcade where they must reach the wandering phone booth 📞 while an agent 🕵🏻 chases
   them (see controls below). Getting caught restarts with a new maze, attempts are unlimited.
5. As soon as a player clears Nivel 1 they go **straight to Nivel 2** — no waiting for the
   rest of the group or for the coordinator. Their client assigns them `serif` or `vector`
   (whichever has fewer players so far, keeping the split balanced).
6. Each player solves their Nivel 2 mini-game. In "I Shot The Serif" only **2 errors** are
   allowed: the 2nd wrong tap restarts the round.
7. Finishing Nivel 2 shows the mission-complete screen with a live team counter; when
   everyone is done it reads "¡Todo el equipo completó la misión!".

### Nivel 1 controls

| Input | Action |
|-------|--------|
| Arrow keys / WASD / on-screen D-pad | Move (keeps moving in the chosen direction, Pac-Man style) |
| Space / `F` / 🔫 DISPARAR | Fire a projectile in the facing direction: freezes the agent it hits for 4 s (3 rounds) |
| `B` / ⚔️ BYPASS | Rebuild the maze live and move the phone (3 uses, 1.5 s cooldown) |
| `E` / 🧊 ENCRYPT | Freeze the nearest agent for 5 s (1 use) |

Ammo and uses refill on every new attempt.

### Coordinator controls

- **▶️ Iniciar partida**: starts the round (unlocks Nivel 1).
- **🔄 Reiniciar partida**: resets the round and returns to the lobby, keeping the
  registered players. Their progress is cleared so the same group can replay.
- **🧹 Vaciar sala**: deletes every registered player and returns to the lobby,
  ready for a brand-new group.

Both reset actions ask for confirmation. When the room returns to the lobby, the
players' open tabs go back to the lobby automatically and the levels restart cleanly
on the next **Iniciar partida** — no page reload needed.

## Resolved design decisions

See `system_design_architecture.md` section 9 (grid size, Serif timeout, Shape Type
tolerance, single writer for `current_phase`, Level 2 assignment, no Phase 3, presence,
reset / replay, Level 1 digital rain, the real-time Level 1 arcade, individual automatic
progression, 1 agent without capture toasts, and the 2-error limit in Serif).
