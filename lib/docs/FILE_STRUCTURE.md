# Estructura de archivos Rust

Este documento es la política de estructura para el workspace Rust de Armada
Engine. Complementa la [arquitectura](ARCHITECTURE.md): aquella explica los
límites y contratos del motor; esta define dónde vive cada archivo y cómo se
prueba.

## Dos crates, dos responsabilidades

El workspace `lib/` contiene dos crates intencionadamente distintos:

```text
lib/
  crates/iso/       # crate `iso`: dominio portable y sin Macroquad
  src/              # crate `iso-core`: cliente Macroquad, binario y adaptadores
```

- `crates/iso/src/` contiene reglas de juego, datos serializables, geometría,
  generación, simulación y contratos de puertos. No importa Macroquad,
  navegador, GPU, archivos ni audio concreto.
- `src/` implementa el cliente: composición, recursos, dibujo, entrada,
  persistencia concreta y adaptadores de las interfaces definidas por `iso`.
  Puede depender de `iso`, pero nunca al revés.
- `src/bin/` contiene herramientas de mantenimiento ejecutables por Cargo; no
  es una segunda capa de dominio.

La coexistencia de `src/` y `crates/iso/src/` no es duplicación. Se elimina una
pieza solo cuando dos archivos implementan la misma responsabilidad y se puede
conservar una única fuente de verdad sin cruzar ese límite de dependencia.

## Dominios y módulos

Organizar por responsabilidad, no por tipo técnico ni por pantalla. Un dominio
propietario contiene sus tipos, reglas y pruebas: por ejemplo, `terrain`,
`world`, `player`, `lighting` o `water` en `crates/iso/src/`; y una vista como
`terrain`, `lighting` o `player` en el cliente.

- Crear una carpeta cuando una responsabilidad tiene más de un archivo o una
  API propia. No crear carpetas o módulos vacíos para trabajo futuro.
- Un archivo de producción tiene un nombre específico de su responsabilidad
  (`chunk_manager.rs`, `reflection_view.rs`), no nombres genéricos como
  `utils.rs`, `common.rs`, `helpers.rs` o `implementation.rs`.
- Mantener los tipos compartidos en el dominio que posee su contrato. Extraer
  un módulo común solo con al menos dos consumidores reales y un propietario
  claro.
- Los adaptadores concretos permanecen en el cliente; los traits y tipos de
  intercambio que necesita el dominio permanecen en `iso`.
- No introducir dependencias inversas, ciclos ni imports de Macroquad en
  `crates/iso`.

## Regla de `mod.rs` y `lib.rs`

`mod.rs` es la frontera pública de una carpeta, no un cajón de lógica. Debe:

- declarar los submódulos que pertenecen al dominio;
- reexportar de forma explícita la API que la carpeta ofrece a sus vecinos;
- contener como máximo documentación del módulo y pegamento mínimo.

Una carpeta de un solo archivo puede exponerlo desde su `mod.rs`, pero si la
lógica crece se extrae a un archivo con nombre de responsabilidad y se conserva
el barrel. `crates/iso/src/lib.rs` es el barrel del crate `iso`; `src/main.rs`
es la entrada del binario y solo compone los módulos del cliente. Ninguno debe
acumular reglas de dominio o renderizado.

Los consumidores externos importan la API del barrel (`iso::terrain`,
`crate::lighting`); los archivos internos pueden usar rutas hermanas cuando
eviten un ciclo y no expongan detalles como API pública.

## Pruebas colocalizadas

Todo archivo Rust de producción que implemente comportamiento debe tener una
prueba colocalizada llamada `<nombre>.test.rs`, cargada desde el archivo fuente:

```rust
#[cfg(test)]
#[path = "chunk_manager.test.rs"]
mod tests;
```

La prueba cubre el contrato, casos límite y regresiones del archivo, no su
estructura interna. Las pruebas que crucen módulos, crates o formatos externos
van en `crates/iso/tests/`; no sustituyen la prueba unitaria del archivo dueño.

Excepciones permitidas —deben ser pequeñas y justificarse con un comentario en
el archivo o en la descripción del PR—:

- barrels (`mod.rs`, `lib.rs`) que solo declaran/reexportan módulos;
- puntos de entrada (`main.rs`) y herramientas de `src/bin/`, cuando su
  comportamiento esté delegado a módulos con pruebas;
- archivos que solo declaran datos, traits o tipos sin comportamiento propio;
- código dependiente de GPU, ventana o E/S que no pueda aislarse aún: primero
  extraer y probar la lógica pura; dejar documentada la comprobación manual
  temporal.

No se aceptan archivos `.rs` sueltos sin una prueba vecina por comodidad. Si la
excepción deja de aplicar, añadir el test antes de ampliar el archivo.

## Revisión antes de añadir o mover archivos

1. Elegir el crate según la dirección de dependencia: dominio portable en
   `crates/iso`, implementación Macroquad o composición en `src`.
2. Buscar si el dueño ya existe y extenderlo antes de crear un paralelo.
3. Crear o actualizar el `mod.rs` del dominio y su API pública mínima.
4. Añadir el test colocalizado en el mismo cambio, o documentar la excepción.
5. Actualizar `ARCHITECTURE.md` si el cambio altera límites, flujo o un dominio
   del workspace.

Así, los nombres de archivos, los barrels y las pruebas siguen describiendo la
misma frontera arquitectónica en vez de convertirse en capas redundantes.
