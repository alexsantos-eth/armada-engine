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

## 7. Costes de referencia

| Lote | Imágenes | Coste |
| --- | --- | --- |
| 14 edificios del poblado, 3 variantes | 42 | 1,76 $ |
| 8 árboles, 3 variantes | 24 | ≈ 1,1 $ |
| terreno, lecho de camino y gradas | 17 | ≈ 0,66 $ |

El post-proceso no cuesta nada: ajustar fuerza, tono o empalme se hace sobre los resultados
crudos sin volver a llamar al modelo.
