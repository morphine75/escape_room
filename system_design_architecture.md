# 🎨 DESIGN.md — Hack the Institute: Mission Zero

## 📌 1. Overview

**Event Name:** Hack the Institute: Mission Zero
**General Theme:** Collaborative, real-time digital infiltration / escape room.
**Target Platform:** Mobile web (responsive, portrait-first) + a projectable dashboard for the event's central screen.
**Tech Stack:** HTML5, CSS3 (CSS Grid/Flexbox), JavaScript ES6+ (no heavy frameworks) and Firebase Realtime Database.

**Game structure:**

| Level | Name | Type |
|-------|------|------|
| 1 | Matrix Protocol (The Hacker Escape) | Real-time maze arcade (Pac-Man style) |
| 2 | Typography & Vector Design (two mini-games in parallel) | Typographic agility / curve adjustment |
| 3 | Not implemented — the game concludes after Level 2 | — |

---

## 🏗️ 2. System Architecture

The application is a Serverless Real-Time Web App.

```
[ Student Phones (HTML/CSS/JS) ] <--- WebSockets / Long-Polling ---> [ Firebase Realtime Database ]
                                                                             ^
[ Coordinator Screen / Projector ] <----------------------------------------|
```

---

## 🗄️ 3. Data Model (Firebase Realtime Database)

The structure is flat and lightweight to allow low-latency real-time synchronization.

```json
{
  "rooms": {
    "ROOM-101": {
      "current_phase": 1,
      "started": false,
      "required_players": 10,
      "level_1_unlocked": true,
      "level_2_unlocked": false,
      "created_at": 1728345600,
      "players": {
        "player_abc123": {
          "name": "Neo_404",
          "connected": true,
          "level_1_completed": true,
          "level_2_game": "serif",
          "level_2_completed": false,
          "level_2_score": 400,
          "last_changed": 1728345600
        },
        "player_def456": {
          "name": "Trinity_7",
          "connected": true,
          "level_1_completed": true,
          "level_2_game": "vector",
          "level_2_completed": false,
          "level_2_precision": 0,
          "last_changed": 1728345605
        }
      }
    }
  }
}
```

**Field reference:**

| Field | Description |
|-------|-------------|
| `current_phase` | Legacy room phase. Since decision #12 players advance individually, so no client reads it; the dashboard only resets it to `1` when the room returns to the lobby. |
| `started` | `false` while the room is in the lobby; set to `true` when the coordinator starts the round. Distinguishes the lobby from Level 1. |
| `required_players` | Target number of players needed to start and advance. |
| `level_1_completed` / `level_2_completed` | Individual progress per level. |
| `level_2_game` | Assigned mini-game: `"serif"` ("I Shot The Serif") or `"vector"` ("Shape Type"). Self-assigned by the client when it clears Level 1 (section 7.1). |
| `level_2_score` | Score accumulated in "I Shot The Serif" (+100 per correct serif). |
| `level_2_precision` | Precision achieved in "Shape Type" (≥ 85% required to pass). |
| `connected` | Presence flag maintained via `onDisconnect()`; `false` when the device drops offline. |
| `last_changed` | Timestamp (epoch) of the player's last update. |

> **Note:** Use a single timestamp format everywhere (epoch via `ServerValue.TIMESTAMP` is recommended).

> **Resolved (presence / disconnection):** each client registers an `onDisconnect()` handler that flips `connected` to `false`, and stores its `roomId`/`playerId` in `localStorage` so a browser refresh resumes the same session.

---

## 🔄 4. Application State & Flow

```
[ Screen 1: Registration ]
         │
         ▼ (Submit name)
[ Screen 2: Waiting Lobby ] ─── (Real-time listener counts connected players)
         │
         ▼ (Coordinator presses "Start round" → started = true)
[ Screen 3: Level 1 - Matrix Protocol ] ─── (Generates a local 7×7 maze + real-time game loop)
         │      ↺ (Caught by the Agent → new maze, retry; unlimited attempts)
         ▼ (Player intercepts the wandering phone booth 📞)
[ Transition: "Level 1 cleared — loading Level 2…" ]
         │
         ▼ (Client self-assigns serif / vector in a transaction — no waiting for the group or the coordinator)
[ Screen 6a: Level 2 - "I Shot The Serif" ] ──────┐
         │ (30 s timer, max 2 errors, eliminate serifs) │
[ Screen 6b: Level 2 - "Shape Type" ] ────────────┤ (Each player plays their own game)
         │ (Drag nodes to match vector curves)     │
         ▼                                          │
[ Screen 8: Mission Complete ] <───────────────────┘
           (Shows live team progress "X / N completed"; turns into
            "the whole team completed the mission" when everyone finishes)
```

> **Individual progression (decision #12):** the coordinator only starts the round. From then on each client moves to the next level **as soon as the player clears the current one**; nobody waits for the rest of the group or for a coordinator action. Screen choice depends only on the player's own `level_1_completed` / `level_2_completed` / `level_2_game`.

> **Reset / replay:** the coordinator can return the room to the lobby at any time. **Restart round** keeps the registered players and clears their progress; **Wipe room** removes all players. Both take effect in real time on every player's device (see section 8.4).

---

## 🕵🏻 5. LEVEL 1: Matrix Protocol (The Hacker Escape)

### 5.1. Narrative & Aesthetics

* **Concept:** Participants are trapped inside the Matrix simulation. To free the whole team (10 participants), each one must move through their personal maze in real time, dodge the chasing Agent, and reach the (moving) phone booth to escape.
* **Color Palette:**
  * Background: `#0d1117` / `#000000` (deep black).
  * Digital rain and accents: `#00ff66` / `#00ff41` (Matrix neon green).
  * Alerts / errors: `#ff0055` (neon red) / `#ffb700` (amber).
  * Secondary text: `#a3b8cc` (cool gray).
* **Typography:** Monospace (`Courier New`, `Consolas`, or `Fira Code`).
* **Ambience — animated "digital rain" (implemented):** an animated canvas (`<canvas id="digital-rain">`, logic in `js/digitalrain.js`) falls behind the Level 1 screen. Columns of katakana / Latin / binary glyphs in Matrix green descend, each led by a bright, glowing **"shining" head glyph** with a fading trail. It is drawn at ~50 % opacity so the board and controls stay legible, runs only while the Level 1 screen is visible **and** the tab is in the foreground (paused and cleared otherwise), and falls back to a single static frame when the user prefers reduced motion.

### 5.2. Mobile Layout (Portrait / 100vh)

```text

+------------------------------------+
| 😎 MATRIX OS v1.0                  | <-- Header
| 🎯 Intento 3    Llegá al 📞 y ...   | <-- HUD: attempt counter + status line
+------------------------------------+
|  [😎][  ][▓▓][  ][  ][  ][  ]      |
|  [  ][▓▓][  ][  ][▓▓][🕵🏻][  ]      | <-- ZONE 1: 7×7 maze board
|  [  ][  ][  ][▓▓][  ][  ][  ]      |     (open cells + walls ▓▓; tokens
|  [▓▓][  ][•→][  ][  ][▓▓][  ]      |      float above the grid: hero 😎,
|  [  ][  ][▓▓][  ][🕵🏻❄][  ][📞]      |      1 Agent 🕵🏻, phone 📞,
|  [  ][▓▓][  ][  ][  ][▓▓][  ]      |      projectiles •)
|  [  ][  ][  ][▓▓][  ][  ][  ]      |
+------------------------------------+
|             [ ⬆️ ]                 |
|       [ ⬅️ ]        [ ➡️ ]          | <-- ZONE 2: touch D-pad
|             [ ⬇️ ]                 |
+------------------------------------+
| [        🔫 DISPARAR  (3)        ] | <-- ZONE 3: actions (remaining uses)
| [ ⚔️ BYPASS (3) ] [ 🧊 ENCRYPT (1) ] |
| Flechas/WASD · ESPACIO · B · E     | <-- Keyboard help
+------------------------------------+

```

The whole Matrix digital rain keeps running behind the board (section 5.1).

### 5.3. Level 1 Game Mechanics

Level 1 is a **real-time arcade** in the spirit of Pac-Man (it replaced the earlier "build a command list and run it" design; see section 9 #11). Implementation: `js/levels/level1/generator.js` (maze) and `js/levels/level1/level1.js` (engine).

1. **Board components (procedural 7×7 maze — `GRID_SIZE = 7`):**
   * **Hacker (`😎`):** starts at `(0, 0)`, moved by the player.
   * **Open cells / walls (`▓`):** walls are impassable for every token and for projectiles.
   * **Agent (`🕵🏻`) ×1 (`AGENT_COUNT = 1` in `generator.js`):** chases the hacker in real time. Each step it picks the neighbouring cell with the shortest BFS distance to the hacker, never reverses direction (unless in a dead end) and breaks ties randomly. The engine supports more agents (they avoid stepping onto each other) by raising `AGENT_COUNT`.
   * **Phone booth (`📞`):** the goal. It **wanders randomly** (moves on ~60 % of its ticks, so it sometimes stays still and can be caught) and never steps onto the hacker.
   * **Projectiles (`•`):** fired by the hacker; they travel in a straight line until they hit a wall, leave the grid or hit an agent.

2. **Controls (zero typing):**
   * **Movement:** arrow keys / WASD or the on-screen D-pad. It uses a persistent *desired direction* (Pac-Man style): the hacker keeps moving and turns as soon as the requested direction is open.
   * **🔫 DISPARAR** (Space / `F`) — **3 rounds** per attempt. Fires a projectile in the facing direction (right if the hacker has not moved yet). An agent hit is **frozen for 4 s**.
   * **⚔️ BYPASS** (`B`) — **3 uses** per attempt, **1.5 s cooldown**. Rebuilds the maze walls live (keeping the hacker's and agents' cells open and the maze fully connected) and relocates the phone to a far reachable cell.
   * **🧊 ENCRYPT** (`E`) — **1 use** per attempt. Freezes the nearest active agent (by BFS distance) for **5 s**.
   * A frozen agent is drawn in blue with a `❄` badge and cannot catch the hacker.

3. **Timing (tunable constants in `level1.js`):**

   | Constant | Value | Meaning |
   |----------|-------|---------|
   | `HERO_MS` | 150 ms | time per cell for the hacker |
   | `AGENT_MS` | 300 ms | time per cell for each agent (half the hacker's speed) |
   | `PHONE_MS` | 420 ms | phone wander tick (`PHONE_MOVE_CHANCE = 0.6`) |
   | `PROJ_MS` | 70 ms | projectile step |
   | `FREEZE_SHOT_MS` / `FREEZE_ENCRYPT_MS` | 4000 / 5000 ms | freeze durations |

   The game loop runs on `requestAnimationFrame` with fixed-step accumulators per entity (frame delta clamped to 150 ms). It **only runs while the Level 1 screen is visible and the tab is in the foreground** (`MutationObserver` on `body[data-screen]` + `visibilitychange`).

4. **Win / lose:**
   * **Success:** the hacker reaches the `📞` cell → the loop stops, `onComplete()` calls `completeLevel1()` (section 7.1), which writes `level_1_completed: true` and the Level 2 game in one transaction → the player goes **straight to Level 2**.
   * **Caught:** an active (not frozen) agent shares the hacker's cell → the attempt counter increases and the level **restarts with a brand-new maze**, positions and power-ups. Attempts are unlimited. **No toast is shown** (toasts sit at the bottom of the screen, over the D-pad and action buttons, and blocked play); the restart is reported in the HUD status line ("🚨 ¡Te atraparon! Laberinto nuevo") plus a vibration.

5. **Procedural generation:**
   * Each client generates its own maze locally (zero server load) with random walls, retried until the maze is **fully connected** — every open cell is reachable from the start — so the agents can always chase and the phone is always reachable.
   * The phone spawns among the farthest reachable cells; the agent spawns far from the hacker (BFS distance ≥ 4).

> **Resolved (grid size):** the maze is **7×7** (`GRID_SIZE`). `REQUIREMENTS.md` (FR-2.1) specifies 4×4; the discrepancy is intentional and the design prevails (see section 9 #1 and #11).

### 5.4. Maze Generation (pseudocode)

```javascript
const GRID_SIZE = 7;
const AGENT_COUNT = 1;
const WALL_DENSITY = 0.26;   // chance of a wall per cell
const MIN_OPEN_RATIO = 0.62; // keep at least 62 % of cells open
const CONNECT_ATTEMPTS = 500;

// Random walls, retried until every open cell is reachable from keepOpen[0].
function makeSolvableWalls(size, keepOpen) {
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt++) {
    const walls = randomGrid(size, WALL_DENSITY);
    keepOpen.forEach(c => (walls[c.y][c.x] = false));
    if (countOpen(walls) < Math.ceil(size * size * MIN_OPEN_RATIO)) continue;
    if (!allReachable(walls, keepOpen[0])) continue; // BFS flood fill
    return walls;
  }
  return emptyWalls(size); // fallback: fully open board
}

function generateLevel1(size = GRID_SIZE) {
  const start = { x: 0, y: 0 };
  const walls = makeSolvableWalls(size, [start]);
  const dist = bfsDistances(walls, size, start);
  const phone = pickAmongFarthest(reachableCells, dist, 0.3);  // top 30 % farthest
  const agents = [randomCell(cellsWithDist(dist, ">= 4"))];    // far from the hero
  while (agents.length < AGENT_COUNT) agents.push(farthestFrom(agents.at(-1))); // AGENT_COUNT = 1
  return { size, walls, hero: start, phone, agents };
}

// BYPASS reuses makeSolvableWalls, keeping the hero's and agents' cells open.
const regenerateWalls = (size, keepOpen) => makeSolvableWalls(size, keepOpen);
```

### 5.5. UI Design System Guidelines
  * **Color Palette:**
    * Background: Pure Black (`#000000`) & Dark Slate (`#0d1117`)
    * Primary Accent: Matrix Green (`#00ff66` / `#00ff41`)
    * Alerts / Errors: Neon Red (`#ff0055`)
    * Agents / BYPASS: Warning Amber (`#ffb700`); DISPARAR / projectiles: Neon Red (`#ff0055`); ENCRYPT / frozen agents: Ice Blue (`#58c8ff`)
  * **Typography:** Monospace (`Courier New`, `Consolas`, `Fira Code`).
  * **Touch Targets:** Minimum $44 \times 44\text{px}$ touch targets across all mobile controls.

---

## ⚙️ 6. Firebase Synchronization

### 6.1. Real-Time Listener (Client JS)

Each client subscribes to its room and picks its screen **from its own progress only** (`js/app.js`):

```javascript
onValue(ref(db, `rooms/${roomId}`), (snapshot) => {
  const data = snapshot.val();
  const me = data?.players?.[playerId];
  if (!data || !me) return backToRegistration();

  if (!data.started) return renderLobby(data);            // coordinator has not started yet
  if (!me.level_1_completed) return renderLevel1(data);
  if (!me.level_2_completed) {
    if (me.level_2_game === "serif") return renderSerif();
    if (me.level_2_game === "vector") return renderVector();
    completeLevel1(roomId, playerId);                      // assignment missing (e.g. refresh)
    return renderLoadingLevel2();
  }
  renderMissionComplete(data);                              // live team counter X / N
});
```

> **Resolved (decision #12):** there are no group-wide phase transitions any more. The coordinator only writes `started` (start / reset); each player advances on their own.

### 6.2. Marking Individual Progress

```javascript
// Level 1: mark it and self-assign the Level 2 game atomically (section 7.1).
await completeLevel1(roomId, playerId);

// Level 2: mark it and store the score / precision.
update(ref(db, `rooms/${roomId}/players/${playerId}`), {
  level_2_completed: true,
  level_2_score: score,            // or level_2_precision
  last_changed: serverTimestamp()
});
```

---

## 🔠 7. LEVEL 2: Typography & Vector Design

### 7.1. Game Distribution & Assignment Logic

**Distribution algorithm (client-side, decision #12):**
- When a player clears Level 1, their client runs a `runTransaction()` over `rooms/{roomId}/players` (`completeLevel1()` in `js/room.js`).
- Inside the transaction it counts how many **other** players already have `serif` and `vector`, and assigns itself the game with fewer players (ties → `serif`), together with `level_1_completed: true`.
- The transaction makes concurrent completions safe: if two players finish at the same time, one of them is retried with fresh data, so the split stays balanced.
- An already assigned game is never changed (a retry after a refresh keeps it).
- **Example:** 10 players → 5 serif, 5 vector. 11 players → 6 serif, 5 vector (whatever order they finish in).

---

### 7.2. Game A: "I Shot The Serif" (Typographic Agility)

#### 7.2.1. Objective
Eliminate all letters displayed with **serifs** before the 30-second timer expires.

#### 7.2.2. Mobile Layout (Portrait)

```text
+------------------------------------+
| ⏱️ 22s   |  ❌ 1/2  |  🎯 400       |
+------------------------------------+
|                                    |
|     [ T ] (Serif)    [ A ] (Sans)  |
|         (Tap)            (Tap)     |
|                                    |
|     [ R ] (Sans)     [ G ] (Serif) |
|         (Tap)            (Tap)     |
|                                    |
|     [ M ] (Serif)    [ E ] (Sans)  |
|         (Tap)            (Tap)     |
|                                    |
+------------------------------------+
|     Tap ONLY the typefaces         |
|         WITH SERIFS!               |
+------------------------------------+
```

#### 7.2.3. Game Mechanics

**Display grid:** 3×3 or 4×4 grid of random letters ($A$–$Z$).

**Font families:**
- **Serif fonts** (must tap): Times New Roman, Garamond, Georgia, Courier New.
- **Sans-serif fonts** (must avoid): Helvetica, Arial, Inter, Verdana, Open Sans.

**Player interaction:**
1. The grid shows letters in random serif / sans-serif fonts.
2. The player taps only letters with **serifs**.
3. Tapping a serif letter:
   - The letter explodes / disappears.
   - +100 points.
   - Short haptic vibration.
4. Tapping a sans-serif letter (mistake):
   - Visual error warning: "❌ Error: That's Sans Serif!" and the error counter in the header goes up (`❌ 1/2`).
   - **Only 2 errors are allowed per round** (`MAX_ERRORS = 2`): the 2nd error **restarts the round** with a new grid, a full timer, and score / errors back to zero.
5. **Success condition:** All serif letters eliminated, or the timer reaches zero.
   - If all serifs are eliminated: `level_2_completed: true` and the score is saved in `level_2_score`.
   - The player moves straight to the mission-complete screen (with the live team counter).

> **Resolved:** if the timer hits zero without completion, the game **automatically restarts with a new grid**. No penalty is applied and the player is never blocked, so the rest of the group is not held up.

#### 7.2.4. Timing & Scoring
- **Timer:** 30 seconds.
- **Points:** +100 per correctly identified serif letter.
- **Errors:** max 2 per round; the 2nd error restarts the round.
- **Pass condition:** Eliminate all serif fonts before time expires and before the 2nd error.

---

### 7.3. Game B: "Shape Type" (Vector Curve Adjustment)

#### 7.3.1. Objective
Reconstruct the original shape of a letter/logo by dragging deformed **Bézier curve nodes** to match the target silhouette. A **precision of ≥ 85%** is required to pass.

#### 7.3.2. Mobile Layout (Portrait)

```text
+------------------------------------+
| ✏️ Vector Adjust | Precision: 92%  |
+------------------------------------+
|                                    |
|                . - - - .           |
|              /           \         |
|             |     (🔴)----| <--Draggable
|              \           /     Node |
|                ` - - - '           |
|          (Dotted Guide Silhouette) |
|                                    |
|         [↙️ Drag the Red Node]     |
|                                    |
+------------------------------------+
|  Drag the red dot to correct       |
|  the curve of the letter.          |
|                                    |
|  Required precision: 85% ✓         |
+------------------------------------+
```

#### 7.3.3. Game Mechanics

**Setup:**
- A large letter or icon (e.g., 'a', 'g', 'S', or a career-related logo) is displayed with **one or more Bézier nodes displaced from their correct position**.
- A **dotted guide silhouette** shows the correct, harmonic shape.

**Player interaction:**
1. The player identifies the misplaced red node (🔴).
2. The player **drags (touch & drag)** the node across the canvas.
3. Real-time precision calculation:
   - The distance between the current node position and the target is computed continuously.
   - The header updates live: `Precision: 92%`.
4. When the node is released:
   - Final precision is calculated.
   - **Pass (≥ 85%):** the letter "comes to life" with a success animation (glow, pulse, scale-up), `level_2_completed: true`, and `level_2_precision` is stored in Firebase.
   - **Fail (< 85%):** brief error feedback ("Not precise enough, try again"), the node resets to its original position, and the player can retry.

#### 7.3.4. Precision Calculation Algorithm

```javascript
// Pseudocode for precision calculation
// `tolerance` is scaled to the canvas: ~8% of its shorter side (≈ 40–60 px on mobile)
function calculatePrecision(currentNodePos, targetNodePos, tolerance) {
  const distance = Math.hypot(
    currentNodePos.x - targetNodePos.x,
    currentNodePos.y - targetNodePos.y
  );
  const precision = Math.max(0, 100 - (distance / tolerance) * 100);
  return Math.round(precision);
}
```

> **Resolved:** `tolerance = 20` is rejected as unplayable on touchscreens (85% would require landing within ~3 px). The tolerance is **scaled to the canvas**, using a success radius of ≈ 8% of the canvas' shorter side (≈ 40–60 px on mobile).

---

## 🎨 8. UI/UX Design System

### 8.1. Level 1 (Matrix theme)

* **Colors:** see section 5.1.
* **Typography:** Monospace.
* **Effects:** Animated **digital rain** canvas background (see sections 5.1 and 9 #10), neon-green glow on the board and the hacker, pulsing phone booth, smooth token movement between cells (CSS `transform` transitions), blue `❄` state for frozen agents.

### 8.2. Level 2 and the rest of the app

* **Color Palette:**
  * Background: Dark Navy (`#0f172a`)
  * Cards / containers: Slate Blue (`#1e293b`)
  * Accent / primary action: Electric Blue (`#2563eb`)
  * Success / unlock state: Emerald Green (`#22c55e`)
  * Warning / progress state: Amber Yellow (`#f59e0b`)
  * Error / incorrect action: Red (`#ef4444`)
* **Typography:** Sans-serif, bold, easily readable on mobile displays.

> **Suggestion:** To keep immersion, add a "glitch" transition between Level 1 (Matrix) and Level 2, as if the system were rebooting with a different look.

### 8.3. Shared rules

* **Touch targets:** Minimum $44 \times 44\text{px}$.
* **Components:** Responsive cards, touchable directional controls, dynamic progress bars, draggable vector nodes.
* **Haptic feedback:** Short vibration on serif elimination (Game A); gentle pulse on node drag (Game B); short vibrations on firing, hitting an agent, BYPASS, ENCRYPT, being caught and reaching the phone (Level 1).
* **Animations:**
  * Smooth cell-to-cell movement of every token and a frozen (`❄`) effect when an Agent is neutralized (Level 1).
  * Letter explosion on correct taps (Game A).
  * Node "snap-to-target" animation when precision ≥ 85% (Game B).
  * Success glow/pulse when each objective is met.

### 8.4. Coordinator Dashboard

Big-screen panel used by the facilitator and the only place with room-level controls. Players advance between levels on their own (decision #12), so the dashboard does not drive phase transitions.

* **Live view:** room code, status (Lobby / En curso / Finalizado), joined / required players, a per-player roster (Level 1 ✅/⏳, Level 2 ✅/⏳, assigned mini-game, score/precision), a `Nivel 1: X / N · Nivel 2: Y / N` summary and an overall progress bar.
* **Start round:** writes `started: true`, unlocking Level 1.
* **Restart round:** clears every player's progress (`level_1_completed`, `level_2_completed`, assigned mini-game, score/precision) and returns the room to the lobby (`current_phase: 1`, `started: false`), **keeping the registered players** so the same group can replay.
* **Wipe room:** deletes all players and returns to the lobby, ready for a brand-new group.

Both reset actions require confirmation. When the room returns to the lobby, the players' open tabs follow automatically and each level **initialises fresh** on the next start: the level controllers are *restarted*, not re-created, so there are no duplicate event handlers and no page reload is needed.

---

## ✅ 9. Resolved Design Decisions

Consolidated record of the design points that were previously left open, together with their resolutions.

| # | Topic | Situation | Resolution |
|---|-------|-----------|------------|
| 1 | **Grid size** | `REQUIREMENTS.md` says 4×4 (FR-2.1); the design originally said 5×5 / 6×6 | Use **7×7** (enlarged from 5×5 with the real-time rework, #11), exposed as the `GRID_SIZE` constant. The discrepancy with FR-2.1 is documented here; the design prevails. |
| 2 | **"I Shot The Serif" timeout** | Not specified | On timeout, **automatically retry with a new grid**. No penalty; the player never blocks the group. |
| 3 | **"Shape Type" tolerance** | `tolerance = 20 px` → 85% ≈ 3 px (unplayable on touch) | Scale the tolerance to the canvas: success radius ≈ **8% of the shorter side** (≈ 40–60 px on mobile). |
| 4 | **Who writes `current_phase`** | Only "recommended" a single writer | ~~The coordinator dashboard is the sole authority and writes it inside a `transaction()`.~~ **Superseded by #12:** phases are no longer advanced; the dashboard only resets `current_phase` to `1` on a room reset. |
| 5 | **Level 2 assignment** | "The coordinator defines N on unlock" | ~~The coordinator assigns `serif` / `vector` over a sorted `playerId` list.~~ **Superseded by #12:** each client self-assigns the less-used game inside a `transaction()` when it clears Level 1 (ties → `serif`). |
| 6 | **Phase 3** | Undefined | **Not implemented.** The game **ends after Level 2**; completing it shows the group-victory screen. |
| 7 | **Presence / disconnection** | NFR-4 | `onDisconnect()` marks players as disconnected; `localStorage` restores `roomId`/`playerId` so a refresh resumes the session. |
| 8 | **Reset / replay between groups** | Not defined; a finished room could not be reused for the next group | The dashboard offers **Restart round** (reset progress, keep players) and **Wipe room** (remove players), both returning to the lobby. Player progress and `current_phase` are reset transactionally; players' tabs return to the lobby and levels reinitialise without a page reload. |
| 9 | **Live-session deadlock** | A disconnected player can never complete a level, which would block the automatic phase advance | ~~Force phase advance button.~~ **Obsolete with #12:** nobody waits for other players, so a disconnected player cannot block anyone; the button was removed. |
| 10 | **Level 1 ambience** | A Matrix-styled background was wanted, but a static page feels flat | An animated **"digital rain"** canvas (`js/digitalrain.js`) renders falling katakana / Latin / binary glyphs with a shining head glyph and fading trail behind the Level 1 screen. It runs only while the screen is visible and the tab is foregrounded, sits at ~50 % opacity for readability, and shows a single static frame under `prefers-reduced-motion`. |
| 11 | **Level 1 gameplay** | The original "build a command list, then run the exploit" mode (5×5, agent HP, `decryptGate` puzzle) was replaced by a real-time mode; FR-2.2 asks for basic algorithmic logic | Rebuilt as a **real-time maze arcade** (Pac-Man style) on a 7×7 maze: agents chase via BFS (reduced to 1, see #13), the phone wanders, **DISPARAR** (3 rounds, 4 s freeze), **BYPASS** (3 uses, 1.5 s cooldown, live maze rebuild) and **ENCRYPT** (1 use, 5 s freeze of the nearest agent). Being caught restarts with a new maze, unlimited attempts. The agent moves at half the hacker's speed (`AGENT_MS = 300`). Logic is exercised through route planning and resource management instead of command sequencing; the design prevails over FR-2.2. |
| 12 | **Phase progression** | Players waited on a group-wait screen until **everyone** finished a level, and the coordinator's dashboard advanced the phase and assigned Level 2 | **Individual, automatic progression:** as soon as a player clears a level their client moves to the next one, with no wait and no coordinator action. On clearing Level 1 the client self-assigns its Level 2 game (transaction, balanced split). After Level 2 the player sees the mission-complete screen with a live team counter. The coordinator only starts and resets the round. This departs from FR-3.3 / FR-4.1 (group-gated unlock); the design prevails. |
| 13 | **Level 1 tuning** | With 2 agents and a toast on every capture, the restart toast covered the controls and the game could not be played | **1 agent** (`AGENT_COUNT = 1`) and **no toast on capture**: the restart is shown in the HUD status line plus a vibration. |
| 14 | **"I Shot The Serif" errors** | Wrong taps had no consequence beyond lost time | **Max 2 errors per round** (`MAX_ERRORS = 2`): the 2nd wrong tap restarts the round with a new grid (score, errors and timer reset). An `❌ n/2` counter is shown in the header. |
