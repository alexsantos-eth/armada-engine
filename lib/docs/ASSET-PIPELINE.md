# Pipeline de assets

Cómo se genera un asset de Armada, desde los modelos voxel hasta el píxel en pantalla. Todo lo
que se cita aquí está en el repositorio: los modelos y las piezas en `artifacts/`, la
rasterización y el empaquetado del atlas en `lib/scripts/`.

El flujo oficial es **la ruta voxel**: el asset se arma con piezas voxel reutilizables y se
renderiza a sprite. No llama a ningún modelo de imagen y no cuesta nada. Lo único que no pasa
por esa ruta son dos sprites fijos —el patrón de nubes y el téxel blanco de las sombras— y
viven en `assets/` como cualquier otro sprite.

```
artifacts/vox/clay/vox_prefabs.py              las piezas del kit            → artifacts/vox/prefabs/*.vox
artifacts/vox/clay/vox_models.py               las entidades armadas         → artifacts/vox/models/<nombre>.vox
artifacts/vox/clay/terrain_clay.py             hierba, tierra, arena, caminos → lib/assets/{grass,ground,sand,path}/block*.png
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

Los sprites sin migrar a voxel (terreno, gradas, caminos, agua, sombra) son fijos por ahora:
son el PNG que hay en `assets/`, y el PNG manda. Cuando uno migre a
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

`artifacts/vox/clay/vox_models.py` arma las entidades con las piezas (los trece árboles, el arbusto, los
tres bosquecillos en sus dos orientaciones, las tres piedras pequeñas `rock_small*` y las dos
piedras medianas `rock_medium` y `rock_medium_2`); sus modelos quedan en `artifacts/vox/models/<nombre>.vox`. El modelo ocupa
**el volumen entero de su huella** (128 × 128 × 170 para un árbol 1x1x2), con el pie en el
centro del suelo de la casilla ancla: así el archivo dice dónde está plantado.

### Cómo se arma, en JSON (`*.parts.json`)

Cada pieza lleva `collect`: si se queda flotando como ítem al recolectar la entidad. Por defecto lo es toda pieza que algún ítem de `items.json` declara en `pieces`; para dejar una de adorno, `put(..., collect=False)` en el modelo (los hongos pequeños de `mushrooms`) y `vox_models.py --parts` + `vox_parts_pack.py`.

Cada modelo de `vox_models.py` y `vox_buildings.py` escribe junto a su `.vox` un
`artifacts/vox/models/<nombre>.parts.json` con **las piezas del kit de las que se armó**: por pieza,
su nombre (`trunk`, `leaf_block`…), el vóxel donde está plantada (`at`: el medio de su huella, sobre su
punto más bajo, en vóxeles desde el pie de la casilla ancla) y sus cajas (`c` centro y `h` medios
tamaños, en vóxeles desde `at`, y `color`). `vox_prefabs.piece()` marca cada instancia y `parts_of`
las agrupa una vez colocadas con `moved`, `turned` y `spun`; una caja suelta del modelo cuenta como una
pieza llamada `box`. `python3 vox_models.py --parts` escribe solo estos JSON y deja los `.vox` como
están (el `.vox` versionado puede ir por detrás del generador).

`python3 artifacts/vox/clay/vox_parts_pack.py` junta los de las entidades con regla de recolección en
`items.json` en `lib/content/json/entity-parts.json` (por pieza: nombre, dónde está, su sprite `debris/p_<hash>`, el hash de sus cajas, y `collect` si al talar queda flotando como ítem), que el juego lee (`iso::debris::parse_parts`) para
hacer estallar la entidad en sus piezas al recolectarla. Se busca por el sprite (`tree/block_2`). `python3 artifacts/vox/clay/vox_debris.py` renderiza con Blender (clay, 32 muestras, unos 7 s cada una) un sprite por pieza distinta que falte en `lib/assets/debris/` (con nombres, esos aunque existan), con el origen de la pieza en el pie de la casilla; una pieza más ancha que una casilla va en un lienzo 2x2 y movida 64 vóxeles (`shift` en el JSON). Las piezas `collect` se renderizan sin contorno en `artifacts/vox/debris/` y `python3 lib/scripts/ink-debris.py` les dibuja el mismo contorno de tinta de los iconos (`build-ui-icons.py`) hacia `lib/assets/debris/`, para distinguir lo recolectable del escombro. Después `build-atlas.sh` y recompilar. Al
añadir una entidad recolectable hay que regenerar todo; el test
`the_packed_entities_read_and_cover_every_harvestable_sprite` falla si falta alguna.

`artifacts/vox/clay/vox_buildings.py` hace lo mismo con lo construido (las cinco piedras rúnicas,
las tres casas y los edificios, los de dos casillas en sus dos orientaciones) con las piezas de
piedra y de construcción: muros y tejados sobre el mismo módulo de 28.

`artifacts/vox/clay/vox_icons.py` renderiza los iconos **desnudos** de cada ítem y herramienta a `artifacts/vox/icons/<id>.png`: el icono de un ítem es la pieza voxel que el juego suelta por él (la primera pieza `collect` de su `pieces` en `items.json`, ampliada hasta llenar la casilla; `FACE` fija otra si hace falta) y el de una herramienta su modelo inclinado (`vox_tools.py`). El **contorno de tinta** (`#1a120d`, el `--ac-ink` del kit) no se hornea en esos renders: `lib/scripts/build-ui-icons.py` lo dibuja al recortar, igual para todos (ítems y herramientas), con ancho y ondulación como constantes (`OUTLINE`, `WOBBLE`), así que cambiar la línea nunca obliga a volver a renderizar. Tras cambiar un icono o el contorno: `python3 lib/scripts/build-ui-icons.py` y `node lib/scripts/export-ui.cjs`.

`artifacts/vox/clay/terrain_clay.py` genera todo el terreno de suelo: hierba
(`grass/block.png` y `block_2..4.png`), tierra (`ground/block.png`, `block_2..3.png`), arena
(`sand/block.png`, `block_2..3.png`) y los 16 caminos (`path/block_0..15.png`, uno por máscara
de conexión). Son terreno como las gradas: masa de borde a borde de la casilla, render clay
encima del de cubos duros. La hierba gotea sobre la tierra y lleva tufos (césped en z = 79); la
tierra, terrones y guijarros (z = 81); la arena, una costra más clara, ondas bajas y alguna
concha (z = 81); el camino es la hierba con un lecho de tierra hundido a z = 78 que llega al
centro de cada borde unido con 66 de ancho. Nada pasa de z = 85.

**Empalman sin corte**: el patrón es periódico (lo que sale por un borde entra por el opuesto) y
lo que cruza los bordes sale de una semilla por material, común a todas sus variantes; solo el
interior cambia. El terreno alterna las variantes casilla a casilla donde no hay adorno
(`PLAIN_LOOKS` en `src/terrain/terrain_view_appearance.rs`). El clay se modela sobre un margen
de las vecinas y se recorta a la casilla (`vox_render.py --margin N [--around]`): el techo con
margen por los cuatro lados, los lados con margen solo detrás, y se componen por la máscara del
rombo de la superficie.

La tierra tiene además cuatro **looks propios** que salen del mismo script con los mismos bordes
(`GROUND_TOPS`): `ground/block_dark.png` (manchas de tierra más honda), `block_stones.png` (losas medio hundidas y
grava), `block_damp.png` (hondonada húmeda con agua y una mata de junco) y `block_dry.png`
(matas de hierba seca). Como cada uno es un bloque entero, su caja de tinta es la del bloque
llano; el terreno los reparte casilla a casilla (`GROUND_TOPS` en
`src/terrain/terrain_view_appearance.rs`, ~30 % de la tierra), no por manchas de ruido como la
hierba: la tierra sale en parches pequeños y las manchas dejaban algunos sin ninguna variante. Colores nuevos: `SOIL_DEEP`, `SOIL_WET` (`CRACK` quedó sin uso al quitar la tierra agrietada).

`artifacts/vox/clay/grass_clay.py` arma las variantes del techo de hierba encima de ese bloque
(se rehace después de él): lo que se arma con piezas del kit es el adorno (flores, hojas caídas,
guijarros, setas), de pie en z = 0 de un volumen 1x1x1, y su render se compone encima del bloque
con un desplazamiento de −(341 − 24) px del lienzo: un bloque menos los 6 vóxeles que el césped
queda bajo el tope.
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

## 3. Los sprites: `assets/`

**Ya no queda ningún SVG en el repositorio**: todos los sprites son PNG y la huella se declara
en un `.json` al lado cuando no es 1x1x1. Todo vive en una sola carpeta:

- `lib/assets/` — el terreno (hierba, tierra, arena, caminos, agua), los sprites
  creados por la ruta voxel (árboles, arbusto, bosquecillos, el bloque de hierba y sus
  variantes con adornos, y desde el 2026-11-16 también las piedras rúnicas, las casas y los
  edificios, `artifacts/vox/clay/vox_buildings.py`, kits 2 y 3) y los dos sprites fijos que no
  pasan por la ruta voxel: el patrón de nubes (`assets/cloud/cloud-shadow.png`) y el téxel
  blanco que el agua y las sombras necesitan (`assets/shadow/white.png`). Desde el 2026-11-19 todo
  el terreno de suelo (hierba, tierra, arena y caminos) también sale de la ruta voxel,
  `artifacts/vox/clay/terrain_clay.py`.

Las cuatro gradas (`assets/stairs/block_{px,py,nx,ny}.png`) salen de
`artifacts/vox/clay/vox_stairs.py`. Son terreno, no entidad: la masa son prismas rectos de
borde a borde de la casilla (sin redondeo ni aire a los lados) y encima van piezas del kit; el
sprite compone el render clay sobre el render de cubos duros de la masa sola, para que la
silueta sea la casilla entera y los bloques empalmen.

Migrar un asset a voxel es: armar su `.vox` en `artifacts/vox/clay/vox_models.py` (`vox_buildings.py` si es algo construido, o `artifacts/vox/clay/grass_clay.py`
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
- `pack_atlas` mete cada celda en `content/images/player-16_<hoja>.png` (textura propia por hoja, no el
  atlas compartido), con la rejilla descrita en el manifiesto, esquema 2: `facing * columns + pose`.

### El cangrejo (NPC de playa)

El cangrejo también va en hojas, pero por la ruta voxel: `artifacts/vox/crab/crab.py` lo arma
con cajas del kit (`vox_prefabs.box`, paleta del kit, sin suelo propio), escribe cada pose como
`.vox` en `artifacts/vox/models/crab/` y, con `--render` (Blender o el módulo `bpy`), renderiza
cada pose en las 16 direcciones con el acabado clay de `vox_render.py`, girando el modelo sobre
su pie con el sol fijo. Salen `lib/painted/crab_{idle,walk}.png` y sus rejillas
`lib/assets/crab/{idle,walk}.json`: `idle` (8 poses, pinzas y respiración) y `walk` (columna 0
de pie y dos zancadas de 4 poses: el cangrejo corretea de lado). `rasterize.py` corta cualquier
`painted/<carpeta>_<hoja>.png` que tenga su `.json`, y `pack_atlas` da a cada hoja su textura
(`content/images/crab_<hoja>.png`). Se dibuja a la escala de su hoja (no a `PLAYER_SCALE`).
Tarda ~2 min en 4 núcleos.

### El conejo (NPC de pradera)

El conejo sigue la ruta del cangrejo: `artifacts/vox/rabbit/rabbit.py` lo arma con cajas del kit
(pelaje `FUR`, vientre blanco, orejas rosadas), escribe cada pose como `.vox` en
`artifacts/vox/models/rabbit/` y, con `--render`, renderiza las 16 direcciones con el acabado clay.
`--preview` renderiza solo una dirección de cada pose en `lib/target/rabbit-preview.png` para juzgar
el modelo en segundos. Salen `lib/painted/rabbit_{idle,walk,jump}.png` y sus rejillas
`lib/assets/rabbit/*.json`: `idle` (8 poses, sentado: nariz, orejas, flancos), `walk` (columna 0 sentado y
dos saltitos de 4 poses) y `jump` (las cinco fases del salto grande, en el orden del jugador:
takeoff, rise, apex, fall, landing). A diferencia del cangrejo mira hacia donde va. Tarda ~2 min.

### Decoración del campo abierto

`lib/assets/field/` guarda las entidades que llenan la hierba fuera de poblados: setas, dos
manchas de hierba alta, charco de turba con cañas, tronco caído (2 casillas), túmulo funerario
(2 casillas, 2 bloques), muro derrumbado, pozo viejo, tumba de escudo y lanza, carro abandonado
(2 casillas), cofre semienterrado y tótem. Salen de `vox_models.py` (las de naturaleza) y
`vox_buildings.py` (ruinas y objetos) con las piezas del campo de `vox_prefabs.py` (`toadstool`,
`grass_tuft`, `reed`, `puddle`, `log_long`, `root_plate`, `turf_block`, `wheel`, `spear`,
`chest`, `totem`…). Se colocan por las familias `meadow`, `barrow`, `ruins` y `cart` de
`wfc.json`, con multiplicador en `settlements.json` → `wilderness.weights` (las zonas de poblado
no las listan, así que nunca salen dentro). Solo la hierba alta lleva `drawUnderPlayer` y colisión 0.

### Decoración del suelo de tierra

`lib/assets/barren/` guarda las entidades que solo crecen en la superficie `ground` (la tierra
desnuda): veta de mineral (hierro y ámbar), montón de huesos, mojón de losas, menhir (2 bloques),
entrada de túmulo (2 casillas, bloquea), forja en ruinas, hoyo de excavación con pico, cardo
seco, cadena oxidada y yelmo sobre cráneo; y desde 2026-11-20 árbol muerto (2 bloques), tocón
partido, matorral seco, hierba seca (dos), cascotes, lanzas de una batalla, madriguera y poste con
cráneo de buey (2 bloques), en madera muerta (`dead` de los troncos, color `DEADWOOD`). Salen de
`vox_models.py` (huesos, cardo, madera muerta y hierba seca) y
`vox_buildings.py` (el resto) con las piezas del suelo de `vox_prefabs.py` (`bone`, `rib`,
`skull`, `helmet`, `link`, `pickaxe`, `thistle`, `vein`, `flat_stone`, `menhir`, `ash`, `pit`…).
Su blueprint pide `"surfaces": ["ground"]` y se colocan por las familias `thistle`, `remains`,
`outcrop`, `diggings`, `barrow_entrance`, `deadwood` y `debris` de `wfc.json`, con multiplicador
en `settlements.json` → `wilderness.weights`. Con los pesos de 2026-11-20 una casilla de tierra
lleva entidad un 28 % de las veces (antes 18 %, y dos tercios eran piedritas genéricas). Todas
tienen colisión salvo la cadena oxidada y la hierba seca, que llevan `drawUnderPlayer` y
colisión 0.

### Entidades animadas

`lib/assets/animated/` guarda las entidades que el juego anima en tiempo real: antorcha en poste,
brasero de hierro, farola colgante, enjambre de moscas (sobre un charco en hierba, una osamenta en
tierra o peces muertos en arena), géiser (solo tierra), hojarasca que recibe hojas cayendo (hierba)
y velas rituales sobre una losa de altar. El modelo (`vox_buildings.py`) lleva solo lo que está
quieto —el poste con su copa de brasas, el cuenco, el brazo con el gancho, las velas con su mecha,
el cono de sínter con su poza—; las llamas, la farola, las moscas, el vapor, el agua y las hojas
los dibuja el cliente (`src/effects/emitters.rs`) según `"effect"` en el blueprint (`torch`,
`brazier`, `lantern`, `flies`, `geyser`, `leaves`, `candles`). Los anclajes de cada efecto están
escritos junto a cada modelo y repetidos en `emitters.rs`: si se mueve uno, se mueve el otro.
Piezas nuevas: `torch_cup`, `bowl`, `rod`, `candle*`, `wax`, `sinter*`, `hot_pool`, `fish_flat`;
colores `WAX`, `SINTER`, `HOT_WATER`. Se colocan por las familias `lights` y `flies` de
`wfc.json` (más `geyser`, `leaf_emitter`, `ritual_candles`), en `wilderness.weights` y en las
zonas de poblado (centro, mercado, talleres, borde y arcén para las luces).

## 7. Coste

Cero. La ruta voxel no llama a ningún modelo de imagen. El posprocesado tampoco: ajustar fuerza,
tono o empalme se hace sobre el render o sobre las constantes del pipeline.
