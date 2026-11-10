# Prácticas de código y documentación

Las prácticas de código y documentación del proyecto, las puertas de calidad y las reglas
del workspace para cualquier agente (o persona) que trabaje en él.

## Prácticas de código y documentación

- Mantener la API pública de cada módulo pequeña; exportar tipos y operaciones necesarias desde `lib.rs`. Usar tipos nuevos para unidades o coordenadas que no sean intercambiables. Validar entradas externas con `Result` y errores con contexto; reservar `assert!` para invariantes internas y tests.
- Preferir funciones puras para proyección, clasificación de materiales, costes, cálculos de cámara y traducción de entrada. Inyectar azar, reloj y almacenamiento cuando una regla de dominio los necesite. Evitar estado global mutable y dependencia implícita del orden de `HashMap`.
- Usar `i32` o enteros tipados para rejilla y ticks; `f64` para cálculos de dominio que requieren precisión; `f32` en el límite gráfico. Documentar conversiones, rangos y redondeos. `unsafe` está prohibido en `iso`.
- Cada módulo comienza con rustdoc en inglés que explica propósito, invariantes, unidades y dependencias admitidas. Los tipos públicos documentan sus campos y errores relevantes; los ejemplos ilustran contratos, no duplican la implementación.
- La documentación Markdown se escribe en español. `ARCHITECTURE.md` se limita al funcionamiento técnico y a las decisiones del juego; el detalle de cada módulo vive en su `mod.md`, actualizado en el mismo cambio que el código. Las cifras de rendimiento son referencia observada, no umbrales automáticos.
- Un cambio de comportamiento incluye prueba del límite que lo justifica. Los tests de regresión describen el resultado esperado; no imitan línea por línea la función probada. Extraer helpers compartidos solo cuando haya dos usos reales.
- Marcar una capacidad como implementada solo cuando tenga código y pruebas.

## Reglas del workspace

### graphify

- **graphify** (`.agents/skills/graphify/SKILL.md`; copia idéntica en `.claude/skills/graphify/SKILL.md`) — cualquier entrada al grafo de conocimiento. Trigger: `/graphify`
  Cuando el usuario escriba `/graphify`, usa el skill de graphify instalado o sus instrucciones antes de hacer nada más.

### Sin `allow` de clippy

- **Nada de `#[allow(clippy::…)]` ni `#![allow(clippy::…)]`**: un lint de clippy no se silencia, se corrige o se reagrupa (parámetros relacionados → struct de dominio). `cargo clippy --workspace --all-targets --locked -- -D warnings` es el gate; si un lint es genuinamente inaplicable, la excepción la decide el usuario, nunca el código.

### web_deprecated

- **No editar `web_deprecated/`**: es el cliente legacy sin desplegar (Netlify solo publica `lib/`), conservado únicamente como referencia. Ningún cambio se aplica ahí — ni limpieza de estilo, ni refactor, ni tests, ni actualizaciones de dependencias. Si necesitas consultarlo, hazlo en modo solo lectura.

## Tests y puertas de calidad

**Dominio:** pruebas unitarias colocalizadas como `<archivo>.test.rs` para invariantes locales; cada archivo de producción las incluye solo bajo `#[cfg(test)]`. Las pruebas de integración en `crates/iso/tests/` verifican relaciones entre módulos y contratos externos. Probar bordes y propiedades para coordenadas, guardado y generación. El fixture de contrato (`crates/iso/tests/contracts.json`) fija coordenadas, proyección, movimiento, rutas y reloj. Los resultados exactos del terreno y de las entidades se prueban con fixtures propios.

**Cliente:** probar transformaciones y composición con datos pequeños sin abrir GPU cuando sea posible. Usar pruebas visuales y recorridos manuales en nativo y WASM para profundidad, elevación, carga de assets, cámara, controles y persistencia. Guardar capturas de referencia de escenas concretas y registrar ventana, resolución y condiciones al comparar rendimiento.

**Comandos desde `lib/`:**

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core
```

Cuando se modifique el fixture de contrato, ejecutar la suite del crate (`cargo test -p iso`). La cobertura del dominio Rust sirve para localizar huecos, con especial atención a ramas de error, límites y persistencia; no se impone un porcentaje global que incentive tests redundantes. Antes de cerrar una fase de cliente, arrancar el binario nativo y el WASM servido por HTTP y comprobar la interacción real.
