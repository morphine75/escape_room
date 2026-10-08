# DESIGN.md — System Design & Architecture

## 1. System Architecture

The application operates as a Serverless Real-Time Web Application.

```
[ Student Phones (HTML/CSS/JS) ] <--- WebSockets / Long-Polling ---> [ Firebase Realtime Database ]
                                                                             ^
[ Coordinator Screen / Projector ] <----------------------------------------|
```

---

## 2. Data Model (Firebase Realtime Database)

The database structure is flat and lightweight to allow sub-second real-time synchronization:

```json
{
  "rooms": {
    "SALA-101": {
      "target_players": 10,
      "current_phase": 2,
      "level_1_unlocked": true,
      "level_2_unlocked": false,
      "players": {
        "player_uid_001": {
          "name": "Lucía",
          "level_1_completed": true,
          "level_2_game": "serif",
          "level_2_completed": false,
          "level_2_score": 400,
          "joined_at": 1700000000
        },
        "player_uid_002": {
          "name": "Mateo",
          "level_1_completed": true,
          "level_2_game": "vector",
          "level_2_completed": false,
          "level_2_precision": 0,
          "joined_at": 1700000005
        }
      }
    }
  }
}
```

**New Fields Explanation:**
- `level_1_completed` / `level_2_completed`: Track progress per level
- `level_2_game`: Assigns game type ("serif" for "I Shot The Serif", "vector" for "Shape Type")
- `level_2_score`: Score accumulated in "I Shot The Serif" (+100 per correct serif)
- `level_2_precision`: Precision percentage achieved in "Shape Type" (must reach 85%+ to unlock)

---

## 3. Application State & Flow

```
[ Screen 1: Registration ]
         │
         ▼ (Submit Name)
[ Screen 2: Waiting Lobby ] ─── (Real-time listener checks connected count)
         │
         ▼ (Target reached)
[ Screen 3: Level 1 - Maze Challenge ] ─── (Generates randomized grid & local logic state)
         │
         ▼ (User executes algorithm & reaches goal)
[ Screen 4: Individual Completion / Group Wait ]
         │
         ▼ (Firebase listener detects ALL players level_1_completed = true)
[ Screen 5: Level 1 Victory & Level 2 Assignment ]
         │
         ▼ (Server randomly distributes games: first half → Serif, second half → Vector)
[ Screen 6a: Level 2 Game A - "I Shot The Serif" ] ──────┐
         │ (30 second timer, eliminate serif fonts)    │
[ Screen 6b: Level 2 Game B - "Shape Type" ] ───────────┤ (Parallel execution)
         │ (Drag nodes to match vector curves)         │
         ▼                                              │
[ Screen 7: Individual Completion / Group Wait ]  <─────┘
         │
         ▼ (Firebase listener detects ALL players level_2_completed = true)
[ Screen 8: Phase 3 Unlocked Screen / Next Challenge ]
```

---

## 4. Level 1: Maze & Algorithmic Logic (Mobile Layout & Mechanics)

### 4.1. Mobile Screen Layout (Portrait Orientation)

The screen is optimized for mobile touchscreens without requiring virtual keyboards:

```text
+------------------------------------+
| 🎮 SALA: #101  |  👤 Lucas (3/10)  |  <-- Sticky Header (Live Progress)
+------------------------------------+
|                                    |
|         [🧙‍♂️]  [░░]  [🧱]  [░░]    |
|         [🧱]  [👾]  [░░]  [🚪]    |  <-- ZONE 1: 2D Maze Grid Canvas/CSS
|         [░░]  [░░]  [🧱]  [🏆]    |      (40% Screen Height)
|                                    |
+------------------------------------+
| ALGORITMO:                         |
| [▶ moverDerecha(1)] [❌]           |  <-- ZONE 2: Sequence Builder
| [▶ atacar("fuerte")] [❌]          |      (Drag / Touch block sequence)
| [ + Agregar Paso  ]                |
+------------------------------------+
| [⬆️ Subir] [⬇️ Bajar] [⬅️ Izq] [➡️ Der]|  <-- Touch Control Panel (Zero-typing)
| [⚔️ Atacar] [🗝️ Usar Clave]         |
|------------------------------------|
|        [ ▶ EJECUTAR ALGORITMO ]    |  <-- Main Execution Button
+------------------------------------+
```

### 4.2. Level 1 Game Mechanics

1. **Grid Components ($5 \times 5$ or $6 \times 6$ Procedural Maze):**
   * **Hero (`🧙‍♂️`):** Starting position $(0,0)$.
   * **Path Cells (`░░`):** Walkable tiles.
   * **Walls (`🧱`):** Impassable obstacles.
   * **Enemies / Bugs (`👾`):** Block passage; defeated using combat commands with parameters.
   * **Locked Gate (`🚪`):** Requires solving a logic puzzle modal.
   * **Treasure Chest (`🏆`):** Objective goal.

2. **Command Block Types (Zero-Typing Input):**
   * **Movement:** `moverArriba(steps)`, `moverAbajo(steps)`, `moverIzquierda(steps)`, `moverDerecha(steps)`
   * **Action / Combat:** `atacarEnemigo(fuerza)` (Matches enemy $HP$)
   * **Logic / Unlock:** `desbloquearPuerta(clave)` (Opens logic puzzle modal)

3. **Execution & Debugging Loop:**
   * Player taps direction and action buttons to build an ordered execution list.
   * Player presses **[ ▶ EJECUTAR ALGORITMO ]**.
   * The sprite executes steps sequentially.
   * **Success:** Hero reaches `🏆` $\rightarrow$ sends `completed: true` to Firebase $\rightarrow$ displays waiting screen.
   * **Failure (Bug):** Hero hits a wall or fails a challenge $\rightarrow$ error is highlighted on the specific command block for targeted debugging.

---

## 5. Key Logic & Synchronization Implementation

### 5.1. Firebase Real-Time Listener (Client JS)

```javascript
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const roomRef = ref(db, `rooms/${roomId}`);

onValue(roomRef, (snapshot) => {
  const data = snapshot.val();
  if (!data || !data.players) return;

  const playersArray = Object.values(data.players);
  const totalJoined = playersArray.length;
  const completedCount = playersArray.filter(p => p.completed === true).length;

  updateUIProgressBar(completedCount, data.target_players);

  // Synchronized unlock trigger across all connected devices
  if (totalJoined >= data.target_players && completedCount >= data.target_players) {
    transitionToNextPhase();
  }
});
```

### 5.2. Procedural / Randomized Challenge Generation

* Each client executes a small algorithm generating a $5 \times 5$ grid with random wall placements that guarantee at least one valid path.
* This ensures every student receives a unique puzzle while keeping server load at zero.

---

## 6. Level 2: Typography & Vector Design

### 6.1. Game Distribution & Assignment Logic

**Distribution Algorithm:**
- Upon Level 2 unlock, the coordinator defines the total player count ($N$).
- First half ($\lceil N/2 \rceil$) are assigned `level_2_game: "serif"` (I Shot The Serif).
- Second half ($\lfloor N/2 \rfloor$) are assigned `level_2_game: "vector"` (Shape Type).
- Firebase updates each player's record with their assigned game type.
- **Example:** 10 players → 5 receive serif, 5 receive vector. 11 players → 6 receive serif, 5 receive vector.

---

### 6.2. Game A: "I Shot The Serif" (Typographic Agility)

#### 6.2.1. Objective
Eliminate all letters/fonts displaying **serifs (serifs/remates)** before the 30-second timer expires.

#### 6.2.2. Mobile Screen Layout (Portrait Orientation)

```text
+------------------------------------+
| ⏱️ Tiempo: 00:22s  |  🎯 Puntos: 400 |
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
|  ¡Toca únicamente las tipografías  |
|         CON SERIFA (remates)!      |
+------------------------------------+
```

#### 6.2.3. Game Mechanics

**Display Grid:** 3×3 or 4×4 grid of random letters ($A-Z$)

**Font Families:**
- **Serif Fonts** (must tap): Times New Roman, Garamond, Georgia, Courier New
- **Sans Serif Fonts** (must avoid): Helvetica, Arial, Inter, Verdana, Open Sans

**Player Interaction:**
1. Grid displays letters in random serif/sans-serif fonts.
2. Player taps only letters with **serifs (remates)**.
3. Tapping a serif letter: 
   - Letter explodes/disappears 
   - +100 points awarded
   - Short vibration feedback (haptic)
4. Tapping a sans-serif letter (mistake):
   - Visual error warning: "❌ Error: ¡Es Sans Serif!"
   - No points lost but wastes time
5. **Success Condition:** All serif letters eliminated OR timer reaches zero.
   - If all serifs eliminated: Player marked as `level_2_completed: true`, score saved in `level_2_score`
   - Transition to waiting screen to see group progress

#### 6.2.4. Timing & Scoring
- **Timer:** 30 seconds
- **Points:** +100 per correctly identified serif letter
- **Pass Condition:** Eliminate all serif fonts before time expires

---

### 6.3. Game B: "Shape Type" (Vector Curve Adjustment)

#### 6.3.1. Objective
Reconstruct the original shape of a letter/logo by dragging deformed **Bézier curve nodes** to match the target silhouette. Must achieve **≥85% precision** to unlock.

#### 6.3.2. Mobile Screen Layout (Portrait Orientation)

```text
+------------------------------------+
| ✏️ Ajuste Vectorial | Precisión: 92%|
+------------------------------------+
|                                    |
|                . - - - .           |
|              /           \         |
|             |     (🔴)----| <--Nodo|
|              \           /  Arrastrable
|                ` - - - '           |
|           (Silueta Punteada Guía)  |
|                                    |
|         [↙️ Arrastrar Nodo Rojo]   |
|                                    |
+------------------------------------+
|  Arrastra el punto rojo para       |
|  corregir la curva de la letra.    |
|                                    |
|  Precisión requerida: 85% ✓        |
+------------------------------------+
```

#### 6.3.3. Game Mechanics

**Setup:**
- A large letter or icon (e.g., 'a', 'g', 'S', or a career-related logo) displays with **one or more Bézier nodes displaced from their correct position**.
- A **dotted guide silhouette** shows the correct/harmonic typographic shape.

**Player Interaction:**
1. Player identifies the misplaced red node (🔴) on the letter.
2. Player **drags (touch & drag)** the red node across the canvas.
3. Real-time precision calculation:
   - Distance between current node position and target position is computed continuously.
   - Precision % displayed in header updates live: `Precisión: 92%`
4. Upon releasing the node (tap release):
   - App calculates final precision percentage
   - **Pass Condition:** If precision ≥ 85%:
     - Letter "comes to life" with success animation (e.g., glow, pulse, scale-up)
     - Player marked as `level_2_completed: true`
     - `level_2_precision` stored in Firebase
   - **Fail Condition:** If precision < 85%:
     - Brief error feedback ("Precisión insuficiente, intenta de nuevo")
     - Node resets to original (incorrect) position
     - Player can attempt again

#### 6.3.4. Precision Calculation Algorithm
```javascript
// Pseudocode for precision calculation
function calculatePrecision(currentNodePos, targetNodePos, tolerance = 20) {
  const distance = Math.hypot(
    currentNodePos.x - targetNodePos.x,
    currentNodePos.y - targetNodePos.y
  );
  const precision = Math.max(0, 100 - (distance / tolerance) * 100);
  return Math.round(precision);
}
```

---

### 6.4. Level 2 Firebase Synchronization Logic

**Updated Real-Time Listener (Client JS):**

```javascript
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const roomRef = ref(db, `rooms/${roomId}`);

onValue(roomRef, (snapshot) => {
  const data = snapshot.val();
  if (!data || !data.players) return;

  const playersArray = Object.values(data.players);
  const totalJoined = playersArray.length;
  
  // Level 1 check
  const level1Completed = playersArray.filter(p => p.level_1_completed === true).length;
  
  // Level 2 check
  const level2Completed = playersArray.filter(p => p.level_2_completed === true).length;

  updateUIProgressBar(level2Completed, data.target_players);

  // Level 1 unlock trigger
  if (totalJoined >= data.target_players && level1Completed >= data.target_players) {
    transitionToLevel2();
  }

  // Level 2 unlock trigger (ALL players must complete their respective games)
  if (totalJoined >= data.target_players && level2Completed >= data.target_players) {
    transitionToPhase3();
  }
});
```

---

## 7. UI/UX Design System Guidelines

* **Color Palette:**
  * Background: Dark Navy (`#0f172a`)
  * Cards / Containers: Slate Blue (`#1e293b`)
  * Accent / Primary Action: Electric Blue (`#2563eb`)
  * Success / Unlock State: Emerald Green (`#22c55e`)
  * Warning / Progress State: Amber Yellow (`#f59e0b`)
  * Error / Incorrect Action: Red (`#ef4444`)
* **Typography:** Sans-serif, bold, easily readable on mobile displays.
* **Touch Targets:** Minimum $44 \times 44\text{px}$ touch targets for mobile usability.
* **Components:** Responsive cards, touchable directional controls, dynamic progress bars, draggable vector nodes.
* **Haptic Feedback:** Short vibration on successful serif elimination (Game A); gentle pulse on node drag (Game B).
* **Animations:** 
  * Letter explosion effect for correct taps (Game A)
  * Node "snap-to-target" animation when precision ≥ 85% (Game B)
  * Success glow/pulse when game objectives met