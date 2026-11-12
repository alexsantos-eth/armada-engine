# Water

Este dominio de cliente construye las vistas de reflejos de agua a partir de la geometría calculada por `iso::water`. Gestiona las capas, recursos y transformaciones visuales necesarios para presentar las superficies acuáticas.

El agua nunca es un espejo: cada pieza se encola como un barrido de copias (`iso::water::blur_taps`) con la clave de dibujo de su casilla, la propia a opacidad plena y las de debajo cada vez más tenues sobre ella; el radio lo da la profundidad a la que cuelga esa pieza (`piece_depth`, `blur_radius`), así que una pieza pegada a la línea de agua gasta una o dos copias y el extremo hundido hasta `BLUR_TAPS`. El orden de encolado importa: `draw_sorted` ordena de forma estable, así que las copias se componen en el orden en que se añaden.

Debe consumir la geometría de dominio sin recalcular sus reglas de recorte. Los detalles del backend, como render targets o materiales, se encapsulan para que no afecten al núcleo.

No determina dónde existe agua ni qué puede reflejarse. Esas decisiones se obtienen del mundo y del dominio `iso::water`.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `reflection_view.rs`

#### Tipos

- [`WaterCell`](reflection_view.rs#L36) — El agua de una casilla, vista por lo que se refleja en ella.
  - Firma: `pub struct WaterCell { pub level: f64, pub elevation: f64, }`
- [`Reflected`](reflection_view.rs#L45) — Qué está mostrando el agua. `Standing` voltea un sprite de pie; `AsDrawn` lo coloca tal como está dibujado (el sprite de reflejo del terreno, pensado para colgar de la línea de agua).
  - Firma: `pub enum Reflected { Standing { turn_at: Option<f64> }, AsDrawn, }`

- [`ReflectionSprite`](reflection_view.rs#L56) — El sprite que se está reflejando y el terreno sobre el que está: el slot del atlas del que sale el dibujo, el sitio del artwork en pantalla y dónde están sus pies, en bloques sobre el suelo — `lift` incluido para un salto, cuyo arco también muestra el agua.
  - Firma: `pub struct ReflectionSprite { pub texture: usize, pub frame: SpriteFrame, pub layout: SpriteLayout, pub feet: ScreenPoint, pub elevation: f64, pub lift: f64, }`

#### Funciones y métodos

- [`collect_reflection`](reflection_view.rs#L85) — Encola lo que el agua muestra de `sprite`, cortado a las casillas de agua que cubre.
  - Firma: `pub fn collect_reflection( sprite: ReflectionSprite, reflected: Reflected, projection: ProjectionConfig, water_at: impl Fn(i32, i32) -> Option<WaterCell>, out: &mut Vec<SpriteDraw>, ) {`

#### Constantes

- [`REFLECTION_ALPHA`](reflection_view.rs#L17) — Opacidad con la que se dibuja lo que el agua refleja.
  - Declaración: `pub const REFLECTION_ALPHA: f32 = 1.0;`

- [`REFLECTION_TINT`](reflection_view.rs#L20) — Lo por lo que el agua multiplica el dibujo: un poco más oscuro y más azul que la cosa real,
  - Declaración: `pub const REFLECTION_TINT: Color = Color::new( 0xc4 as f32 / 255.0, 0xdb as f32 / 255.0, 0xe4 as f32 / 255.0, REFLECTION_ALPHA, );`

- [`REFLECTION_LAYER`](reflection_view.rs#L28) — Los reflejos se dibujan en la capa de las sombras horneadas sobre el suelo: sobre el propio bloque del agua,
  - Declaración: `pub const REFLECTION_LAYER: i32 = crate::lighting::shadow_view::GROUND_SHADOW_LAYER;`

- [`MAX_REFLECTION_DROP`](reflection_view.rs#L32) — Hasta cuántas casillas en cada sentido se abre la ventana que busca el agua que cubre el reflejo, en bloques.
  - Declaración: `pub const MAX_REFLECTION_DROP: f64 = 4.0;`

## Detalles de implementación

### `reflection_view.rs`

#### Funciones internas

- [`smeared_tint`](reflection_view.rs#L73) — El tinte del agua para una copia del barrido: su opacidad sobre lo ya dibujado.
  - Firma: `fn smeared_tint(alpha: f64) -> Color {`
