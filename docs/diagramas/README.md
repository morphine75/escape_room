# Diagramas — Hack the Institute: Mission Zero

PNG listos para descargar (resolución 2×). Las fuentes editables están en `fuentes/` (Mermaid).

| Archivo | Tipo | Contenido |
|---|---|---|
| `01-arquitectura-general.png` | Arquitectura | Dispositivos, servidor estático, CDN del SDK y Firebase Realtime Database |
| `02-arquitectura-modulos.png` | Arquitectura | Dependencias entre los módulos JavaScript |
| `03-modelo-de-datos.png` | Arquitectura (datos) | Estructura `rooms/{roomId}` y `players/{playerId}` |
| `04a-casos-de-uso-jugador.png` | Casos de uso | Actor Jugador (y Sistema) |
| `04b-casos-de-uso-coordinador.png` | Casos de uso | Actor Coordinador, incluida la gestión de salas |
| `05-flujo-jugador.png` | Flujo | Recorrido completo del jugador (Niveles 1, 2 y 3), con desbloqueo grupal automático |
| `06-flujo-nivel1.png` | Flujo | Bucle en tiempo real del Nivel 1 (Matrix Protocol) |
| `07-flujo-nivel2-serif.png` | Flujo | "I Shot The Serif" con el límite de 2 errores |
| `08-flujo-nivel2-shape-type.png` | Flujo | "Shape Type": curva aleatoria con 2 puntos de control (precisión ≥ 85 % en cada uno) |
| `09-flujo-coordinador.png` | Flujo | Panel del coordinador: crear, abrir, iniciar, reiniciar, vaciar, eliminar y recrear salas |
| `10-secuencia-desbloqueo.png` | Secuencia | Cómo dos celulares desbloquean el Nivel 2 sin el coordinador |
| `11-flujo-nivel3-hanoi.png` | Flujo | Nivel 3 "Torres de Hanoi" (reglas de pila, movimientos, óptimo) |
| `12-flujo-nivel3-robot.png` | Flujo | Nivel 3 "Robot Ciego" (programa completo, ejecución, colisión y depuración) |

Para regenerar un PNG después de editar su `.mmd`, se puede pegar el contenido en https://mermaid.live y exportarlo como PNG.
