# Pipeline de assets

Cómo se genera un asset de Armada, desde los modelos voxel hasta el píxel en pantalla. Todo lo
que se cita aquí está en el repositorio: los modelos y las piezas en `artifacts/`, la
rasterización y el empaquetado del atlas en `lib/scripts/`.

El flujo oficial es **la ruta voxel**: el asset se arma con piezas voxel reutilizables y se
renderiza a sprite. No llama a ningún modelo de imagen y no cuesta nada. Lo que aún no ha
pasado por esa ruta vive congelado como sprite en `assets-legacy/`, y se migra cuando toca
rehacerlo.

```
artifacts/vox/clay/vox_prefabs.py              las piezas del kit            → artifacts/vox/prefabs/*.vox
artifacts/vox/clay/vox_models.py               las entidades armadas         → artifacts/vox/models/<nombre>.vox
artifacts/vox/clay/grass_clay.py               adornos Clay sobre la hierba  → artifacts/vox/models/block_*.vox
        │
        ▼
artifacts/vox/clay/vox_render.py (Blender)     modelo → sprite sobre el lienzo de plantilla
        │
        ▼
lib/assets/<tipo>/<nombre>.png                (+ .json de huella cuando la huella no es 1x1x1)
        │
        ▼
lib/scripts/build-atlas.sh            rasterize.py → pack_atlas → atlas.png + assets.manifest.json
        │
        ▼
cargo build                           el manifiesto va dentro del binario (include_str!)
```

Los sprites sin migrar (terreno, gradas, caminos, edificios, agua, sombra) son fijos por ahora:
son el PNG que hay en `assets/` o en `assets-legacy/`, y el PNG manda. Cuando uno migre a
voxel, su `.vox` pasa a ser la fuente y su PNG se regenera con `artifacts/vox/clay/vox_models.py --render`
o `artifacts/vox/clay/grass_clay.py`.

## 1. El lienzo de plantilla

Todo asset se dibuja sobre el mismo lienzo, que depende sólo de su huella `along x across x high`
(casillas a lo largo, a lo ancho y bloques de alto):

- ancho = `512 * (along + across)`
- alto = `256 * (along + across) + 341 * high`

Un bloque de terreno 1x1x1 mide 1024 × 853: el techo es el rombo `(512,0) (1024,256) (512,512)
(0,256)` y las caras bajan 341. El motor mide la caja de tinta sobre ese lienzo
(`pack_atlas`), así que **un asset que no respete el lienzo sale desplazado o con otro tamaño**.
El atlas guarda 320 px por casilla; la resolución del fichero fuente da igual mientras conserve
la proporción del lienzo. (Excepción: las reflexiones del agua, que no rellenan un bloque sino
una banda bajo la línea de agua — ver sección 4.)

La huella se declara en un `<nombre>.json` junto al fichero: `{"tiles": "2x1x2"}`. Obligatorio
cuando la huella no es 1x1x1 (o cuando la huella declara `reflection`).

## 2. La ruta voxel (el flujo oficial)

Una entidad no se dibuja: **se arma con piezas voxel reutilizables** (un bloque de hoja, un
tramo de tronco, una fruta) y el modelo armado se renderiza a sprite. Todas las entidades
comparten las mismas piezas, la misma paleta y la misma luz, y por eso se ven de la misma
familia. La especificación completa (medidas, estilo, paleta, kit y cómo crear piezas) está en
la skill `armada-voxel-assets`; aquí va el resumen operativo.

### Piezas

`artifacts/vox/clay/vox_prefabs.py` escribe `artifacts/vox/prefabs/*.vox`: bloque de hoja, tronco, rama,
fruta, flor… Un vóxel son 4 unidades de plantilla (una casilla, 128 vóxeles; un bloque de alto,
85), las piezas encajan en un módulo de 28 vóxeles y dejan 1 vóxel de aire por lado, y todos los
archivos llevan la misma paleta (un color por material, plano, sin luz horneada).

### Modelo

`artifacts/vox/clay/vox_models.py` arma las entidades con las piezas (los ocho árboles, el arbusto y los
dos bosquecillos); sus modelos quedan en `artifacts/vox/models/<nombre>.vox`. El modelo ocupa
**el volumen entero de su huella** (128 × 128 × 170 para un árbol 1x1x2), con el pie en el
centro del suelo de la casilla ancla: así el archivo dice dónde está plantado.

`artifacts/vox/clay/grass_clay.py` arma las variantes del techo de hierba: el bloque de
`assets/grass/block.png` **no se toca**; lo que se arma con piezas del kit es el
adorno (flores, brotes, hojas caídas, guijarros, setas, arbustos), de pie en z = 0 de un volumen
1x1x1, y su render se compone encima del bloque con un desplazamiento de −341 px del lienzo
(−171 px a la escala del bloque), donde el plano de suelo del adorno cae en la cara de arriba.
Sus modelos quedan en `artifacts/vox/models/block_*.vox` y sus sprites sustituyen a las
variantes del bloque.

### Sprite

`artifacts/vox/clay/vox_render.py` renderiza un modelo con Blender (Cycles) sobre el lienzo de
plantilla, listo para meter junto al PNG que sustituye:

```sh
blender -b -P artifacts/vox/clay/vox_render.py -- artifacts/vox/models/tree_7.vox \
    lib/assets/tree/block_7.png
```

Sin Blender instalado vale el módulo de pip: `pip install bpy` y
`python3 artifacts/vox/clay/vox_render.py modelo.vox sprite.png`. En macOS basta con tener
`/Applications/Blender.app` (el script lo encuentra solo). Cámara ortográfica a 45° y 30° (el
2:1 de las casillas) con el modelo aplastado a √(2/3) de su alto, porque un bloque del juego
mide 341 sobre 512; un sol arriba a la derecha y un cielo uniforme ajustados a los tonos de los
assets del juego (techo 1, cara derecha 0,93, cara izquierda 0,64); sin sombra en el suelo, que
la dibuja el juego.

El acabado por defecto es `--style clay`: los cubos se rehacen como una sola piel cerrada
(modificador Remesh), se suavizan hasta fundir los escalones de vóxel, reciben una ligera
irregularidad de arcilla amasada y un material mate con algo de brillo y de luz que cala.
`--style voxel` deja los cubos duros. Las constantes `CLAY_*` del script gradúan cada cosa.

`python3 artifacts/vox/clay/vox_models.py --render [nombres]` arma y renderiza de una vez cada modelo
sobre el asset que sustituye. En la Mac del equipo Blender 5.x está en `/Applications`; cada
sprite tarda unos treinta segundos en CPU.

### Motor

Como cualquier PNG: `scripts/build-atlas.sh` (sección 4), y recompilar: el binario lleva el
manifiesto dentro, y con un atlas nuevo y un binario viejo los sprites salen recortados.

## 3. Los sprites sin migrar: `assets/` y `assets-legacy/`

**Ya no queda ningún SVG en el repositorio**: todos los sprites son PNG y la huella se declara
en un `.json` al lado cuando no es 1x1x1. Las dos carpetas son:

- `lib/assets/` — el terreno (hierba, tierra, arena, caminos, agua) y los sprites
  creados por la ruta voxel (árboles, arbusto, bosquecillos, el propio bloque de hierba y sus
  variantes con adornos). Los generadores de terreno siguen en uso —
  `artifacts/vox/terrain/terrain_blocks.py` (hierba/tierra/arena) y `path_tiles.py` (los 16
  tiles de camino) — y escriben PNG directamente (`iso_lib.Asset.save_png`).
- `lib/assets-legacy/` — lo heredado que aún no pasa por la ruta voxel ni por la ruta de
  generadores que queden vivas: edificios (casa del sanador, torre…), las cuatro gradas
  (`artifacts/vox/terrain/stairs.py` las guarda, pero el PNG es el sprite y no se regeneran
  por ahora), los patrones de nubes y la sombra blanca que el agua y las sombras necesitan.
  Son fijos por ahora: su PNG es el sprite.

Migrar un asset a voxel es: armar su `.vox` en `artifacts/vox/clay/vox_models.py` (o `artifacts/vox/clay/grass_clay.py`
si es un adorno del techo de hierba), renderizarlo a un PNG con el mismo nombre en su carpeta y
regenerar el atlas (`scripts/build-atlas.sh`) — sin borrar el PNG, que sigue siendo el sprite;
lo que pasa a ser la fuente es el `.vox`.

Las reflexiones del terreno (`<material>/block_reflection.png`) son una excepción del lienzo:
son sprites dibujados colgando de la línea de agua, no bloques, y su lado de huella no es una
casilla entera. Su `.json` declara `{"tiles": "reflection"}`, que el empaquetador entiende
como una huella de una casilla cuyo `InkBox` se mide desde el borde superior de la obra en vez
de desde el pie del bloque: por eso cuelgan exactamente una altura de bloque bajo la línea de
agua, y nada más.

## 4. Entrada al motor

```sh
scripts/build-atlas.sh
```

1. `scripts/rasterize.py` reescala cada PNG a 320 px por tile y corta las hojas del jugador
   celda a celda; las pre-renderizadas con `artifacts/vox/player/player_render.py` o
   `artifacts/vox/player/player_model.py` viven en `lib/painted/`.
2. `pack_atlas` recorta cada sprite a su tinta, los coloca en estanterías en
   `content/images/atlas.png` (4096 px de ancho) y escribe
   `content/json/assets.manifest.json` con el frame y el `InkBox` de cada uno. La huella
   siempre viene del `.json` al lado (o es 1x1x1 por defecto); la tinta se mide de la silueta
   opaca sobre el lienzo declarado — el canvas del asset para los ordinarios, el borde de la
   obra para las reflexiones (`reflection`).
3. `content/images/cloud-shadow.png` (el patrón de las nubes) se copia tal cual al empaquetar;
   es un PNG commiteado, no se genera en el empaquetado, porque el empaquetador recorta el
   borde transparente de cada sprite y un patrón recortado dejaría de repetir.

El atlas y `content/` están commiteados: Netlify no regenera nada. Si cambias un sprite o un
`.vox`, regenera el atlas, commitea `atlas.png` + manifiesto y recompila (`cargo build`): el
binario lleva el manifiesto dentro, y con un atlas nuevo y un binario viejo los sprites salen
recortados.

## 5. Verificación

- `cargo test --workspace --locked`: los contadores de `manifest.test.rs`,
  `entities_catalog_test.rs` y `wfc_catalog_test.rs` hay que moverlos a mano al añadir assets.
  `terrain_view_appearance.rs` comprueba que cada techo de hierba mide lo mismo que el bloque
  llano — la composición de `artifacts/vox/clay/grass_clay.py` lo respeta por construcción (los adornos se quedan
  dentro de la silueta del bloque).
- La skill `armada-visual-check` (una escena `blank` con la entidad a una casilla del jugador,
  de día) es la comprobación visual real: que la sprite esté plantada en su casilla, que la
  sombra del juego salga de su pie y que el tamaño case con vecinas.

## 6. El pipeline del jugador

Las hojas del jugador son render 3D del modelo, no dibujo ni voxel:

- El modelo vive en `artifacts/vox/player/player_model/model.npz` (extraido del GLB de origen,
  ` UkHT1YhJiSHzediZLkBsP_model.glb`), con un color y una ponderación de seis huesos por vértice
  (cuerpo, cabeza, dos brazos, dos piernas).
- `artifacts/vox/player/player_model.py` lo dibuja con Blender, hueso a hueso en su sitio:
  compone el render de cada celda de cada hoja (walk, idle, jump, climb, flip, swim, jetpack) en
  `lib/painted/player-16_<hoja>.png`, posiciones exactas de la rejilla.
- Los generadores de poses (`player_walk.py`, `player_idle.py`, …) y `monkey.py` siguen en uso
  como librería de poses y geometría: `player_model.py` y `player_render.py` los importan.
- `scripts/rasterize.py` corta las celdas de cada hoja en `sheets/player-16_<hoja>/<fila>-<col>.png`
  dentro del directorio de trabajo del empaquetador, leyendo la rejilla de los `.json` de
  `assets/player-16/` (`cell`, `frames`, `facings`, `poses`).
- `pack_atlas` mete cada celda en `content/player-16_<hoja>.png` (textura propia por hoja, no el
  atlas compartido), con la rejilla descrita en el manifiesto, esquema 2: `facing * columns + pose`.

## 7. Coste

Cero. La ruta voxel no llama a ningún modelo de imagen. El posprocesado tampoco: ajustar fuerza,
tono o empalme se hace sobre el render o sobre las constantes del pipeline.
