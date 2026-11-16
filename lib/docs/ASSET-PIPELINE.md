# Pipeline de assets

Cómo se genera un asset de Armada, desde el generador Python hasta el píxel en pantalla. Todo
lo que se cita aquí está en el repositorio: los generadores de formas en `artifacts/`, los
scripts de pintado en `artifacts/paint/` y la construcción del atlas en `lib/scripts/`.

## Vista general

```
artifacts/*.py                 forma base: SVG isométrico 2:1 sobre el lienzo de plantilla
        │
        ▼
artifacts/paint/*_paint.py     fal.ai: forma + referencia de estilo → variantes pintadas
        │                      (nano-banana/edit) y recorte del fondo (birefnet/v2)
        ▼
artifacts/paint/*_compose.py,  post-proceso determinista: encajar en el lienzo, igualar
tree_leaves.py                 colores, hacer que el terreno empalme
        │
        ▼
lib/assets-src/assets/<tipo>/<nombre>.png  (+ .json de huella si no hay SVG al lado)
        │
        ▼
lib/scripts/build-atlas.sh     rasterize.py → pack_atlas → atlas.png + assets.manifest.json
        │
        ▼
cargo build (WASM)             el manifiesto va dentro del binario (include_str!)
```

El paso de fal.ai es opcional: un SVG solo ya es un asset válido. El pintado añade un PNG al
lado que lo sustituye, y borrar ese PNG devuelve el asset a su dibujo.

## 1. El lienzo de plantilla

Todo asset se dibuja sobre el mismo lienzo, que depende sólo de su huella `along x across x high`
(casillas a lo largo, a lo ancho y bloques de alto):

- ancho = `512 * (along + across)`
- alto = `256 * (along + across) + 341 * high`

Un bloque de terreno 1x1x1 mide 1024 × 853: el techo es el rombo `(512,0) (1024,256) (512,512)
(0,256)` y las caras bajan 341. El motor mide la caja de tinta dentro de ese lienzo
(`pack_atlas`), así que **un asset que no respete el lienzo sale desplazado o con otro tamaño**.
El atlas guarda 320 px por casilla; la resolución del fichero fuente da igual mientras conserve
la proporción del lienzo.

La huella se declara, por orden de preferencia:

1. `<nombre>.json` junto al fichero: `{"tiles": "2x1x2"}`. Obligatorio cuando sólo hay PNG.
2. `data-tiles="2x1x2"` en la etiqueta `<svg>` del dibujo.
3. Sin ninguno de los dos, 1x1x1.

## 2. La forma base (`artifacts/*.py`)

Un generador Python por familia, todos sobre `artifacts/iso_lib.py` (vóxeles redondeados,
proyección 2:1, orden de profundidad). Los que están en uso:

| Generador | Qué produce |
| --- | --- |
| `terrain_blocks.py` | bloques de hierba, tierra y arena (llenan la casilla entera) |
| `grass_clutter.py`, `grass_decor.py` | variantes del techo de hierba (flores, piedras, brotes) |
| `path_tiles.py` | los 16 tiles de camino, uno por máscara de conexión |
| `stairs.py` | las cuatro gradas (`px`, `py`, `nx`, `ny`) |
| `tree_*.py` | árboles |
| `viking_village.py` | los 14 edificios del poblado (clase `Build`) |
| `player*.py`, `monkey.py` | hojas de animación del jugador |

Reglas de la forma base:

- **Cada orientación es su propio fichero**, nunca un espejo: el sol viene siempre del mismo
  lado. Un edificio de dos casillas se genera dos veces, con `(2,1,h)` y `(1,2,h)`.
- La forma sólo necesita silueta, proporciones y colores planos correctos. El detalle lo pone
  el pintado.
- `viking_village.py <dir>` tarda minutos en los salones: el orden de profundidad es cuadrático.

## 3. El pintado con fal.ai (`artifacts/paint/`)

Dos modelos, llamados por `falrun.py` (cliente de la cola de fal.ai, sin dependencias):

- `fal-ai/nano-banana/edit` (≈ 0,039 $ por imagen): recibe **dos** imágenes, la forma base y
  una referencia de estilo, y devuelve la forma pintada.
- `fal-ai/birefnet/v2` (≈ 0,003 $): separa el objeto del fondo blanco.

La clave se pasa en línea y no se guarda en ningún fichero:

```sh
FAL_KEY='…' python3 artifacts/paint/village_paint.py <dir-svg> <dir-trabajo> <nombre>...
```

Pasos de cada asset (`repaint.py::repaint`, `village_paint.py::paint`):

1. Rasterizar el SVG al ancho del lienzo (`_base.png`).
2. `letterbox`: centrarlo en un cuadrado blanco de 1024 (`_in.png`).
3. nano-banana con `image_urls = [forma, referencia]`, `aspect_ratio: "1:1"` y 2 o 3 variantes.
4. birefnet sobre cada variante y `decontaminate`, que quita el blanco mezclado en el borde.
5. `fit`: escalar y posar el recorte para que su caja de tinta coincida con la de la forma base
   en el lienzo de plantilla (`_placedN.png`).
6. Elegir variante **a ojo** con `contact.py`, que monta una hoja de contacto. El IoU contra la
   silueta (`silhouette_score`) sólo sirve para ordenar y detectar desastres.

Lo que el prompt necesita siempre (están en `PROMPT` de cada script):

- Decir cuál imagen es la forma y cuál el estilo ("the FIRST image… the SECOND image…").
- Prohibir espejar, girar o cambiar el punto de vista; sin eso devuelve la figura invertida
  una de cada tres veces.
- Fondo blanco liso, sin suelo ni sombra proyectada.
- Una frase por material. La misma frase para todo falla: a la piedra le pone musgo, al
  arbusto le añade hojarasca.

Los scripts y para qué es cada uno:

| Script | Uso |
| --- | --- |
| `repaint.py` | repinta un asset que ya tiene SVG, con `ref_style.png`; deja el PNG al lado |
| `village_paint.py` | edificios nuevos desde las formas de `viking_village.py`, con `ref_village.png` |
| `tree_paint.py` | árboles con hojas lisas, sin motas |
| `terrain_paint.py` | textura cruda para hierba, tierra, arena, lecho de camino y gradas |
| `contact.py` | hoja de contacto para elegir variantes |

## 4. Post-proceso determinista

El modelo no garantiza ni colores exactos ni bordes que empalmen. Lo que tiene que ser exacto
se rehace sin IA, y se puede repetir gratis sobre los resultados crudos ya guardados.

**Terreno, caminos y gradas (`terrain_compose.py <assets> <trabajo> <salida>`).** Un bloque de
terreno se repite miles de veces, así que:

- Conserva el alfa del dibujo: el bloque sigue llenando la casilla exacta.
- En cada cara iguala el color medio de la textura al del dibujo y la **desvanece hasta el
  color plano en el borde de la cara** (`top_reach` 34 px, `side_reach` 16 px). Dos vecinos se
  encuentran siempre en el mismo color.
- La fuerza del detalle es baja a propósito (`STRENGTH`: hierba 0,5, tierra 0,45, arena 0,6).
  Más alta se lee como una rejilla repetida.
- Variantes de hierba: la hierba nueva más el adorno del dibujo (donde el SVG de la variante
  difiere del de la hierba).
- Tiles de camino: la hierba nueva y, donde el SVG del camino difiere del de la hierba, un
  lecho de tierra con dos texturas alternadas por máscara y una sombra bajo el labio.
- Gradas: los colores del dibujo más el detalle fino de la IA (paso alto).

Las bases que pide `terrain_paint.py` son los propios `block.svg` de `grass`, `ground`, `sand`
y `stairs` copiados a un directorio como `grass.svg`, `stairs_px.svg`…, más
`artifacts/paint/bases/earth.svg` para el lecho del camino.

**Hojas de los árboles (`tree_leaves.py <trabajo> <assets>`).** Todas las hojas toman el tono y
el sombreado del arbusto (`bush/block.png`), que es la referencia:

- Del arbusto se miden sus tonos (cara en sombra, techo iluminado, brillo del bisel) y, para
  cada nivel de brillo, su tono y saturación.
- En cada árbol se buscan los mismos tonos y el brillo se lleva en línea recta a los del
  arbusto; el color sale de la tabla del arbusto. Antes se pasa un filtro de mediana para
  quitar el grano del repintado.
- Sólo toca píxeles verdes: tronco, corteza y frutos quedan igual. El alfa no cambia, así que
  el manifiesto tampoco.

Si cambia el arbusto, basta volver a correr este script para que los árboles lo sigan.

## 5. Entrada al motor

1. Fichero en `lib/assets-src/assets/<tipo>/<nombre>.png` (y `.json` si hace falta la huella).
   **Un PNG junto a un SVG lo sustituye**: `rasterize.py` procesa primero los SVG y luego los
   PNG sobre el mismo nombre.
2. Entidad nueva: entrada en `lib/content/json/entities.json` y peso en
   `lib/content/json/wfc.json`. Convención de eje: huella `NxM` con `N > 1` lleva `axis: "y"`,
   `1xM` lleva `axis: "x"`, y las dos orientaciones se llaman `<id>_x` y `<id>_y`.
3. `lib/scripts/build-atlas.sh`: genera `content/images/atlas.png`, las hojas del jugador y
   `content/json/assets.manifest.json`.
4. Recompilar. El motor busca el sprite por la ruta **sin extensión** (`iso::assets::artwork_key`),
   así que `entities.json` puede seguir nombrando el `.svg` de un asset repintado.

Tres contadores se mueven a mano cuando cambia el número de assets o entidades:
`crates/iso/src/assets/manifest.test.rs` (entradas del manifiesto),
`crates/iso/tests/entities_catalog_test.rs` (blueprints) y
`crates/iso/tests/wfc_catalog_test.rs` (pesos y `maxPerChunk`).

## 6. Verificación

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace` y `cargo build --release --target wasm32-unknown-unknown`.
- Comparar el `ink` del manifiesto antes y después: sólo deben moverse los assets tocados, y
  menos de 0,05 de casilla. En terreno no debe moverse nada.
- **Verlo corriendo.** Un atlas y un manifiesto correctos no bastan: un sprite puede no
  dibujarse o no proyectar sombra sin ningún error. Hay que caminar hasta un poblado y un
  bosque y mirar.

## 7. Las hojas del jugador

El jugador no pasa por fal.ai: pintar cada cuadro por separado cuesta decenas de dólares y,
pintando varios por imagen, el modelo cambia las poses. Sus hojas salen de un modelo 3D.

- `artifacts/player_model/model.npz` es la malla del mono en reposo (de pie, brazos a los
  lados), con un color y seis pesos por vértice: cuerpo, cabeza, dos brazos y dos piernas.
  Lo crea `artifacts/player_model/build.py <modelo.glb> <salida.npz>`, que separa los huesos
  con planos (los brazos, por lo lejos que están del centro; cabeza y piernas, por altura).
  Los planos y las articulaciones tienen nombre al principio de `build.py` (`ARM_FROM`,
  `NECK`, `CROTCH`...) y las articulaciones se guardan en el `.npz`: al cambiar de modelo
  sólo se ajustan ahí, a sus medidas, y `player_model.py` no se toca.
- `artifacts/player_model.py [hoja ...]` toma las poses de los generadores de siempre
  (`player_walk.py`, `player_idle.py`, `player_jump.py`, `player_climb.py`, `player_flip.py`,
  `player_swim.py`): cada hueso sigue a la caja de `monkey.py` que lo representa, girando
  sobre la articulación del propio modelo, y la piel se mezcla en las uniones. Dibuja con la
  cámara del juego y el sol arriba a la derecha, y escribe
  `lib/assets-src/painted/player-16_<hoja>.png`, una rejilla de celdas sin separación.
- `lib/scripts/rasterize.py` corta las celdas de ese PNG cuando existe; si no, dibuja las del
  SVG. El SVG sigue mandando en la rejilla (`data-cell`, cuadros y direcciones), así que el
  manifiesto no cambia.

Detalles que costó encontrar:

- La malla es una sola piel fundida: la mano está unida a la cadera. Un triángulo que se
  estira más de 1,7 veces su tamaño es uno de esos puentes y se descarta; por el hueco se ve
  el interior de la piel, pintado como pelo en sombra.
- La cabeza del modelo es más ancha que la de `monkey.py`, así que en el baile de reposo el
  brazo se levanta menos (`ARM_LIMIT`, `ARM_SHARE`) para no meterse en la oreja ni salirse
  de la celda.
- El modelo no tiene cola, y `jetpack.svg` sigue siendo el dibujo de siempre.
- `artifacts/player_render.py` es una alternativa sin modelo (dibuja las cajas de
  `monkey.py` como arcilla suave); `player_model.py` toma de él la lectura de poses y rejilla.

Regenerar las seis hojas (848 celdas) tarda unos ocho minutos y no cuesta nada.

## 8. Costes de referencia

| Lote | Imágenes | Coste |
| --- | --- | --- |
| 14 edificios del poblado, 3 variantes | 42 | 1,76 $ |
| 8 árboles, 3 variantes | 24 | ≈ 1,1 $ |
| terreno, lecho de camino y gradas | 17 | ≈ 0,66 $ |

El post-proceso no cuesta nada: ajustar fuerza, tono o empalme se hace sobre los resultados
crudos sin volver a llamar al modelo.

## 9. Ruta voxel (experimental): prefabs, `.vox` y Blender

Una alternativa al pintado, en prueba desde el 2026-11-16 con el ciprés (`tree_7`): el asset
se arma con piezas voxel y se renderiza. No llama a ningún modelo y no cuesta nada.

1. **Piezas.** `artifacts/vox_prefabs.py` escribe `artifacts/vox/prefabs/*.vox`: bloque de
   hoja, tronco, rama, fruta, flor… Un vóxel son 4 unidades de la skill (una casilla, 128
   vóxeles; un bloque de alto, 85), las piezas encajan en un módulo de 28 vóxeles y dejan
   1 vóxel de aire por lado, y todos los archivos llevan la misma paleta.
2. **Modelo.** Se arma con las piezas, en MagicaVoxel a mano o en `artifacts/vox_models.py`,
   que tiene los ocho árboles, el arbusto y los dos bosquecillos
   (`artifacts/vox/models/<nombre>.vox`). El modelo ocupa **el volumen entero de su
   huella** (128 × 128 × 170 para un árbol 1x1x2), con el pie en el centro del suelo de la
   casilla ancla: así el archivo dice dónde está plantado.
3. **Sprite.** `artifacts/vox_render.py` lo renderiza con Blender (Cycles) sobre el lienzo de
   plantilla, listo para dejar junto al dibujo:

   ```sh
   blender -b -P artifacts/vox_render.py -- artifacts/vox/models/tree_7.vox \
       lib/assets-src/assets/tree/block_7.png
   ```

   Sin Blender instalado vale el módulo de pip: `pip install bpy` y
   `python3 artifacts/vox_render.py modelo.vox sprite.png`. Cámara ortográfica a 45° y 30°
   (el 2:1 de las casillas) con el modelo aplastado a √(2/3) de su alto, porque un bloque del
   juego mide 341 sobre 512; un sol arriba a la derecha y un cielo uniforme ajustados a los
   tonos de los árboles pintados (techo 1, cara derecha 0,93, cara izquierda 0,64); sin
   sombra en el suelo, que la dibuja el juego.
   El acabado por defecto es `--style clay`: los cubos se rehacen como una sola piel
   cerrada (modificador Remesh), se suavizan hasta fundir los escalones de vóxel, reciben
   una ligera irregularidad de arcilla amasada y un material mate con algo de brillo y de
   luz que cala. `--style voxel` deja los cubos duros. Las constantes `CLAY_*` del script
   gradúan cada cosa.
   `python3 artifacts/vox_models.py --render [nombres]` arma y renderiza de una vez cada
   modelo sobre el asset que sustituye.
4. **Motor.** Como cualquier PNG: `scripts/build-atlas.sh` (sección 5), y recompilar: el
   binario lleva el manifiesto dentro, y con un atlas nuevo y un binario viejo los sprites
   salen recortados.

Las reglas completas (medidas, estilo, paleta, kit, cómo crear piezas) están en la skill
`armada-voxel-assets`. `artifacts/vox_lib.py` es el núcleo común, y `artifacts/iso_vox.py`
convierte además cualquier generador de la sección 2 en un `.vox` entero, sin pasar por las
piezas.
