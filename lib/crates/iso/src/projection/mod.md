# Projection

Este dominio convierte coordenadas de rejilla y elevación entre el espacio del mundo isométrico y el de pantalla. Centraliza las fórmulas de proyección para evitar que cada cliente reproduzca convenciones distintas.

Las funciones deben declarar claramente la dirección de la conversión y conservar precisión suficiente para selección, ordenación y cámara. Los parámetros geométricos compartidos pertenecen aquí cuando describen el modelo isométrico, no una resolución particular.

No consulta el estado del mundo ni conoce el tamaño de una ventana. El encuadre y la interacción de pantalla pertenecen a cámara y al cliente.


## Catálogo de API pública

Este catálogo documenta las funciones, métodos y constantes exportados por este dominio. Incluye la firma y un enlace a la implementación; los helpers privados se mantienen junto a su código porque no forman parte del contrato estable.

### `geometry.rs`

#### Funciones y métodos

- [`project_block`](geometry.rs#L31) — Proyecta block desde coordenadas del mundo al espacio isométrico de pantalla.
  - Firma: `pub fn project_block(point: GridPoint, elevation: f64, config: ProjectionConfig) -> ProjectedBlock {`

- [`project_grid_point`](geometry.rs#L41) — Proyecta grid point desde coordenadas del mundo al espacio isométrico de pantalla.
  - Firma: `pub fn project_grid_point(point: GridPoint, config: ProjectionConfig) -> ScreenPoint {`

- [`unproject_screen_delta`](geometry.rs#L48) — Invierte la proyección para convertir screen delta al espacio de rejilla.
  - Firma: `pub fn unproject_screen_delta(delta: ScreenPoint, config: ProjectionConfig) -> GridPoint {`
