# Rendering

Este dominio de cliente contiene materiales y primitivas específicas de Macroquad usados para dibujar la escena. Centraliza los componentes visuales reutilizables que no representan por sí mismos una regla de mundo.

Los recursos deben tener una propiedad clara y una vida útil controlada por el cliente. Las APIs públicas de este dominio deben expresar conceptos de renderizado y no filtrar decisiones de terreno, entidades o simulación.

No contiene estado persistente del juego ni algoritmos de dominio. Los consumidores le entregan datos ya calculados.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `scene_material.rs`

#### Funciones y métodos

- [`load`](scene_material.rs#L65) — Carga el material y lo apunta a `shadow_map`.
  - Firma: `pub fn load(shadow_map: &Texture2D) -> Result<Self, String> {`

- [`bind`](scene_material.rs#L97) — Dibuja todo lo que sigue con este material.
  - Firma: `pub fn bind(&self) {`

- [`release`](scene_material.rs#L102) — Devuelve el dibujado al pipeline propio de Macroquad, para el HUD.
  - Firma: `pub fn release(&self) {`

- [`vertex`](scene_material.rs#L108) — Un vértice de la escena: un punto, de dónde leer la textura vinculada, un color, y los dos
  - Firma: `pub fn vertex( position: (f32, f32), uv: (f32, f32), colour: Color, map_uv: (f32, f32), kind: f32, ) -> Vertex {`

#### Constantes

- [`SPRITE`](scene_material.rs#L7) — `normal.z` de un vértice dibujado desde la textura vinculada, que es todo sprite.
  - Declaración: `pub const SPRITE: f32 = 0.0;`

- [`SHADOW`](scene_material.rs#L10) — `normal.z` de un vértice cuyo color es la cobertura leída del atlas de sombras.
  - Declaración: `pub const SHADOW: f32 = 1.0;`


## Detalles de implementación

Esta sección cubre las funciones y constantes internas de producción. Describe cómo se descompone el dominio, pero no constituye un contrato de compatibilidad para consumidores externos.

### `scene_material.rs`

#### Constantes internas

- [`SHADOW_MAP`](scene_material.rs#L13) — El nombre que el shader da al atlas de sombras. `Texture` y `_ScreenTexture` son de Macroquad
  - Declaración: `const SHADOW_MAP: &str = "ShadowMap";`

- [`VERTEX`](scene_material.rs#L15) — Define el parámetro interno «VERTEX» empleado por este módulo.
  - Declaración: `const VERTEX: &str = r#"#version 100 attribute vec3 position;`

- [`FRAGMENT`](scene_material.rs#L35) — Define el parámetro interno «FRAGMENT» empleado por este módulo.
  - Declaración: `const FRAGMENT: &str = r#"#version 100 #ifdef GL_FRAGMENT_PRECISION_HIGH precision highp float;`
