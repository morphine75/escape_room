# Hack the Institute: Mission Zero

Real-time, collaborative web escape room for visiting high-school groups.
Plain HTML5 + CSS3 + Vanilla JS (ES6 modules) with **Firebase Realtime Database**.
No build step, no framework.

## Project structure

```
escape_room/
├── index.html            # Player app (registration → lobby → Nivel 1 → 2 → 3 → 4 → victoria)
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
│       ├── level2/          # serif.js + vector.js
│       ├── level3/          # hanoi.js + robot.js (Laboratorio de Algoritmos)
│       └── level4/          # color.js (Color: armonías de color)
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

It also **rejects player records without a `name`**, so a stray write to a removed player
(e.g. a delayed `onDisconnect`) can never re-create it as a nameless "ghost" player.
The `live` node holds the coordinator's "👁️ Ver pantalla" data (see the design doc, decision #20).
**Re-publish the rules in the Firebase console whenever this file changes.**

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
5. A player who clears Nivel 1 waits for the group; when **every connected player** is done,
   Nivel 2 starts **by itself on every phone** — no coordinator action, the dashboard does not
   even need to be open (a player alone in the room advances immediately). Each client assigns
   itself `serif` or `vector` (whichever has fewer players so far, keeping the split balanced).
6. Each player solves their Nivel 2 mini-game. In "I Shot The Serif" only **2 errors** are
   allowed: the 2nd wrong tap restarts the round. In "Shape Type" the curve is **random every round**
   and has **two control points** to drag into place (≥ 85% each). Finishing it assigns the Nivel 3 game
   (`hanoi` or `robot`, balanced the same way).
7. When every connected player completes Nivel 2, **Nivel 3 (Laboratorio de Algoritmos)**
   starts by itself: **Torres de Hanoi** (move 4 disks A → C with stack rules) or
   **Robot Ciego** (write the whole program, then run it; a crash highlights the bad command).
8. When every connected player completes Nivel 3, **Nivel 4 (Color)** starts for everyone: a
   colour wheel with six stages — HUE, SATURATION, COMPLEMENTARY, ANALOGOUS, TRIADIC,
   TETRADIC. Each colour has a 20 s timer; when it runs out a new colour appears, until
   all six are matched.
9. When every connected player completes Nivel 4, everyone sees the group-victory screen.

### Nivel 1 controls

| Input | Action |
|-------|--------|
| Arrow keys / WASD / on-screen D-pad | Move (keeps moving in the chosen direction, Pac-Man style) |
| Space / `F` / 🔫 DISPARAR | Fire a projectile in the facing direction: freezes the agent it hits for 4 s (3 rounds) |
| `B` / ⚔️ BYPASS | Rebuild the maze live and move the phone (3 uses, 1.5 s cooldown) |
| `E` / 🧊 ENCRYPT | Freeze the nearest agent for 5 s (1 use) |

Ammo and uses refill on every new attempt. All Nivel 1 messages appear in the status line
above the board (no pop-up notifications over the controls).

### Coordinator controls

- **▶️ Iniciar partida**: starts the round (unlocks Nivel 1).
- **🔄 Reiniciar partida**: resets the round and returns to the lobby, keeping the
  registered players. Their progress is cleared so the same group can replay.
- **🧹 Vaciar sala**: deletes every registered player and returns to the lobby,
  ready for a brand-new group.

- **🗑️ Eliminar sala**: available from the room list or inside a room, only when the room
  has **no players** (use *Vaciar sala* first). The code stays filled in, so **Crear sala**
  re-creates it with the same code.

- **👁️ per player** (roster): opens a live view of what that player's phone is showing:
  a visual replica of the current screen (maze, letters, curve, towers, robot grid…) plus
  the key game data, updated every ~0.5 s. The phone only sends data while
  someone is watching it.
- **🗑️ per player** (roster): removes one player from the room; their phone returns to the
  registration screen. Nameless records are flagged **⚠️ sin nombre** so stray entries can be
  cleaned up. The roster also shows each player's connection (🟢 / ⚫).

The setup screen lists every existing room (players and status) with *Abrir* and 🗑️.
Both reset actions ask for confirmation. When the room returns to the lobby, the
players' open tabs go back to the lobby automatically and the levels restart cleanly
on the next **Iniciar partida** — no page reload needed.

## Resolved design decisions

See `system_design_architecture.md` section 9 (grid size, Serif timeout, Shape Type
tolerance, single writer for `current_phase`, Level 2 assignment, no Phase 3, presence,
reset / replay, Level 1 digital rain, the real-time Level 1 arcade, automatic client-side
group progression, 1 agent and status-line messages in Nivel 1, the 2-error limit in Serif, Nivel 3 and Nivel 4).
