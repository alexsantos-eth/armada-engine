---
name: "armada-voxel-assets"
description: "Úsala para crear o cambiar assets de Armada Engine por la ruta voxel: los sprites se arman con las piezas (prefabs) del kit, salen como .vox y se renderizan en Blender con acabado clay sobre el lienzo de la casilla. Es la fuente oficial de las reglas de assets (sustituyó al flujo SVG/fal.ai). También sirve para añadir piezas nuevas al kit."
---

# Assets voxel de Armada: kit de piezas, `.vox` y render en Blender

Una entidad no se dibuja: **se arma con piezas voxel reutilizables** (un bloque de hoja, un
tramo de tronco, una fruta) y el modelo armado se renderiza a sprite. Todas las entidades
comparten las mismas piezas, la misma paleta y la misma luz, y por eso se ven de la misma
familia. No se llama a ningún modelo de imagen y no cuesta nada.

Este flujo es el oficial. `iso-asset-generator` (SVG dibujado + pintado fal.ai) está obsoleto —
conservado solo como referencia histórica—; no uses nada del flujo antiguo para un asset nuevo.
Todas las entidades (naturaleza, piedras rúnicas, casas y edificios) están migradas y viven en `lib/assets/`, junto con el terreno y los dos sprites fijos —el patrón de nubes y el téxel blanco— (ver `lib/docs/ASSET-PIPELINE.md`).

```
artifacts/vox/clay/vox_prefabs.py   las piezas del kit            → artifacts/vox/prefabs/*.vox
artifacts/vox/clay/vox_models.py    naturaleza armada             → artifacts/vox/models/<nombre>.vox
artifacts/vox/clay/vox_buildings.py piedras, casas y edificios    → artifacts/vox/models/<nombre>.vox
artifacts/vox/clay/vox_stairs.py    las cuatro gradas (terreno)   → lib/assets/stairs/block_*.png
artifacts/vox/clay/vox_render.py    Blender: modelo → sprite PNG  → lib/assets/<dir>/<asset>.png
lib/scripts/build-atlas.sh sprite → atlas y manifiesto   (y recompilar el juego)
```

`artifacts/vox/clay/vox_lib.py` es el núcleo que comparten (cajas redondeadas → vóxeles → `.vox`).
Solo usa la librería estándar de Python; Blender solo hace falta para el paso de render.

## 1. Las medidas que no se cambian

| Regla | Valor |
| --- | --- |
| Escala | 1 vóxel = 4 unidades de plantilla (4 px del lienzo) |
| Casilla | 128 × 128 vóxeles |
| Altura de un bloque | 85 vóxeles (2 bloques: 170; 3 bloques: 255) |
| Módulo | 28 vóxeles. Tres módulos son un bloque de alto |
| Junta | cada pieza deja 1 vóxel de aire por lado: dos vecinas enseñan una junta de 2 |
| Redondeo | radio del 40 al 45 % del lado menor de la pieza |
| Pivote de una pieza | centro de su base |
| Límite de un modelo | 256 vóxeles por eje: como mucho 2 casillas de largo y 3 bloques de alto |

Ejes del modelo: **x** baja hacia la derecha en pantalla, **y** baja hacia la izquierda, **z**
sube. El pie de la casilla ancla es `(0, 0, 0)`. La cara `+x` es la iluminada (abajo a la
derecha) y la cara `+y` la que queda en sombra (abajo a la izquierda).

**Un modelo ocupa el volumen entero de su huella**: 128 por casilla en x e y, 85 por bloque
de alto (un árbol 1x1x2 es 128 × 128 × 170). Así el `.vox` dice dónde está plantada la entidad
dentro de su casilla, y el render cae en el lienzo sin más datos. `vox_models.py` lo escribe
así; si se arma a mano en MagicaVoxel, hay que fijar ese tamaño de modelo **antes** de
construir, y la casilla ancla es la primera.

## 2. Estilo

- **Pocas piezas, grandes y legibles.** El detalle viene de la silueta y de dónde va cada
  pieza, no de la cantidad. Un árbol lleva de 15 a 35 piezas.
- **Las juntas se ven.** Cada pieza se lee como un trozo de arcilla aparte. Las hojas van
  siempre en la rejilla del módulo (centros a múltiplos de 28, o a ±14 en un 2x2); nunca se
  funden dos bloques en uno.
- **Capas que se van cerrando.** Las copas se arman por capas con los patrones de
  `vox_models.py`: `RING` (3x3 sin el bloque del frente), `FULL` (3x3), `PLUS` (una cruz) y
  `QUAD` (2x2). De abajo arriba cada capa es igual o menor que la anterior, y arriba va un
  bloque o una punta (`leaf_cap`).
- **El frente de la capa más baja va vacío** (`RING`, o `QUAD[:3]`), y la copa se desplaza de
  2 a 6 vóxeles hacia atrás (x e y negativos). Si no, el bloque del frente tapa el tronco.
- **Un solo acento por entidad**: fruta, hojas rojas o setas. Va **en la cara** de un bloque:
  el centro de la fruta en el plano de la cara (`x = centro del bloque + 13`, o lo mismo en
  y), a media altura del bloque. Metida más adentro queda enterrada y no se ve.
- **Sin suelo propio.** Ninguna entidad lleva losa, tarima, lecho de grava ni base de ningún
  tipo: pisa directamente el terreno de su casilla, y sus piezas empiezan en z = 0. (Regla de
  Alex, 2026-11-16. Un zócalo de piedra bajo un muro es muro, no suelo.)
- **Sin sombra en el suelo.** El juego dibuja la sombra de cada entidad; el modelo no lleva
  ninguna pieza que la imite.
- **Los árboles miden dos bloques**: llegan a z = 164–170. Un árbol «pequeño» es un árbol de
  dos bloques con menos copa, nunca uno más bajo. Arbustos, rocas, tocones y props no tienen
  esa regla.
- **Entidades de dos casillas**: se escriben una vez en ejes locales (`u` a lo largo, `v` a lo
  ancho, desde el centro de la huella) y se generan las dos orientaciones desde ahí, como
  hace `grove(axis)`. Nunca se espeja un sprite: el espejo cambia la cara iluminada por la
  de sombra.

## 3. Paleta

Una sola paleta para todo el kit, colores planos de material. El modelo **no lleva luz
pintada**: la pone el render. Una variante de color es otro índice de la misma pieza, no una
pieza nueva.

| Material | Color | Uso |
| --- | --- | --- |
| `LEAF` | `#80c034` | hoja de casi todos los árboles y del arbusto |
| `LEAF_DARK` | `#4c8f3a` | coníferas |
| `LEAF_AUTUMN` | `#f0a830` | abedul de otoño |
| `ROSETTE` | `#6fb81e` | hojas a ras de suelo, tallos, brotes |
| `WOOD` | `#8a5a30` | troncos y ramas |
| `BIRCH` / `BIRCH_MARK` | `#f1ece1` / `#4a4038` | corteza de abedul y sus marcas |
| `BARK` | `#7a5a3a` | tronco caído |
| `CUT` | `#d9b98a` | madera recién cortada (tocón, extremos del tronco) |
| `MOSS` | `#6f8f4a` | musgo sobre roca o madera |
| `RED` / `WHITE` / `YELLOW` / `PINK` | `#d9463a` / `#f4f1e6` / `#f4bd43` / `#f7a8c9` | fruta, pétalos, centro de flor, copa de cerezo (`blossom`) |
| `CAP` / `STEM` / `DOT` | `#b5473a` / `#eee8d8` / `#fff2dc` | seta |
| `OCHRE` / `RUST` | `#d9a441` / `#c9702e` | hojas caídas |
| `ROCK` / `ROCK_DARK` | `#9a9a96` / `#7c7c7a` | piedra |
| `STONE_SAND` / `STONE_CLAY` | `#d8c9a3` / `#c8694a` | piedra clara y piedra roja |
| `GRAVEL` / `DIRT` | `#b8ae9c` / `#a8794f` | sin uso desde que las entidades no llevan suelo |
| `RUNE_BLUE` / `RUNE_CYAN` / `RUNE_DARK` | `#3f8fd9` / `#49c8c0` / `#8a3a2a` | runas (las rojas usan `RED`) |
| `PLANK` / `TIMBER` / `PLASTER` | `#a8713d` / `#5e3d24` / `#eadfc4` | tabla, madera oscura, revoco |
| `DOOR` | `#b98345` | hoja de puerta |
| `THATCH` / `TURF` / `TILE` | `#e3c56a` / `#69a83c` / `#d9703a` | paja, tepe, teja |
| `SHINGLE` / `SHINGLE_DARK` | `#9a5b2e` / `#8a3f2c` | tablilla clara y oscura |
| `GLOW` / `IRON` / `FIRE` / `BREW` | `#ffd66b` / `#4a4a52` / `#f7802a` / `#5fd03a` | ventana encendida, hierro, fuego, caldero |

Un material nuevo se añade como constante en `vox_prefabs.py` **y a la lista `PALETTE`**
(si falta, el script se detiene), **siempre al final**: los índices de los `.vox` ya escritos no se mueven. Elige tonos medios y saturados: el render los oscurece en
las caras en sombra por su cuenta. Como mucho 255 colores.

## 4. Los kits

### Kit 1: naturaleza

Tamaños en vóxeles, ancho × fondo × alto. Las variantes son el sufijo del archivo
(`leaf_block_dark.vox`) y el argumento `variant` al armar.

| Pieza | Tamaño | Variantes | Uso |
| --- | --- | --- | --- |
| `leaf_block` | 26 × 26 × 26 | green, dark, autumn, blossom | el bloque de copa; una celda del módulo |
| `leaf_block_small` | 20 × 20 × 20 | green, dark, autumn, blossom | capas altas más estrechas (celda de 22) |
| `leaf_cap` | 32 × 32 × 24 | green, dark, autumn, blossom | remate ancho de una copa |
| `leaf_slab` | 36 × 36 × 12 | green, dark, autumn, blossom | copa plana (celda de 38, capas cada 13) |
| `leaf_tuft` | 20 × 20 × 11 | green, dark, autumn, blossom | mata baja, almohadilla de rama (celda de 21) |
| `trunk` | 14 × 14 × 28 | brown, birch | tronco; se apila cada 28 |
| `trunk_thin` | 9 × 9 × 28 | brown, birch | rama vertical, retoño |
| `branch` | 26 × 8 × 8 | brown, birch | brazo horizontal (a lo largo de x; `turn=True` para y) |
| `stump` | 16 × 16 × 14 | — | tocón con el corte claro |
| `log` | 30 × 12 × 13 | — | tronco caído con musgo |
| `fruit` | 7 × 7 × 7 | — | el acento rojo |
| `flower_big` | 17 × 17 × 11 | white, red, yellow, pink | flor sobre su roseta |
| `wildflower` | 11 × 11 × 16 | red, white | flor de tallo |
| `mushroom` | 10 × 9 × 11 | — | seta |
| `sprout` | 14 × 14 × 13 | — | tres briznas |
| `fallen_leaf` | 15 × 11 × 2 | ochre, rust | hoja en el suelo |
| `pebble_s` / `_m` / `_l` | hasta 12 × 10 × 6 | — | guijarros |
| `rock_s` | 14 × 12 × 8 | — | piedra suelta |
| `rock_l` | 30 × 26 × 19 | — | roca con losa de musgo |

### Kit 2: piedra

| Pieza | Tamaño | Variantes | Uso |
| --- | --- | --- | --- |
| `stone_block` | 26 × 26 × 26 | grey, dark, sand, clay | sillar: una celda del módulo (muros, torre, gradas de un santuario) |
| `stone_half` | 26 × 26 × 12 | grey, dark, sand, clay | zócalo, escalón, muro bajo |
| `stone_small` | 14 × 14 × 14 | grey, dark, sand, clay | hilada de chimenea, plinto, brasero |
| `standing_stone` | 22 × 16 × 54 | grey, sand | piedra rúnica |
| `standing_stone_tall` | 24 × 17 × 78 | grey, sand | la alta: casi el bloque entero (85) |
| `standing_stone_small` | 16 × 13 × 30 | grey, sand | la baja, o el pie de una rota |
| `stone_lying` | 54 × 20 × 10 | grey, sand | piedra caída (a lo largo de x) |
| `moss_patch` | 10 × 8 × 3 | — | musgo suelto sobre piedra, teja o suelo |
| `rune` | 2 × 9 × 12 | blue, cyan, red, dark | glifo prensado en una cara `+x` (`turn=True` para `+y`) |
| `rune_flat` | 12 × 9 × 2 | blue, cyan, red, dark | el mismo glifo tumbado sobre una cara de arriba |

### Kit 3: construcción

| Pieza | Tamaño | Variantes | Uso |
| --- | --- | --- | --- |
| `wall_block` | 26 × 26 × 26 | plank, timber, plaster | una celda de muro |
| `wall_half` | 26 × 26 × 12 | plank, timber, plaster | relleno del hastial, mostrador, galería de una torre, barandilla |
| `roof_block` | 26 × 26 × 12 | thatch, turf, tile, shingle, dark, red, white | una hilada de tejado; `red`/`white` son lona |
| `ridge` | 26 × 8 × 6 | timber, plank | cumbrera |
| `trunk_thin` (`timber`) | 9 × 9 × 28 | — | poste y esquina de entramado (la pieza del kit 1 en otro color) |
| `door` | 5 × 20 × 32 | — | puerta con marco, sobre una cara |
| `window` | 5 × 16 × 16 | lit, dark | ventana con marco: encendida o tronera |
| `shield` | 5 × 15 × 15 | red, white | escudo redondo |
| `dragon` | 16 × 6 × 20 | timber, plank | cabeza tallada que remata la cumbrera (mira a `+x`) |
| `banner` | 3 × 12 × 18 | — | estandarte |
| `barrel` / `crate` / `loaf` | hasta 13 × 13 × 15 | — | atrezo de puerta y de mercado |
| `anvil` / `fire` / `cauldron` | hasta 14 × 14 × 12 | — | herrería, brasero, sanador |
| `boat` | 45 × 14 × 14 | — | bote varado |

Las piezas de cara (`door`, `window`, `shield`, `rune`, `banner`) tienen el pivote **en el
plano de la cara**: se colocan con `x` igual al plano del muro y la mitad queda prensada
dentro, igual que la fruta.

### Qué kit usar y cómo se combinan

| Quiero hacer… | Kit | Dónde | Piezas base |
| --- | --- | --- | --- |
| árbol, arbusto, bosquecillo | 1 | `vox_models.py` | `trunk` + capas de `leaf_*` + un acento |
| adorno del techo de hierba | 1 | `grass_clay.py` | `flower_big`, `wildflower`, `sprout`, `mushroom`, `pebble_*` |
| piedra rúnica, ruina, menhir | 2 | `vox_buildings.py` | `standing_stone*` + `rune` + `moss_patch` |
| obra de piedra (torre, santuario, zócalo) | 2 | `vox_buildings.py` | `stone_block` / `stone_half` con `walls` o `pyramid` |
| casa, salón, cobertizo, puesto | 3 (+2) | `vox_buildings.py` | `wall_block` + `roof_block` + piezas de cara + atrezo |
| gradas | 2 | `vox_stairs.py` | masa recta propia + `stone_small`, `pebble_*`, `moss_patch` |

Los kits **se mezclan**: comparten módulo (28), junta y paleta. Una casa lleva zócalo y
chimenea del kit 2, postes (`trunk_thin` en `timber`) y una mata (`leaf_tuft`) del kit 1; una
piedra rúnica lleva guijarros y rocas del kit 1. Lo que no se mezcla son los papeles: una
pieza de hoja no hace de tejado ni un `wall_block` de roca.

Cotas que cuadran las piezas entre sí (todo en vóxeles):

| Se apila | Sube por pieza | Ejemplo |
| --- | --- | --- |
| `wall_block`, `stone_block`, `leaf_block`, `trunk`, `trunk_thin` | 28 | dos hiladas de muro = 56; dos postes = 56 |
| `wall_half`, `stone_half`, `roof_block` | 12 | zócalo de 12 + dos hiladas = 68 |
| `stone_small` | 14 | chimenea de tres = 42 |
| una hilada de `gable` o de `pyramid` | 12 arriba, 14 adentro | tejado sobre 3 celdas: 4 hiladas = 48, más la cumbrera 6 |

Con eso se calcula la altura antes de armar: casa de 3 celdas con zócalo = 12 + 56 − 4 + 48 +
6 = 118 de 170. Lo que apoya en otra pieza empieza **exactamente** en su cota de arriba: un
techo plano sobre dos postes va en z = 56, no «más o menos encima» (el toldo del mercado flotó
por eso).

`python3 artifacts/vox/clay/vox_prefabs.py` regenera todos los `.vox` de las piezas. Sirven para armar
a mano en MagicaVoxel; `vox_models.py` no los lee, usa las mismas definiciones directamente.

### Crear una pieza nueva

Hazlo cuando una entidad necesite una forma que ninguna pieza da. Antes comprueba que no se
resuelve con una existente girada, apilada o en otro color.

1. Añade una entrada a `PIECES` en `vox_prefabs.py`: `"nombre": (constructor, variantes)`.
   El constructor recibe el color y devuelve una lista de `box(x, y, z0, ancho, fondo, alto,
   color, radio)` en vóxeles, con el pivote en el centro de la base. Las variantes son
   `{nombre: color}`, o `{"": color}` si solo hay una.
2. **Tamaño**: si la pieza va en la rejilla, mide el módulo menos 2 (26 en un módulo de 28,
   54 en dos). Si es un prop suelto, el tamaño que pida, entero.
3. **Radio**: 40–45 % del lado menor. Por debajo del 30 % se lee como un cubo; por encima del
   48 %, como un cojín.
4. Los detalles de otro color (el corte del tocón, las marcas del abedul) son cajas pequeñas
   **después** de la principal: la última caja gana donde se pisan.
5. Regenera el kit y mira la pieza antes de usarla (sección 6).

Mantén el kit corto: una pieza nueva tiene que servir a más de una entidad o ser lo que hace
reconocible a una.

## 5. Armar una entidad

En `vox_models.py`, una función por entidad que devuelve la lista de cajas, y una entrada en
`MODELS`: `"nombre": (función, (casillas_x, casillas_y, bloques), "dir/asset.png")`. La ruta
es el PNG que el render sustituye, bajo `lib/assets/`.

Ayudas disponibles (posiciones en vóxeles):

- `put(pieza, x, y, z, variant="", turn=False)` — una pieza con su base en z.
- `layer(celdas, x, y, z, variant="green", name="leaf_block", cell=28)` — una capa de hojas
  sobre un patrón (`RING`, `FULL`, `PLUS`, `QUAD`) alrededor de (x, y).
- `trunk(x, y, tramos, variant="brown", name="trunk")` — tramos apilados desde el suelo.
- `fruits([(x, y, z), …])` — los acentos.

Receta de un árbol, de abajo arriba:

```python
def fruit_tree():
    c = -6                                              # la copa, hacia atrás
    return (trunk(0, 0, 3)                              # 3 tramos: 84 de tronco
            + layer(RING, c, c, 84)                     # 3x3 sin el bloque del frente
            + layer(PLUS, c, c, 112)                    # una cruz
            + layer([(0, 0)], c, c, 140)                # un bloque arriba: llega a 166
            + fruits([(35, 1, 94), (-11, 35, 101)]))    # en las caras x = c+28+13, y = c+28+13
```

Las alturas se cuadran con el módulo: tronco visible + 28 por capa + la punta = 164 a 170.
Si un modelo se sale del volumen de su huella, el script se detiene y dice por cuánto.

`python3 artifacts/vox/clay/vox_models.py` escribe todos los modelos; con nombres detrás, solo esos.

### Armar un edificio (`vox_buildings.py`)

Los edificios, casas y piedras rúnicas viven en `artifacts/vox/clay/vox_buildings.py`, con su
propio `MODELS` y el mismo uso (`python3 artifacts/vox/clay/vox_buildings.py --render smithy`).
Un edificio se escribe **una vez con la cumbrera a lo largo de x**, alrededor de `(0, 0)`:

- `walls(nu, nv, z, hiladas, variante, name="wall_block", rise=28, skip=())` — el perímetro de
  un rectángulo de `nu × nv` celdas. `skip` deja celdas abiertas (un portón). El interior va
  hueco: lo tapa el tejado.
- `gable(nu, nv, z, variante, fill=None, ridge="timber")` — tejado a dos aguas: cada hilada
  entra 14 y sube 12, el alero vuela 14 por los cuatro lados y `fill` cierra los hastiales con
  `wall_half`. Empieza 4 por debajo del remate del muro.
- `pyramid(tamaños, z, variante, name="roof_block", rise=12)` — hiladas cuadradas; repetir un
  tamaño (`[4, 4, 3, 3, 2, 2, 1]`) da un cono más empinado. Con `stone_block` y `rise=28` es
  una pirámide de sillares.
- `face_x(pieza, plano_x, y, z, variante)` / `face_y(pieza, x, plano_y, z, variante)` — una
  pieza de cara; `side(n)` da el plano exterior de `n` celdas (`n · 14 − 1`).
- `along(cajas, eje)` — coloca un edificio de dos casillas sobre su huella en x o en y.
- `cells(n)` — los centros de `n` celdas alrededor de 0 (`cells(3)` = −28, 0, 28), para
  repartir escudos, ventanas o postes sobre la rejilla.
- `stack(pieza, x, y, z, cuántas, variante, sube)` — la misma pieza apilada: postes
  (`sube` 28), chimenea de `stone_small` (`sube` 14).

Reglas de los edificios:

- **Una casilla admite 3 celdas de muro** (84) más el alero (112 de 128). Una huella de dos
  casillas, hasta 7 de largo. Con 4 celdas el alero se sale y el script se detiene.
- **Puerta y acento en la cara `+x`** (la iluminada), ventana o escudos en la `+y`. Lo que se
  ponga en `−x` o `−y` no se ve nunca.
- Como mucho **un material de muro y uno de tejado** por edificio, más el zócalo de piedra.
- Un edificio ocupa el volumen de su huella como cualquier modelo: 1 bloque los puestos y las
  piedras, 2 las casas, 3 la torre y el templo.
- **Sin suelo propio**: muros, postes y atrezo arrancan en z = 0 sobre la hierba.

Recetas, una por tipo (las de `vox_buildings.py`, resumidas):

```python
def runestone_pair():            # kit 2: piedras sueltas sobre la hierba, sin suelo propio
    return (put("standing_stone_tall", -14, -12, 0, "grey")
            + face_x("rune", -2, -12, 53, "red")            # plano = centro −14 + mitad del ancho 12
            + put("standing_stone", 20, 14, 0, "sand") + face_x("rune", 31, 14, 31, "red")
            + put("moss_patch", -4, 6, 0) + put("rock_s", -26, 26, 0))

def cottage_tile():              # kit 3 + 2: casa de una casilla, dos bloques
    top = 12 + 56                                           # zócalo + dos hiladas
    out = walls(3, 3, 0, 1, "grey", name="stone_half") + walls(3, 3, 12, 2, "plaster")
    for x, y in ((41, 41), (41, -41), (-41, 41)):           # esquinas vistas: entramado
        out += stack("trunk_thin", x, y, 12, 2, "timber", M)
    out += gable(3, 3, top - 4, "tile", fill="plaster")     # el tejado muerde 4 del muro
    out += stack("stone_small", -28, -22, top + 20, 3, "grey", 14)      # chimenea, detrás
    return out + face_x("door", side(3), 0, 12) + face_y("window", -14, side(3), 34, "lit")

def smithy():                    # cobertizo abierto: postes en vez de muros
    out = [b for x in (-40, 40) for y in (-40, 40) for b in stack("trunk_thin", x, y, 0, 2, "timber", M)]
    out += gable(3, 3, 56, "shingle")                       # apoya en la cota de los postes
    return out + put("stone_block", 0, -28, 0, "dark") + put("fire", 0, -28, 26) + put("anvil", 16, 14, 0)

def watchtower():                # tres bloques: fuste de sillares, galería y caseta
    deck = 5 * M
    out = walls(2, 2, 0, 5, "grey", name="stone_block") + pyramid([4], deck, "plank", name="wall_half")
    return out + walls(2, 2, deck + 12, 1, "plank") + gable(2, 2, deck + 36, "turf", fill="plank")

def mead_hall(axis):             # dos casillas: se escribe a lo largo de x y `along` lo coloca
    out = walls(7, 3, 0, 1, "grey", name="stone_half") + walls(7, 3, 12, 2, "timber")
    out += gable(7, 3, 64, "shingle", fill="timber", ridge="plank") + face_x("door", side(7), 0, 12)
    for n, x in enumerate(cells(7)[1:-1]):                  # la fila de escudos, en la cara +y
        out += face_y("shield", x, side(3), 34, "red" if n % 2 == 0 else "white")
    return along(out, axis)      # MODELS: "mead_hall_2x1" con "x" y (2, 1, 2); "_1x2" con "y" y (1, 2, 2)
```

Lo que da carácter a cada edificio con las mismas piezas: el **material** (un muro y un
tejado), la **forma del tejado** (`gable` bajo, `pyramid` empinada, plano de lona), **una
pieza propia** (dragón, chimenea, caldero, bote, yunque) y el atrezo junto a la puerta.

**A mano en MagicaVoxel**: modelo nuevo del tamaño de la huella, se importan las piezas de
`artifacts/vox/prefabs/` (todas llevan la misma paleta) y se colocan sobre la rejilla de 28.
En MagicaVoxel el eje y va al revés que en `vox_models.py`: lo que aquí es `+y` allí es `−y`.
Guarda el resultado en `artifacts/vox/models/` y pasa al render. Un color marcado como
emisivo en MagicaVoxel brilla en el sprite.

## 6. Renderizar

```sh
python3 artifacts/vox/clay/vox_models.py --render tree_3 bush        # arma y renderiza sobre sus assets
blender -b -P artifacts/vox/clay/vox_render.py -- modelo.vox sprite.png   # un .vox cualquiera
```

Sin Blender instalado vale el módulo de pip (`pip install bpy`): entonces
`python3 artifacts/vox/clay/vox_render.py modelo.vox sprite.png`. Tarda unos 35 s por sprite en CPU.

Lo que hace `vox_render.py`, y por qué no se toca a la ligera:

- **Cámara**: ortográfica, girada 45° y elevada 30° (el 2:1 de las casillas), con el modelo
  **aplastado a √(2/3) de su alto**: un bloque del juego mide 341 sobre una casilla de 512,
  más bajo de lo que esa cámara enseña un cubo. Con eso el render cae en el lienzo de
  plantilla al píxel: 1024 × 1194 para 1x1x2, pie en (512, 938).
- **Luz**: un sol arriba a la derecha (`SUN_FROM`) más un cielo uniforme (`SKY`), ajustados
  para que el techo conserve el color de paleta, la cara derecha quede a 0,93 y la izquierda,
  en sombra, a 0,64. Son los tonos de todos los assets del juego: si se cambian, la entidad
  deja de casar con el resto. Las sombras entre piezas salen solas y son suaves.
- **Color**: transformación de vista «Standard». Con AgX o Filmic los colores de paleta se
  apagan.
- **Acabado clay** (`--style clay`, por defecto): los cubos se rehacen como una piel cerrada,
  se suavizan hasta fundir los escalones de vóxel, reciben una leve irregularidad de arcilla
  amasada y un material mate con algo de brillo y de luz que cala. `--style voxel` deja los
  cubos duros. Las constantes `CLAY_*` gradúan cada efecto; cámbialas para todo el juego a la
  vez, no para una entidad, y vuelve a renderizar todas.
- **Fondo transparente y sin suelo**, así que no hay sombra proyectada en el sprite.

Mira siempre el PNG antes de seguir. Lo que suele fallar: un bloque del frente que tapa el
tronco, fruta enterrada, una copa que no llega arriba, piezas que se pisan (se funden en un
bulto sin junta) o que flotan sin apoyo.

## 7. Meterlo al juego

1. El PNG va junto a su huella en `<nombre>.json` (obligatorio cuando la huella no es 1x1x1,
   por ejemplo `{"tiles": "1x1x2"}`), es la fuente de la entidad, y su entrada en
   `lib/content/json/entities.json` declara el sprite `/assets/<tipo>/<nombre>.png`.
2. `lib/scripts/build-atlas.sh`. Si `content/images/cloud-shadow.png` cambia sin haber tocado
   las nubes, descártalo: es el desenfoque de otra versión de cairo.
3. **Recompila el juego** (`cargo build --locked --bin iso-core`). El binario lleva dentro el
   manifiesto: con atlas nuevo y binario viejo los sprites salen recortados y mezclados.
4. Compruébalo corriendo con la skill `armada-visual-check`: una escena `blank` con la
   entidad a una casilla del jugador, de día. Mira que esté plantada en su casilla, que la
   sombra del juego salga de su pie y que el tamaño case con las vecinas.
5. `cargo test --workspace --locked`. Al añadir entidades o assets hay contadores a mano en
   `manifest.test.rs`, `entities_catalog_test.rs` y `wfc_catalog_test.rs`.
6. Si cambian las piezas, las reglas o el render, actualiza en el mismo cambio esta skill y
   la sección 9 de `lib/docs/ASSET-PIPELINE.md`.

El commit y el push solo los hace `armada-commit`, cuando el usuario la invoca.

## 8. Antes de entregar

- [ ] El modelo ocupa el volumen de su huella y `vox_models.py` lo escribe sin quejarse.
- [ ] Solo piezas del kit y colores de la paleta; las piezas nuevas siguen la sección 4.
- [ ] Hojas en la rejilla del módulo, juntas visibles, frente de la capa baja vacío.
- [ ] Árboles a dos bloques (z 164–170); un solo acento, puesto en una cara.
- [ ] Sin suelo propio (ni losa ni tarima) y sin sombra propia en el suelo; dos orientaciones generadas, no espejadas.
- [ ] Viste el sprite renderizado y la entidad dentro del juego, y adjuntas las dos imágenes.
- [ ] Atlas regenerado, juego recompilado y tests en verde.
- [ ] Entregas el `.vox` del modelo, el sprite y los cambios de `vox_prefabs.py` / `vox_models.py`.

## 9. El techo de hierba con adornos

`artifacts/vox/clay/grass_clay.py` genera las variantes del bloque de hierba (`block_flowers.png`,
`block_flowers_2.png`, `block_wildflowers_red.png`, `block_wildflowers_white.png`,
`block_sprouts.png`, `block_leaves.png`, `block_pebbles.png`, `block_mushrooms.png`,
`block_bushes.png`): el bloque de `assets/grass/block.png` **no se toca ni se redibuja**; lo
que se arma con piezas del kit es solo el adorno, de pie sobre un volumen 1x1x1 con la base en
z = 0, y el render se compone encima del bloque con un desplazamiento vertical de −341 px del
lienzo (−171 px a la escala de `block.png`, la del techo, exactamente donde la planta del
adorno pisa el bloque). En el
lienzo 1x1x1 el plano de suelo del adorno y la cara de arriba del bloque caen en el mismo
sitio, así que los dos encajan al píxel.

Los adornos se quedan bajos y dentro de la silueta del bloque, de modo que la caja de tinta de
cada variante es la del bloque llano: el atlas mide el adorno como el bloque y el terreno lo
dibuja donde dibuja el bloque. Regenerar: `python3 artifacts/vox/clay/grass_clay.py` (escribe los
`.vox` en `vox/models/block_*.vox` y los PNG sobre el bloque). Si cambian las piezas que un
adorno usa, el kit o el render, se rehacen todos y el atlas se reconstruye igual que siempre.

## 10. Las gradas (terreno por la ruta voxel)

`artifacts/vox/clay/vox_stairs.py` genera `lib/assets/stairs/block_{px,py,nx,ny}.png` (y
`vox/models/stairs_*.vox`). Una grada es **terreno**, y eso cambia tres reglas de las entidades:

- **Llena la casilla.** La masa son cajas de radio 0 de borde a borde (128 vóxeles), sin aire a
  los lados: con juntas, la columna enseñaría una ranura contra sus vecinas. Solo el adorno
  (bordillos `stone_small`, guijarros, `moss_patch`) son piezas del kit con su redondeo.
- **Cuatro bandas de 32 de fondo que suben a 21, 42, 64 y 85**: la última huella queda a ras
  del suelo de la casilla de arriba, y nada pasa de z = 85. Si cambian las bandas hay que mover
  `PLAYER_STAIRS_STEPS` en el motor.
- **La franja pisada** mide 66 de ancho y va hundida 5, lo mismo que la tira de tierra de un
  camino, para que el camino entre y salga sin salto.

El sprite son dos renders compuestos: el clay encima y, debajo, el de cubos duros
(`--style voxel`) de la masa sola. El clay redondea el borde de la casilla uno o dos vóxeles y
el render duro rellena esa rendija con la misma piedra. Sale a 512 × 427, como todo el terreno.
El tramo se escribe una vez subiendo hacia `−y` y se coloca para las otras tres direcciones
(`LAYOUT`); cada una se renderiza en su orientación, nunca se espeja el sprite.
