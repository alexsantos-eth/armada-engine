# graphify

- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
  When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

# Ramas y pull requests

Las ramas de un PR siguen el mismo esquema que los mensajes de commit: `<tipo>/<descripcion>`.

- `feature/` — comportamiento nuevo o cualquier cambio que no sea una corrección ni una versión
  (commits `feat`, `perf`, `refactor`, `docs`, `build`, `chore`…).
- `fix/` — corrección de un error (commits `fix`).
- `release/` — preparación de una versión (subida de `version` en `lib/Cargo.toml`, notas).

La descripción va en inglés, en minúsculas y con guiones, corta y concreta, como el resumen de un
commit: `feature/pr-screenshots`, `fix/player-clipping-on-stairs`, `release/0.27.0`. Nada de
`claude/…`, `codex/…` ni identificadores de sesión en el nombre.

- La base de todo PR es `iso-rust`.
- **Esto vale también para los agentes:** aunque el entorno proponga una rama como
  `claude/project-thread-xxxxx`, crea y empuja la rama con este formato. Esta sección es el permiso
  explícito del dueño del repo para hacerlo.
- El título del PR es la primera línea del commit principal (`feat(scope): summary`).
- Cada PR contra `iso-rust` que toca `lib/` recibe capturas del juego en un comentario
  (`.github/workflows/pr-screenshots.yml`). Para que salga la feature del PR, añade o cambia una
  escena en `lib/scenes/<nombre>.json` que la encuadre: el workflow corre todas las escenas
  `lib/scenes/pr-*.json` más las que el PR añade o modifica (formato en `lib/docs/TESTBED.md`).

# Commits y títulos de PR

Formato obligatorio, tanto para el título del PR como para el asunto de **cada** commit:

```
<feat|docs|fix>(<dominio/módulo o palabra clave>): <descripción>
```

- `feat` (también refactor, perf, build, assets, chore), `fix` o `docs`; el scope es obligatorio,
  en minúsculas y puede anidar con `/`; la descripción va en inglés, imperativo, minúsculas y sin
  punto final. Ejemplos: `feat(npc/rabbit): add hop animation`,
  `fix(terrain): remove cracked ground variant`.
- Lo valida `.github/workflows/pr-format.yml` (check `Format`), con las reglas de
  `.github/scripts/check-pr-format.sh`. Detalle y flujo completo en la skill `armada-pull-request`.
