# Water

Este dominio de cliente construye las vistas de reflejos de agua a partir de la geometría calculada por `iso::water`. Gestiona las capas, recursos y transformaciones visuales necesarios para presentar las superficies acuáticas.

Debe consumir la geometría de dominio sin recalcular sus reglas de recorte. Los detalles del backend, como render targets o materiales, se encapsulan para que no afecten al núcleo.

No determina dónde existe agua ni qué puede reflejarse. Esas decisiones se obtienen del mundo y del dominio `iso::water`.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `reflection_view.rs`

#### Funciones y métodos

- [`collect_reflection`](reflection_view.rs#L50) — Genera o calcula «reflection» a partir de los datos de entrada.
  - Firma: `pub fn collect_reflection( texture: usize, frame: SpriteFrame, layout: SpriteLayout, feet: ScreenPoint, elevation: f64, reflected: Reflected, projection: ProjectionConfig, water_at: impl Fn(i32, i32) -> Option<WaterCell>, out: &mut Vec<SpriteDraw>, ) {`

#### Constantes

- [`REFLECTION_ALPHA`](reflection_view.rs#L14) — How opaque what the water mirrors is drawn.
  - Declaración: `pub const REFLECTION_ALPHA: f32 = 0.62;`

- [`REFLECTION_TINT`](reflection_view.rs#L17) — What the water multiplies the artwork by: a little darker and bluer than the real thing,
  - Declaración: `pub const REFLECTION_TINT: Color = Color::new( 0xc4 as f32 / 255.0, 0xdb as f32 / 255.0, 0xe4 as f32 / 255.0, REFLECTION_ALPHA, );`

- [`REFLECTION_LAYER`](reflection_view.rs#L25) — Reflections draw in the layer of the shadows baked on the ground: over the water's own block,
  - Declaración: `pub const REFLECTION_LAYER: i32 = crate::lighting::shadow_view::GROUND_SHADOW_LAYER;`

- [`MAX_REFLECTION_DROP`](reflection_view.rs#L28) — How far below something the water still shows it, in blocks.
  - Declaración: `pub const MAX_REFLECTION_DROP: f64 = 4.0;`
