# Sistema de Patrones de Tiro (Shot Patterns)

El sistema de patrones de tiro permite ejecutar múltiples disparos en un solo turno siguiendo patrones configurables. Esto añade estrategia y variedad al juego.

## Características

- **Patrones Predefinidos**: 10 patrones listos para usar
- **Patrones Personalizados**: Crea tus propios patrones con cualquier forma
- **Manejo de Bordes**: Los disparos fuera del tablero se ignoran automáticamente
- **Detección de Disparos Repetidos**: No se dispara dos veces a la misma celda
- **Reporte de Estado**: El resultado incluye el estado actual del juego (isGameOver, winner)

## Uso Básico

### 1. Usar un Patrón Predefinido

```typescript
import { GameEngine, CROSS_SHOT } from './core/engine';

const engine = new GameEngine();
engine.initializeGame(playerShips, enemyShips);

// Ejecutar un tiro en cruz centrado en (5, 5)
const result = engine.executeShotPattern(5, 5, CROSS_SHOT, true);

console.log(`Disparos ejecutados: ${result.shots.filter(s => s.executed).length}`);
console.log(`Impactos: ${result.shots.filter(s => s.hit).length}`);
```

### 2. Obtener un Patrón por ID

```typescript
import { GameEngine, getShotPattern } from './core/engine';

const pattern = getShotPattern("cross");
const result = engine.executeShotPattern(5, 5, pattern, true);
```

### 3. Crear un Patrón Personalizado

```typescript
import { createCustomPattern } from './core/engine';

// Crear un patrón en forma de V
const vPattern = createCustomPattern(
  "v-shape",
  "V-Shape Shot",
  [
    { dx: 0, dy: 0 },   // Centro superior
    { dx: -1, dy: 1 },  // Izquierda
    { dx: 1, dy: 1 },   // Derecha
    { dx: -2, dy: 2 },  // Abajo izquierda
    { dx: 2, dy: 2 },   // Abajo derecha
  ],
  "Dispara 5 tiros en formación V"
);

const result = engine.executeShotPattern(5, 3, vPattern, true);
```

## Patrones Predefinidos

### SINGLE_SHOT
Un solo disparo (comportamiento estándar de Battleship).
```
  X
```
**Cantidad de disparos**: 1

### CROSS_SHOT (Tiro en Cruz)
5 disparos en forma de cruz/plus.
```
    X
  X X X
    X
```
**Cantidad de disparos**: 5

### LARGE_CROSS_SHOT
9 disparos en una cruz extendida.
```
      X
      X
  X X X X X
      X
      X
```
**Cantidad de disparos**: 9

### HORIZONTAL_LINE_SHOT
3 disparos en línea horizontal.
```
  X X X
```
**Cantidad de disparos**: 3

### VERTICAL_LINE_SHOT
3 disparos en línea vertical.
```
  X
  X
  X
```
**Cantidad de disparos**: 3

### SQUARE_SHOT
9 disparos en un cuadrado 3x3.
```
  X X X
  X X X
  X X X
```
**Cantidad de disparos**: 9

### SMALL_SQUARE_SHOT
4 disparos en un cuadrado 2x2.
```
  X X
  X X
```
**Cantidad de disparos**: 4

### DIAGONAL_X_SHOT
5 disparos en forma de X diagonal.
```
  X   X
    X
  X   X
```
**Cantidad de disparos**: 5

### T_SHAPE_SHOT
5 disparos en forma de T.
```
  X X X
    X
    X
```
**Cantidad de disparos**: 5

### L_SHAPE_SHOT
5 disparos en forma de L.
```
  X
  X
  X X X
```
**Cantidad de disparos**: 5

## API

### `executeShotPattern(centerX, centerY, pattern, isPlayerShot)`

Ejecuta un patrón de disparos centrado en las coordenadas especificadas.

**Parámetros:**
- `centerX` (number): Coordenada X del centro del patrón
- `centerY` (number): Coordenada Y del centro del patrón
- `pattern` (ShotPattern): El patrón a ejecutar
- `isPlayerShot` (boolean): `true` si el disparo es del jugador, `false` si es del enemigo

**Retorna:** `ShotPatternResult`
```typescript
{
  success: boolean;           // Si el patrón se ejecutó exitosamente
  error?: string;            // Mensaje de error si falló
  shots: Array<{             // Array de resultados individuales
    x: number;
    y: number;
    hit: boolean;
    shipId?: number;
    shipDestroyed?: boolean;
    executed: boolean;       // false si estaba fuera de límites o ya disparado
  }>;
  isGameOver: boolean;       // Si el juego terminó después de este patrón
  winner: Winner;            // Ganador si el juego terminó
}
```

### `getShotPattern(id)`

Obtiene un patrón predefinido por su ID.

**Parámetros:**
- `id` (string): El ID del patrón (ej: "cross", "square", "horizontal-line")

**Retorna:** `ShotPattern` (devuelve `SINGLE_SHOT` si no se encuentra el ID)

### `createCustomPattern(id, name, offsets, description?)`

Crea un patrón personalizado.

**Parámetros:**
- `id` (string): Identificador único para el patrón
- `name` (string): Nombre legible del patrón
- `offsets` (Array<{dx: number, dy: number}>): Array de offsets relativos desde el centro
- `description` (string, opcional): Descripción del patrón

**Retorna:** `ShotPattern`

## Tipos

### `ShotOffset`
```typescript
interface ShotOffset {
  dx: number;  // Offset horizontal (positivo = derecha, negativo = izquierda)
  dy: number;  // Offset vertical (positivo = abajo, negativo = arriba)
}
```

### `ShotPattern`
```typescript
interface ShotPattern {
  id: string;              // Identificador único
  name: string;            // Nombre legible
  description?: string;    // Descripción del patrón
  offsets: ShotOffset[];   // Array de offsets desde la posición objetivo
}
```

## Ejemplos de Uso Estratégico

### Búsqueda de Área
Usa el patrón `CROSS_SHOT` para buscar barcos en un área:
```typescript
const result = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
```

### Seguimiento de Impacto
Cuando encuentras un barco, usa `HORIZONTAL_LINE_SHOT` o `VERTICAL_LINE_SHOT`:
```typescript
// Si encontraste un impacto en (3, 4), prueba una línea horizontal
const result = engine.executeShotPattern(3, 4, HORIZONTAL_LINE_SHOT, true);
```

### Saturación de Área
Para un ataque concentrado, usa `SQUARE_SHOT`:
```typescript
const result = engine.executeShotPattern(7, 7, SQUARE_SHOT, true);
```

## Manejo de Casos Especiales

### Disparos Fuera del Tablero
Los disparos que caen fuera del tablero se marcan como `executed: false` pero no causan error:
```typescript
const result = engine.executeShotPattern(0, 0, CROSS_SHOT, true);
// Algunos disparos estarán fuera de límites, pero el patrón se ejecuta
```

### Celdas Ya Disparadas
Las celdas que ya fueron disparadas también se marcan como `executed: false`:
```typescript
engine.executeShot(5, 5, true);  // Primer disparo
const result = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
// El centro no se volverá a disparar, pero los otros 4 sí
```

### Reporte de Estado del Juego
El resultado incluye el estado actual del juego para que puedas verificarlo:
```typescript
const result = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
if (result.isGameOver) {
  console.log(`¡Juego terminado! Ganador: ${result.winner}`);
}
```

**Nota**: El `GameEngine` no determina cuándo el juego termina. Esa lógica es responsabilidad del `Match`, que usa las reglas del juego para decidir el ganador.

## Integración con Match

El sistema de patrones está integrado directamente en el `GameEngine`. El `Match` es quien debe manejar la lógica de game over y las reglas del juego:

```typescript
const match = new Match(config);
const engine = match.getEngine(); // Obtén acceso al engine

// El Match maneja las reglas y determina game over
const result = engine.executeShotPattern(x, y, pattern, isPlayerShot);

// El Match verifica el estado y aplica las reglas
if (engine.areAllShipsDestroyed(false)) {
  // Match establece el ganador según sus reglas
  match.handleGameOver("player");
}
```

La separación de responsabilidades es:
- **GameEngine**: Ejecuta disparos, mantiene estado, reporta información
- **Match**: Aplica reglas, determina ganadores, maneja turnos

## Testing

El sistema incluye tests completos en `src/core/tests/engine/shotPatterns.test.ts`:

```bash
npm test -- shotPatterns.test.ts
```

## Ejemplos Completos

Consulta `src/playground/examples/shotPatternExamples.ts` para ver ejemplos completos de uso.
