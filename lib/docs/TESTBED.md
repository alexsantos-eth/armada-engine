# Probar el juego sin tocar el teclado (`scene.json`)

El juego puede correr desde un archivo en vez de desde una persona: se describe un mundo y una
lista de pasos, se ejecuta un comando, y salen capturas PNG y un informe JSON. Está pensado para
que un agente pueda colocar entidades, cambiar el terreno, mover al jugador y mirar el resultado
sin que nadie esté delante.

```bash
scripts/run-scene.sh scenes/scene.json
```

El proceso abre su ventana, construye la escena, toma lo que le pidan y **sale solo**. Imprime en
la terminal cada captura que escribe y una línea de resumen al acabar.

## Un ejemplo completo

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
  "out": "capturas",
  "maxFrames": 600
}
```

## La cabecera

| Campo | Qué hace |
| --- | --- |
| `world` | `"procedural"` (el mundo del juego, por defecto) o `"blank"` (un chunk plano de hierba, como `/maker`). |
| `seed` | La semilla del mundo procedural; sin ella, la del juego. |
| `centre` | La celda alrededor de la que abre el mundo. En `blank` se aplana el chunk que la contiene. |
| `window` | Tamaño de la ventana en píxeles, `[ancho, alto]`. Por defecto 960 × 600. |
| `zoom` | Menos de 1 aleja la cámara y cabe más mundo; más de 1 la acerca. |
| `phase` | Fija la luz a `dawn`, `day`, `sunset` o `night` durante toda la corrida. |
| `player` | La celda en la que aparece el jugador, con la cámara ya encuadrada. |
| `edits` | Lo que se construye antes del primer paso (ver abajo). |
| `steps` | Los pasos de la corrida. Sin pasos: esperar la luz y tomar `scene.png`. |
| `out` | Carpeta de salida, relativa al propio archivo de escena. Por defecto `shots`. |
| `maxFrames` | Tope de fotogramas; por defecto 600 (treinta segundos al paso fijo). |

## Las ediciones

Son las siete herramientas del editor `/maker`, con las mismas reglas: lo que el editor
rechazaría también lo rechaza una escena.

```json
{ "raise":   { "at": [x, y], "times": 2 } }
{ "lower":   { "at": [x, y] } }
{ "surface": { "at": [x, y], "material": "grass|sand|ground|path|stairs|water" } }
{ "tint":    { "at": [x, y], "zone": 1 } }
{ "top":     { "at": [x, y], "variant": 2 } }
{ "place":   { "at": [x, y], "blueprint": "runestone_tall", "turned": false } }
{ "erase":   { "at": [x, y] } }
```

`blueprint` es el `id` tal como aparece en `content/json/entities.json`. `turned: true` coge el
hermano del otro eje (`mead_hall_x` → `mead_hall_y`); un blueprint sin eje en el nombre no gira, y
la escena lo dice.

## Los pasos

```json
"settle"                                       // espera a que la luz esté al día
"jump"                                         // un fotograma de la tecla de salto
"jetpack"                                      // pone o quita la mochila
{ "wait": { "frames": 20 } }                   // 20 fotogramas sin tocar nada
{ "walk": { "dir": [1, 0], "frames": 40, "run": true } }
{ "teleport": [x, y] }                         // mueve al jugador, con la cámara ya puesta
{ "phase": "night" }                           // cambia la fase de la luz
{ "edit": { "raise": { "at": [4, 4] } } }      // una edición a mitad de corrida
{ "shot": "nombre.png" }                       // escribe el fotograma
```

`dir` va en los ejes del mundo, no en los de la pantalla: `[1, 0]` es `+x` (arriba a la derecha) y
`[0, 1]` es `+y` (arriba a la izquierda). Se normaliza, así que `[3, 4]` vale.

**`settle` es la pieza importante.** El horneado de sombras gasta solo 3 ms por fotograma y
además entra con un fundido, así que una captura tomada demasiado pronto sale sin sombras. En vez
de adivinar una espera, `settle` repite fotograma hasta que todos los chunks en pantalla están
generados y su luz horneada y fundida del todo. Si `maxFrames` se agota antes, la corrida para y
el informe lo dice.

Un `shot` termina su fotograma, así que lo que venga después (un `teleport`, otra fase) no
contamina la imagen que acaba de salir.

## El informe

Junto a las capturas queda un `report.json`:

```json
{
  "frames": 54,
  "stepsTaken": 5,
  "steps": 5,
  "shots": ["antes.png", "despues.png"],
  "phase": "sunset",
  "player": { "x": 17.3, "y": 16.5, "elevation": 0.0, "cell": [17, 16] },
  "entities": [{ "blueprint": "runestone_tall", "cell": [14, 16], "elevation": 0 }],
  "notes": []
}
```

`entities` lista lo que hay en pie en los chunks que dibujó el último fotograma, ordenado por
celda, de modo que dos corridas de la misma escena responden igual. `notes` recoge lo que salió
distinto de lo pedido; una edición que no entró dice por qué:

```
an edit on [-118, -72] changed nothing: the cell is Ground at elevation 1
```

Con eso se corrige la escena sin abrir el juego: ahí hacía falta hierba.

## Escenas guardadas

En `lib/scenes/` viven las escenas que sirven para comprobar algo más de una vez:

- `scene.json` — el ejemplo del formato, sobre un chunk plano.
- `village-greens.json` — un poblado completo con su vegetación: zona central limpia, patios detrás de las casas y el cinturón de arboleda. Centrada en `(267, 204)` con la semilla del juego, `zoom` 0,45 para que entren varios chunks. Es la escena con la que se miran los cambios de `iso::settlements` y de `iso::entities::greenery`.
- `pr-spawn.json` y `pr-village.json` — las que corre el workflow de capturas en cada PR (ver más abajo).

```sh
cd lib
scripts/run-scene.sh scenes/village-greens.json   # deja scenes/shots/village-greens.png
```

Las capturas y el `report.json` caen en `scenes/shots/`, que no se commitea.

## Determinismo

Mientras hay guion, el fotograma cuenta siempre como un paso fijo de la simulación, no como lo
que midiera la ventana. El jugador, el oleaje, el polvo y las nubes avanzan igual en cada corrida
por rápido o lento que dibuje la máquina, así que dos corridas de la misma escena dan la misma
imagen.

## Correrlo sin pantalla

La corrida necesita una ventana con GL, pero no necesita a nadie mirándola: en Linux basta un
servidor X virtual.

```bash
xvfb-run -s "-screen 0 1200x800x24" ./target/debug/iso-core --scene escenas/scene.json
```

Así es como se comprueba desde un contenedor sin pantalla. En macOS se corre con
`scripts/run-scene.sh` y la ventana tiene que estar abierta y sin minimizar.

## Límites conocidos

- Es solo nativo: la build web no tiene argumentos con los que nombrar una escena.
- Una corrida guionizada no lee ni escribe la partida guardada, y tampoco pinta el overlay.
- En `blank` se aplana un único chunk (32 × 32 celdas); una celda fuera de él no existe y la
  edición lo dice.
- Con un `zoom` muy bajo puede entrar en pantalla más mundo del que el radio de chunks carga; el
  `settle` esperaría hasta agotar `maxFrames`, y el informe lo deja anotado.

## Capturas en cada pull request

`.github/workflows/pr-screenshots.yml` corre escenas en cada PR contra `iso-rust` que toque
`lib/`: compila el binario nativo en release, corre las escenas con Xvfb y deja las capturas en un
comentario del PR (que se actualiza en cada push) y en un artefacto de la corrida.

Qué escenas corren:

- todas las `lib/scenes/pr-*.json`: el juego tal como arranca (`pr-spawn`, de día, tras andar y
  saltar, al atardecer y de noche), un poblado entero (`pr-village`) y las mismas dos posiciones
  de cerca (`pr-spawn-close`, `pr-village-close`: zoom 1,8 y 1,5, de día, al atardecer y de noche)
  para poder comprobar las sombras;
- además, cualquier otra `lib/scenes/*.json` que el PR añada o cambie. Es la forma de mostrar la
  feature: una escena que la encuadre (con `edits`, `place`, `teleport` o una `seed`) entra sola
  en el comentario.

Las imágenes se suben a la rama huérfana `pr-screenshots` (`pr-<n>/<sha>/…`), que solo guarda
PNGs y nunca se mergea; al cerrar el PR se borra su carpeta, pero los comentarios antiguos siguen
viéndose porque enlazan el commit que las publicó. Una escena que falla o agota su tiempo
(`SCENE_TIMEOUT`, 300 s) aparece en la tabla del comentario sin parar el resto. Los scripts están en
`.github/scripts/`.
