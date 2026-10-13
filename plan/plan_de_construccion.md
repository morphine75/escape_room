# Plan de construcción — "Hack the Institute: Mission Zero"

> Documento derivado de `AGENTS.md`, `REQUIREMENTS.md` y `DESIGN.md`.
> Estado del repo al redactar: solo los tres `.md`, sin código.
> **Actualizado:** el Nivel 1 se reconstruyó como arcade en tiempo real (decisión #11 de `system_design_architecture.md` §9) y la estructura de archivos refleja el código actual.

---

## 0. Decisiones de diseño (cerradas)

Los documentos dejan puntos abiertos. Estas son las resoluciones adoptadas:

| Tema | Situación | Resolución |
|---|---|---|
| **Tamaño del grid** | REQUIREMENTS dice 4×4 (FR-2.1); DESIGN dice 5×5/6×6 | Usar **7×7** (antes 5×5; se amplió con el rework en tiempo real), constante `GRID_SIZE`. La discrepancia con FR-2.1 queda documentada (el diseño prevalece sobre la spec). |
| **Timeout de "I Shot The Serif"** | El diseño no lo define | **Reintento automático**: al agotarse el tiempo se genera un grid nuevo y se reinicia la ronda, sin penalización. Nunca bloquea al grupo. |
| **Tolerancia de "Shape Type"** | `tolerance = 20 px` ⇒ 85 % ≈ 3 px (inviable en táctil) | Escalar la tolerancia al canvas: **radio de acierto ≈ 8 % del lado menor** (~40–60 px en móvil). |
| **Progresión entre niveles** | Antes: el dashboard (abierto) avanzaba `current_phase` | **Automática en el cliente**: cada celular desbloquea el siguiente nivel cuando todos los jugadores conectados completaron el actual, sin acción del coordinador. El coordinador solo inicia y reinicia la partida. |
| **Asignación Nivel 2** | "El coordinador define N al desbloquear" | El **cliente** se autoasigna al completar el Nivel 1, con `transaction()` sobre `players`: toma el juego con menos jugadores (empate → `serif`). |
| **Fase 3** | Sin definir | **No se implementa mecánica.** El juego concluye al terminar la Fase 2: tras completar el Nivel 2 el juego finaliza con la pantalla de victoria grupal. |
| **Presencia / desconexión** | NFR-4 | `onDisconnect()` de Firebase marca jugadores desconectados; `localStorage` reanuda la sesión tras un refresh. |
| **Mecánica del Nivel 1** | El modo "armar lista de comandos y ejecutar" (puerta `decryptGate`, agentes con HP) fue reemplazado | **Arcade en tiempo real estilo Pac-Man**: 1 agente persigue por BFS (todos los avisos van a la línea de estado, sin notificaciones emergentes), el 📞 deambula, DISPARAR (3 balas, congela 4 s), BYPASS (3 usos, enfriamiento 1,5 s, reconstruye el laberinto) y ENCRYPT (1 uso, congela 5 s al agente más cercano). Si atrapan al héroe se reinicia con laberinto nuevo, intentos ilimitados. |

---

## 1. Estructura de archivos (actual)

```
escape_room/
├── index.html            # App del jugador: registro → lobby → Nivel 1 → espera → Nivel 2 → victoria
├── dashboard.html        # Pantalla del coordinador / proyector
├── database.rules.json   # Reglas de Firebase
├── css/
│   ├── base.css          # reset, variables CSS, tipografía, toasts, lobby
│   ├── level1.css        # tema Matrix (negro + verde neón), tablero y controles
│   ├── level2.css        # tema navy/electric blue
│   └── dashboard.css
├── js/
│   ├── firebase-config.js    # credenciales del proyecto Firebase
│   ├── firebase.js           # init del SDK
│   ├── session.js            # roomId/playerId + localStorage + reanudar
│   ├── ui.js                 # toasts, pantallas, haptics, helpers
│   ├── room.js               # unirse a sala, validar nombre, marcar niveles completos
│   ├── sync.js               # listeners de sala + triggers de fase
│   ├── app.js                # controlador del jugador
│   ├── dashboard.js          # coordinador: progreso, inicio, avance de fase, asignación Nivel 2, reset
│   ├── digitalrain.js        # canvas "digital rain" detrás del Nivel 1
│   └── levels/
│       ├── level1/
│       │   ├── generator.js  # laberinto 7×7 aleatorio con conectividad total (BFS)
│       │   └── level1.js     # motor en tiempo real: movimiento, agentes, 📞, DISPARAR/BYPASS/ENCRYPT
│       └── level2/
│           ├── serif.js      # "I Shot The Serif"
│           └── vector.js     # "Shape Type" (canvas + Bézier)
└── plan/
```

> Respecto del plan original: no se crearon `lobby.js` (está en `app.js`), `distribute.js` (la asignación vive en `dashboard.js`), `qr.js` ni `assets/fonts/`. Los módulos previstos `commands.js`, `engine.js`, `gate.js` y `render.js` del Nivel 1 quedaron obsoletos con el rework en tiempo real: todo vive en `generator.js` + `level1.js`.

**Nota técnica:** al usar `<script type="module">`, hace falta servirlos por HTTP.
Ya estás en XAMPP (`localhost/escape_room`), así que `file://` no es problema.
Firebase se importa por ESM desde el CDN de gstatic (v10.7.1), como en el diseño.

---

## 2. Modelo de datos y reglas de Firebase

- Estructura **plana** tal cual el DESIGN.md: `rooms/{roomId}` + `rooms/{roomId}/players/{playerId}`.
- **Un solo formato de timestamp**: `ServerValue.TIMESTAMP` / `serverTimestamp()` en todas partes.
- Añadir (pequeña extensión al modelo del diseño):
  - `players/{id}/connected` (bool) para presencia con `onDisconnect()`.
  - `players/{id}/joined_at` para ordenar la asignación del Nivel 2 de forma estable.
- **Reglas de seguridad** (`database.rules.json`): lectura/escritura solo bajo `rooms/`,
  con validación básica de tipos. Evita salas basura y escrituras malformadas.
- **Persistencia offline**: `enableIndexedDbPersistence()` para cumplir NFR-4.

---

## 3. Fases de construcción (milestones)

### Fase 0 — Andamiaje (S)
- Crear estructura de carpetas, `base.css` con variables de color (secciones 5.1 y 8.2), `index.html` mínimo.
- `firebase-config.js` + `session.js` (generar/leer `playerId` y `roomId` en `localStorage`).
- Verificar conexión: leer/escribir una sala de prueba.
- **Entregable:** app que carga y conecta a Firebase.

### Fase 1 — Lobby y registro (FR-1) (M)
- `room.js`: crear sala o unirse por ID (`SALA-101`), definir `required_players` (N).
- Registro de nombre con validación: **vacío, duplicado, longitud**; feedback con toasts.
- `lobby.js`: listener `onValue` con contador `Joined: X / N`; botón de inicio cuando se alcanza N.
- **Entregable:** varios móviles entran a la misma sala y ven el contador en vivo.

### Fase 2 — Nivel 1: Matrix Protocol (FR-2) (L)
- `generator.js`: laberinto 7×7 con muros aleatorios, reintentado hasta que todas las celdas abiertas
  sean alcanzables (BFS); ubica el 📞 y el agente (`AGENT_COUNT = 1`) lejos del héroe. `regenerateWalls()` para BYPASS.
- `level1.js`: bucle `requestAnimationFrame` con pasos fijos por entidad (héroe 150 ms, agentes 300 ms,
  📞 420 ms, proyectiles 70 ms); movimiento por flechas/WASD/D-pad; agente que persigue por BFS;
  DISPARAR / BYPASS / ENCRYPT; captura → laberinto nuevo; llegar al 📞 → `level_1_completed: true`.
  El bucle se pausa fuera de la pantalla o con la pestaña oculta.
- `digitalrain.js`: lluvia digital Matrix de fondo.
- **Entregable:** un jugador alcanza el 📞 y se persiste su estado.

### Fase 3 — Sincronización y progresión de fases (FR-3, FR-4) (M)
- `sync.js`: listener de la sala + `everyoneCompleted()` (todos los jugadores conectados completaron un nivel).
- Al superar el Nivel 1, `completeLevel1()` (`room.js`) marca el nivel y asigna el juego del Nivel 2 en una transacción → pantalla de espera grupal.
- Cada cliente desbloquea el siguiente nivel apenas `everyoneCompleted()` es verdadero; tras el Nivel 2, victoria grupal. No hay Fase 3.
- **Entregable:** al completar todos, todas las pantallas pasan de nivel solas, sin recargar ni depender del dashboard.

### Fase 4 — Nivel 2A: "I Shot The Serif" (M)
- Reparto: autoasignación balanceada en `completeLevel1()` (ver Fase 3).
- `serif.js`: grid de letras A–Z con fuentes serif/sans-serif reales, timer 30 s, +100 por acierto,
  error "That's Sans Serif!" con contador `❌ n/2`: **al 2.º error se reinicia la ronda**; explosión + vibración,
  **reintento automático** al agotarse el tiempo.
- Éxito → `level_2_completed: true` + `level_2_score`.
- **Entregable:** juego A jugable y persistido.

### Fase 5 — Nivel 2B: "Shape Type" (L)
- `vector.js`: canvas con letra/icono, uno o más nodos Bézier desplazados, silueta guía punteada.
- Drag táctil del nodo rojo, precisión en vivo, cálculo con tolerancia escalada al canvas.
- Pass ≥ 85 % (animación de éxito + `level_2_completed` + `level_2_precision`); fail → reset y reintento.
- **Entregable:** juego B jugable y persistido.

### Fase 6 — Dashboard / proyector (M)
- `dashboard.html`: progreso por nivel, lista de jugadores y su estado, inicio de partida y reinicio / vaciado de sala.
- Ya no avanza fases ni asigna juegos (lo hace cada cliente).
- **Entregable:** pantalla central proyectable.

### Fase 7 — Pulido, QR y pruebas (M)
- Toasts/estados de carga, targets ≥ 44×44px, feedback háptico (8.3), transición "glitch" Nivel 1→2.
- `qr.js`: generación/lectura de QR para avanzar entre estaciones si aplica.
- Pruebas de multijugador, desconexión, refresh y nombres duplicados.
- **Entregable:** versión lista para el evento.

---

## 4. Criterios de aceptación (derivados de los NFR)

- **NFR-1:** carga < 2 s en 3G → assets mínimos, sin frameworks, CSS crítico inline si hace falta.
- **NFR-2:** latencia de sync < 500 ms → un solo listener por sala, estado plano.
- **NFR-3:** sin teclear código → controles táctiles (D-pad + botones de acción) y teclado opcional, validaciones claras.
- **NFR-4:** refresh o caída de red → reanudar desde `localStorage` + persistencia offline de Firebase.
- **Regla de oro (FR-3.3):** ninguna fase avanza hasta que *todos* los jugadores registrados completen.

---

## 5. Riesgos / puntos de atención

- **Carreras de escritura** en la asignación del Nivel 2 → `transaction()` sobre `players` (dos jugadores que terminan a la vez se reintentan con datos frescos).
- **Jugador que abandona** a mitad → definir regla: excluir desconectados del umbral para no bloquear la partida
  (usar `connected`).
- **Generación del laberinto** → probar exhaustivamente que el laberinto siempre es conexo (también tras BYPASS).
- **Dificultad del Nivel 1** → calibrar `AGENT_MS` / `HERO_MS` en vivo; hoy hay 1 agente a la mitad de velocidad del héroe.
- **Fuentes del Nivel 2** → si no se cargan las fuentes, la distinción serif/sans-serif se vuelve ambigua;
  empaquetar fuentes o usar familias web-safe garantizadas.
- **Reloj del timer** → basarlo en tiempo local del dispositivo, no en Firebase, para evitar desfases.
