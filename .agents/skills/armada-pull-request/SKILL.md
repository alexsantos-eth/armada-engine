---
name: "armada-pull-request"
description: "Úsala al abrir un pull request en Armada Engine (sobre todo desde un hilo o sesión de agente): rama feature/fix/release, commits y título <feat|fix|docs|refactor|perf>(scope): descripción, escena para las capturas automáticas y checks que debe pasar."
---

# Pull requests de Armada Engine

La base de todo PR es `iso-rust`. Esta skill dice cómo nombrar la rama, los commits y el título,
y qué hace el CI con el PR. No sustituye a `armada-commit` (que hace commit y push directo a
`iso-rust` cuando el usuario la invoca): se usa cuando el trabajo entra **por PR**.

## 1. Rama

`<tipo>/<descripcion>`, descripción corta, en inglés, minúsculas y guiones:

| Prefijo | Para qué |
| --- | --- |
| `feature/` | Comportamiento nuevo o cualquier cambio que no sea corrección ni versión (docs, refactor, perf, build, chore…). |
| `fix/` | Corrección de un error. |
| `release/` | Preparar una versión (`version` en `lib/Cargo.toml`, notas). |

Ejemplos: `feature/pr-screenshots`, `fix/player-clipping-on-stairs`, `release/0.27.0`.

**Nunca** `claude/…`, `codex/…` ni ids de sesión en el nombre, aunque el entorno proponga una rama
así: `.claude/CLAUDE.md` es el permiso explícito del dueño del repo para crear y empujar la rama
con este formato. Parte siempre de `origin/iso-rust` actualizado (`git fetch origin iso-rust`).

## 2. Commits y título: `<tipo>(<scope>): <descripción>`

- **tipo**: `feat`, `fix`, `docs`, `refactor` o `perf`.
  - `feat`: comportamiento nuevo (también build, assets o chore).
  - `fix`: corrección de un error.
  - `refactor`: cambio de estructura sin cambio de comportamiento.
  - `perf`: rendimiento.
  - `docs`: solo Markdown, comentarios o skills.
- **scope** (obligatorio): dominio/módulo o palabra clave, en minúsculas, con `/` para anidar:
  `npc/rabbit`, `terrain`, `lighting`, `ci`, `assets/beach`, `docs`.
- **descripción**: en inglés, imperativo, minúsculas, sin punto final.
- `!` tras el scope marca un cambio incompatible (`feat(world)!: …`).

Ejemplos: `feat(npc/rabbit): add hop animation`, `fix(terrain): remove cracked ground variant`.

El **título del PR** es la primera línea del commit principal, con el mismo formato. Con squash
merge ese título es el commit que queda en `iso-rust`.

## 3. Lo que valida el CI

- `.github/workflows/pr-format.yml` (check **`Format`**): el título del PR y el asunto de **cada**
  commit del PR (los merges se saltan) deben cumplir el formato. Se vuelve a evaluar al editar el
  título. Las reglas están en `.github/scripts/check-pr-format.sh`; para probarlas en local:
  `.github/scripts/check-pr-format.sh title "feat(npc/rabbit): add hop animation"` o
  `.github/scripts/check-pr-format.sh commits origin/iso-rust HEAD`.
  Si un commit no cumple, reescribe el historial **de tu propia rama** (reword/squash) y empuja;
  no vale con arreglar solo el título.
- `.github/workflows/ci.yml` (check **`CI`**): rustfmt, clippy (nativo y wasm32), tests y build
  wasm. Antes de abrir el PR corre lo mismo en `lib/` (ver `armada-commit`, paso 4).
- `.github/workflows/pr-screenshots.yml`: si el PR toca `lib/`, compila el cliente, corre las
  escenas y comenta capturas del juego en el PR. Corre todas las `lib/scenes/pr-*.json` más
  cualquier `lib/scenes/*.json` que el PR añada o cambie. **Para que salga la feature, añade o
  cambia una escena en `lib/scenes/<nombre>.json` que la encuadre** (formato en
  `lib/docs/TESTBED.md`; las subcarpetas `lib/scenes/*/` son salida y están ignoradas).

Detalles de los checks obligatorios y de la regla de rama: `lib/docs/CI.md`.

## 4. Abrir el PR

1. `git checkout -b feature/<descripcion> origin/iso-rust` y haz los commits con el formato.
2. Valida en `lib/` (fmt, clippy, tests, build wasm) y, si hay feature visible, la escena.
3. `git push -u origin feature/<descripcion>`.
4. PR contra `iso-rust`, título con el formato, cuerpo breve con qué cambia y por qué (y el pie de
   atribución que pida la sesión). No cierres ni reabras el PR para relanzar el CI.
5. Si `Format` falla, mira el mensaje del job: indica qué commit o título no cumple.
