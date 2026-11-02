# Contratos de datos de Armada Engine 2

## Catálogo de entidades (P4)

`src/isometric/content/entities.v2.json` es el punto de partida versionado para el contenido Rust. Tiene `schemaVersion: 1` y 31 definiciones convertidas desde `entities.ts`. Cada definición separa:

- `id`: identidad estable del prototipo; una instancia guardada usa además su propio `instanceId`.
- `asset`: SVG original, reflejo y variantes visuales opcionales. El empaquetado de texturas para Macroquad podrá transformar estas rutas.
- `shape`: altura, longitud, eje y colisión por celda de la huella.
- `placement.surfaces`: superficies admitidas bajo cada celda, desde el ancla. Una estructura de costa puede exigir agua, arena y pasto en ese orden.

`validateEntityCatalogV2()` comprueba este contrato al cargarlo. `exportEntityCatalogV2()` solo sirve para obtener el catálogo inicial desde TypeScript. El JSON V2 es el archivo que debe editarse para el juego nuevo; el runtime PixiJS sigue leyendo `entities.ts`. No se trasladan `spawnChance`, formaciones, parches, solares ni distancias de V1. Las reglas de densidad, grupos, biomas, pendientes y vecindad se definirán y ajustarán en Rust cuando exista el nuevo generador; cualquier ampliación del archivo elevará `schemaVersion`.

## Guardado del mundo (P4b)

`world/save-v2.ts` define el sobre `format: "armada-engine-2", schemaVersion: 1`. Contiene `chunks`, `player` y `systems`. No hay semilla obligatoria ni ruta de importación de snapshots V1. Cada chunk descubierto guarda sus columnas con **todos los bloques materializados de cada columna** (`elevation`, `material`), transitabilidad, instancias de entidad con estado propio y `changes` para modificaciones locales. `player` y `systems` son objetos JSON de estado del juego. El contenido guardado, no el generador, es la autoridad al reabrir una partida.

`ChunkArchiveV2` muestra la frontera de persistencia: `put()` conserva una copia del chunk; `get()` devuelve otra copia; descargar el chunk de la escena no lo borra del archivo; `getOrGenerate()` solo llama al generador si el chunk no se descubrió antes. `snapshot()` ordena los chunks para obtener un JSON estable y `parseWorldSaveV2()` comprueba la versión y la estructura al leerlo. `ChunkData` permanece como transporte entre hilos del juego actual y no es un formato de guardado.

Este contrato TypeScript es una referencia ejecutable para el port. Aún falta conectarlo al runtime Rust, implementar su almacenamiento físico y elegir cómo dividir o comprimir los archivos. Antes de ello se debe medir el tamaño de guardados con varios cientos de chunks y el tiempo de lectura/escritura. El runtime PixiJS conserva `WorldSnapshot` versión 7 y su mecanismo de semilla más deltas.
