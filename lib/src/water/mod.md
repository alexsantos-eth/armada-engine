# Water

Este dominio de cliente construye las vistas de reflejos de agua a partir de la geometría calculada por `iso::water`. Gestiona las capas, recursos y transformaciones visuales necesarios para presentar las superficies acuáticas.

Debe consumir la geometría de dominio sin recalcular sus reglas de recorte. Los detalles del backend, como render targets o materiales, se encapsulan para que no afecten al núcleo.

No determina dónde existe agua ni qué puede reflejarse. Esas decisiones se obtienen del mundo y del dominio `iso::water`.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `reflection_view.rs`

#### Tipos

- [`WaterCell`](reflection_view.rs#L35) — El agua de una casilla, vista por lo que se refleja en ella.
  - Firma: `pub struct WaterCell { pub level: f64, pub elevation: f64, }`
- [`Reflected`](reflection_view.rs#L44) — Qué está mostrando el agua. `Standing` voltea un sprite de pie; `AsDrawn` lo coloca tal como está dibujado (el sprite de reflejo del terreno, pensado para colgar de la línea de agua).
  - Firma: `pub enum Reflected { Standing { turn_at: Option<f64> }, AsDrawn, }`

#### Funciones y métodos

- [`collect_reflection`](reflection_view.rs#L59) — Genera o calcula «reflection» a partir de los datos de entrada.
  - Firma: `pub fn collect_reflection( texture: usize, frame: SpriteFrame, layout: SpriteLayout, feet: ScreenPoint, elevation: f64, lift: f64, reflected: Reflected, projection: ProjectionConfig, water_at: impl Fn(i32, i32) -> Option<WaterCell>, out: &mut Vec<SpriteDraw>, ) {`

#### Constantes

- [`REFLECTION_ALPHA`](reflection_view.rs#L16) — Opacidad con la que se dibuja lo que el agua refleja.
  - Declaración: `pub const REFLECTION_ALPHA: f32 = 0.62;`

- [`REFLECTION_TINT`](reflection_view.rs#L19) — Lo por lo que el agua multiplica el dibujo: un poco más oscuro y más azul que la cosa real,
  - Declaración: `pub const REFLECTION_TINT: Color = Color::new( 0xc4 as f32 / 255.0, 0xdb as f32 / 255.0, 0xe4 as f32 / 255.0, REFLECTION_ALPHA, );`

- [`REFLECTION_LAYER`](reflection_view.rs#L27) — Los reflejos se dibujan en la capa de las sombras horneadas sobre el suelo: sobre el propio bloque del agua,
  - Declaración: `pub const REFLECTION_LAYER: i32 = crate::lighting::shadow_view::GROUND_SHADOW_LAYER;`

- [`MAX_REFLECTION_DROP`](reflection_view.rs#L31) — Hasta cuántas casillas en cada sentido se abre la ventana que busca el agua que cubre el reflejo, en bloques.
  - Declaración: `pub const MAX_REFLECTION_DROP: f64 = 4.0;`
