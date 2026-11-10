# graphify

- **graphify** (`.agents/skills/graphify/SKILL.md`; copia idéntica en `.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
  When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

# clippy_sin_allows

- **Nada de `#[allow(clippy::…)]` ni `#![allow(clippy::…)]`**: un lint de clippy no se silencia, se corrige o se reagrupa (parámetros relacionados → struct de dominio). `cargo clippy --workspace --all-targets --locked -- -D warnings` es el gate; si un lint es genuinamente inaplicable, la excepción la decide el usuario, nunca el código.

# web_deprecated

- **No editar `web_deprecated/`**: es el cliente legacy sin desplegar (Netlify solo publica `lib/`), conservado únicamente como referencia. Ningún cambio se aplica ahí — ni limpieza de estilo, ni refactor, ni tests, ni actualizaciones de dependencias. Si necesitas consultarlo, hazlo en modo solo lectura.
