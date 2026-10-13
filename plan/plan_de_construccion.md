# Plan de construcción — "Hack the Institute: Mission Zero"

> Documento derivado de `AGENTS.md`, `REQUIREMENTS.md` y `DESIGN.md`.
> Estado del repo al redactar: solo los tres `.md`, sin código.

---

## 0. Decisiones de diseño (cerradas)

Los documentos dejan puntos abiertos. Estas son las resoluciones adoptadas:

| Tema | Situación | Resolución |
|---|---|---|
| **Tamaño del grid** | REQUIREMENTS dice 4×4 (FR-2.1); DESIGN dice 5×5/6×6 | Usar **5×5**, con constante `GRID_SIZE` configurable. La discrepancia con FR-2.1 queda documentada (el diseño prevalece sobre la spec). |
| **Timeout de "I Shot The Serif"** | El diseño no lo define | **Reintento automático**: al agotarse el tiempo se genera un grid nuevo y se reinicia la ronda, sin penalización. Nunca bloquea al grupo. |
| **Tolerancia de "Shape Type"** | `tolerance = 20 px` ⇒ 85 % ≈ 3 px (inviable en táctil) | Escalar la tolerancia al canvas: **radio de acierto ≈ 8 % del lado menor** (~40–60 px en móvil). |
| **Quién escribe `current_phase`** | El diseño solo "recomienda" un único escritor | **El dashboard/coordinador** es la única autoridad; escribe con `transaction()` para evitar carreras. Los demás clientes solo reaccionan al cambio. |
| **Asignación Nivel 2** | "El coordinador define N al desbloquear" | El coordinador asigna `serif`/`vector` con `transaction()` sobre la lista de `playerId` ordenada: primera mitad `serif`, segunda `vector`. |
| **Fase 3** | Sin definir | **No se implementa mecánica.** El juego concluye al terminar la Fase 2: tras completar el Nivel 2 el juego finaliza con la pantalla de victoria grupal. |
| **Presencia / desconexión** | NFR-4 | `onDisconnect()` de Firebase marca jugadores desconectados; `localStorage` reanuda la sesión tras un refresh. |

---

## 1. Estructura de archivos propuesta

```
escape_room/
├── index.html            # Entrada: elegir rol (jugador) / registrar nombre
├── dashboard.html        # Pantalla del coordinador / proyector
├── css/
│   ├── base.css          # reset, variables CSS, tipografía, toasts
│   ├── lobby.css
│   ├── level1.css        # tema Matrix (negro + verde neón)
│   ├── level2.css        # tema navy/electric blue
│   └── dashboard.css
├── js/
│   ├── firebase-config.js    # init firebase app + db
│   ├── session.js            # roomId/playerId + localStorage + reanudar
│   ├── ui.js                 # toasts, transiciones, haptics, helpers
│   ├── room.js               # crear/unirse a sala, validar nombre único
│   ├── lobby.js              # contador Joined X/N en vivo
│   ├── sync.js               # listener de sala + triggers de fase
│   ├── levels/
│   │   ├── level1/
│   │   │   ├── generator.js  # grid procedural con camino garantizado
│   │   │   ├── commands.js   # panel táctil → lista de comandos
│   │   │   ├── engine.js     # ejecución paso a paso + validación
│   │   │   ├── gate.js       # modal decryptGate (puzzle lógico)
│   │   │   └── render.js     # pintar grid, animaciones, resaltado de error
│   │   └── level2/
│   │       ├── distribute.js # reparto serif/vector
│   │       ├── serif.js      # "I Shot The Serif"
│   │       └── vector.js     # "Shape Type" (canvas + Bézier)
│   ├── dashboard.js          # barra de progreso grupal + control de fases
│   └── qr.js                 # (opcional) generar/leer QR entre estaciones
└── assets/
    └── fonts/                # serif + sans-serif para Nivel 2
```

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
- `generator.js`: tallar camino primero (garantía de solvencia), luego colocar muros fuera de él;
  colocar agente(s), puerta y cabina sobre el camino.
- `render.js`: grid táctil estilo Matrix (canvas rain opcional, CSS Grid para celdas).
- `commands.js`: botones de dirección/acción que construyen la lista de comandos; `❌` para borrar.
- `engine.js`: ejecución animada paso a paso; en fallo resaltar comando en rojo y volver a `(0,0)`;
  en éxito escribir `level_1_completed: true`.
- `gate.js`: modal del puzzle lógico de `decryptGate`.
- **Entregable:** un jugador resuelve su laberinto y se persiste su estado.

### Fase 3 — Sincronización y progresión de fases (FR-3, FR-4) (M)
- `sync.js`: listener que calcula `level1Completed`/`level2Completed` y muestra barra `Completed: X / N`.
- Pantalla 4 y 7: espera grupal ("Waiting… 7/10"), bloqueando reenvío.
- Trigger de transición de Fase 1→2, con `current_phase` escrito **solo** por el dashboard vía `transaction()`.
- Al completarse el Nivel 2 (todos `level_2_completed = true`), el juego **finaliza**: pantalla de victoria grupal. No hay Fase 3.
- **Entregable:** al completar todos, todas las pantallas pasan de nivel sin recargar; al cerrar el Nivel 2, todas ven el final del juego.

### Fase 4 — Nivel 2A: "I Shot The Serif" (M)
- `distribute.js`: reparto por mitades (⌈N/2⌉ serif / ⌊N/2⌋ vector) con `transaction()`.
- `serif.js`: grid de letras A–Z con fuentes serif/sans-serif reales, timer 30 s, +100 por acierto,
  error "That's Sans Serif!" sin penalizar, explosión + vibración, **reintento automático** al agotarse el tiempo.
- Éxito → `level_2_completed: true` + `level_2_score`.
- **Entregable:** juego A jugable y persistido.

### Fase 5 — Nivel 2B: "Shape Type" (L)
- `vector.js`: canvas con letra/icono, uno o más nodos Bézier desplazados, silueta guía punteada.
- Drag táctil del nodo rojo, precisión en vivo, cálculo con tolerancia escalada al canvas.
- Pass ≥ 85 % (animación de éxito + `level_2_completed` + `level_2_precision`); fail → reset y reintento.
- **Entregable:** juego B jugable y persistido.

### Fase 6 — Dashboard / proyector (M)
- `dashboard.html`: barra de progreso grupal, lista de jugadores y su estado, control de inicio y avance de fase.
- Es la **autoridad** que escribe `current_phase` y las asignaciones.
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
- **NFR-3:** sin teclear código → comandos por bloques, validaciones claras.
- **NFR-4:** refresh o caída de red → reanudar desde `localStorage` + persistencia offline de Firebase.
- **Regla de oro (FR-3.3):** ninguna fase avanza hasta que *todos* los jugadores registrados completen.

---

## 5. Riesgos / puntos de atención

- **Carreras de escritura** en `current_phase` y asignación → resolver con `transaction()` y un único escritor.
- **Jugador que abandona** a mitad → definir regla: excluir desconectados del umbral para no bloquear la partida
  (usar `connected`).
- **Generación del laberinto** → probar exhaustivamente que el camino siempre es solucionable.
- **Fuentes del Nivel 2** → si no se cargan las fuentes, la distinción serif/sans-serif se vuelve ambigua;
  empaquetar fuentes o usar familias web-safe garantizadas.
- **Reloj del timer** → basarlo en tiempo local del dispositivo, no en Firebase, para evitar desfases.
