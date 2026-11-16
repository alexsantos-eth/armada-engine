---
name: "armada-visual-check"
description: "Úsala para ver Armada Engine en marcha sin que nadie toque el teclado: escribe un scene.json, lo corre con --scene (en Linux sin pantalla, con xvfb-run) y obtiene capturas PNG y un report.json. Es la forma de comprobar de verdad terreno, entidades, sombras, fases del día, animación o cámara después de un cambio."
---

# Comprobación visual de Armada Engine

El cliente nativo corre **desde un archivo** en vez de desde una persona: una escena describe el
mundo, lo que se construye en él, dónde está el jugador y una lista de pasos; el proceso los
ejecuta, escribe las capturas PNG que le pidan, deja un `report.json` al lado y sale solo.

Úsala siempre que un cambio se juzgue mirando: terreno, colocación de entidades, sombras,
reflejos, fases del día, animación del jugador, cámara, polvo o cualquier cosa que un test de
dominio no demuestre. Un test verde no dice que se vea bien; esta skill sí, y se puede correr sin
que el usuario esté delante.

La referencia completa del formato está en `lib/docs/TESTBED.md`. Esta skill es cómo usarlo.

## Lo mínimo

```sh
cd lib
scripts/run-scene.sh scenes/scene.json          # macOS: abre su ventana y sale solo
```

Sin pantalla (contenedor Linux, CI), que es el caso normal desde un hilo de Claude:

```sh
cd lib
cargo build --locked --bin iso-core
xvfb-run -s "-screen 0 1200x800x24" ./target/debug/iso-core --scene scenes/scene.json
```

Imprime cada captura que escribe y una línea de resumen. Las capturas y el `report.json` caen en
la carpeta `out` de la escena, relativa al propio archivo de escena.

**Prepara el contenedor una vez por sesión** (si no, ni los tests enlazan):

```sh
sudo apt-get update -qq
sudo apt-get install -y libasound2-dev xvfb libgl1 libegl1 libglx-mesa0 mesa-utils
```

El ruido de `Audio thread died` / `Can't open PCM device` es solo que el contenedor no tiene
ALSA: no afecta a la imagen ni al informe. Fíltralo con `2>/dev/null` o `| grep -v Audio`.

## Una escena

```json
{
  "world": "blank",
  "window": [960, 600],
  "zoom": 0.8,
  "phase": "day",
  "centre": [16, 16],
  "player": [16, 16],
  "edits": [
    { "surface": { "at": [17, 16], "material": "sand" } },
    { "raise":   { "at": [18, 16], "times": 2 } },
    { "place":   { "at": [14, 16], "blueprint": "runestone_tall" } }
  ],
  "steps": [
    "settle",
    { "shot": "antes.png" },
    { "walk": { "dir": [1, 0], "frames": 20 } },
    "jump",
    { "wait": { "frames": 15 } },
    { "phase": "sunset" },
    "settle",
    { "shot": "despues.png" }
  ],
  "out": "shots",
  "maxFrames": 600
}
```

Cabecera: `world` (`"blank"` = un chunk plano de hierba, como `/maker`; `"procedural"` = el mundo
del juego), `seed`, `centre`, `window`, `zoom` (por debajo de 1 cabe más mundo), `phase`,
`player`, `edits`, `steps`, `out` y `maxFrames`.

Ediciones, las siete herramientas del editor con sus mismas reglas: `raise`, `lower`, `surface`
(`grass|sand|ground|path|stairs|water`), `tint`, `top`, `place` (`blueprint` es el `id` de
`content/json/entities.json`, con `"turned": true` para el hermano del otro eje) y `erase`.

Pasos: `"settle"`, `"jump"`, `"jetpack"`, `{"wait": {...}}`, `{"walk": {"dir": [x, y], "frames":
n, "run": bool}}`, `{"teleport": [x, y]}`, `{"phase": "..."}`, `{"edit": {...}}` y
`{"shot": "nombre.png"}`. `dir` va en ejes del mundo: `[1, 0]` es `+x` (arriba a la derecha).

## Las cuatro reglas que importan

1. **Pon `"settle"` antes de cada `shot`.** El horneado de sombras gasta 3 ms por fotograma y
   entra con un fundido; una captura tomada antes sale a medio hornear. `settle` repite fotograma
   hasta que todo lo que hay en pantalla está generado y con su luz lista. Si cambias de fase,
   vuelve a hacer `settle` antes de capturar.
2. **Lee el `report.json`, no solo la imagen.** Trae fotogramas, capturas escritas, dónde acabó
   el jugador, las entidades en pantalla con celda y elevación, y `notes`. Afirma lo que diga el
   informe; no describas de memoria lo que crees que se ve.
3. **Una edición que no entra lo dice en `notes`**, con el estado de la celda:
   `an edit on [-118, -72] changed nothing: the cell is Ground at elevation 1`. Casi siempre es
   la superficie que el blueprint exige, la elevación o que ya hay algo en pie. Corrige la celda
   de la escena, no el motor.
4. **Para comparar antes y después**, corre la misma escena con el código viejo y con el nuevo:
   el fotograma vale siempre un paso fijo mientras hay guion, así que dos corridas de la misma
   escena dan la misma imagen y la diferencia es el cambio.

## Cómo elegir la escena

- **Un bloque, un asset, una sombra, una gradería** → `"world": "blank"`: un chunk plano y solo
  lo que tú pones, sin nada procedural alrededor. Es lo más rápido y lo más legible.
- **Generación, biomas, caminos, poblados, densidad** → `"world": "procedural"` con `seed` y
  `centre` fijos. Baja el `zoom` a 0.5 para ver varios chunks.
- **Animación o física del jugador** → pasos `walk`, `jump`, `jetpack` y `wait`, con una captura
  en cada momento que quieras comparar.
- **Luz** → la misma escena con `{"phase": "dawn"}`, `"day"`, `"sunset"` y `"night"`, cada una
  con su `settle` y su captura.

Deja las escenas de un solo uso fuera del repo (`/tmp`, o la carpeta temporal de la sesión); si
una escena sirve para comprobar algo que se va a revisar más veces, guárdala en `lib/scenes/` y
dale un nombre que diga qué comprueba.

## Mirar la captura

Abre los PNG y descríbelos tú: es el único paso que no automatiza nada. Lo que se busca casi
siempre es lo mismo — que el sprite esté en la casilla que dice el informe, que la sombra caiga
hacia donde manda la fase, que nada se dibuje delante de lo que debería taparlo, que no haya
costuras entre chunks, y que el color sea el de la fase.

Si entregas una comprobación visual al usuario, adjunta la captura; una afirmación sobre cómo se
ve algo, sin la imagen, no vale.

## Límites

- Solo nativo: la build WASM no tiene argumentos con los que nombrar una escena.
- Una corrida guionizada no lee ni escribe la partida guardada y no pinta el overlay, así que no
  sirve para comprobar el HUD ni el panel del editor.
- En `"blank"` se aplana un único chunk (32 × 32 casillas) alrededor del `centre`; una casilla
  fuera de él no existe y la edición lo dice en `notes`.
- Con un `zoom` muy bajo puede entrar en pantalla más mundo del que el radio de chunks carga: el
  `settle` esperaría hasta agotar `maxFrames` y el informe lo deja anotado.
- En macOS la ventana tiene que estar abierta y sin minimizar para que la captura lleve
  contenido.
- Esta skill no commitea nada. El commit y el push solo los hace `armada-commit` cuando el
  usuario la invoca.

## Mantenerla al día

Si cambia el esquema de `scene.json`, los pasos, el informe o la forma de correrlo, actualiza en
el mismo cambio `lib/docs/TESTBED.md`, los `mod.md` de `iso::testbed` y `src/testbed`, y esta
skill. El reparto del código es el de siempre: las reglas en `crates/iso/src/testbed/`
(esquema, máquina de pasos, edición vía `iso::maker::apply_brush`, informe) y el archivo, la
ventana y el disco en `src/testbed/`.
