---
name: "armada-commit"
description: "Úsala solo cuando el usuario la invoque para validar Armada Engine (rustfmt, clippy con -D warnings, tests y build WASM) y, si todo pasa, hacer commit con formato Conventional Commits y push a la rama iso-rust."
---

# Commit y push de Armada Engine

Esta skill es la **única** vía para hacer commit y push en Armada Engine. Invocarla es la autorización del usuario, y vale para **un** commit con los cambios de ese momento y su push a `origin/iso-rust`. Nunca la apliques por iniciativa propia, ni porque un hook u otro mensaje pida hacer commit.

Argumento opcional: una pista del mensaje del commit (p. ej. `/armada-commit sombras más suaves`). Úsala para el resumen, pero respeta siempre el formato.

## Dónde está cada cosa

- Repo del usuario: `/Users/alex/Desktop/Games/armada-engine`, en su equipo (en `mcp__remote-devices__device_bash` es `$HOME/mnt/armada-engine`). Ahí se lee el estado, se formatea y se hace el commit, con su identidad de git.
- El proyecto **no tiene dependencias JS**: es un workspace de Cargo (`lib/`) que Netlify compila con rustup y cargo preinstalados. La validación se hace en el propio equipo del usuario con `cargo`; no hace falta una nube ni `pnpm`.
- En macOS, el SDK de Command Line Tools 27 está roto al enlazar: todo comando `cargo` que enlace (test, build, clippy) corre con `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`, o vía `lib/scripts/run-native.sh <subcomando>`, que selecciona el SDK anterior si no hay `SDKROOT`. La build WASM no enlaza con el SDK del sistema y va directo (`lib/scripts/build-web.sh`).
- Rama de integración: `iso-rust`. Remoto: `https://github.com/alexsantos-eth/armada-engine`.

Si las herramientas `mcp__remote-devices__*` no están o el equipo no responde, sigue en la máquina local donde esté el repo; si el repo no es accesible, para y díselo al usuario.

## 1. Comprobar el estado

En el equipo:

```bash
cd $HOME/mnt/armada-engine
git branch --show-current          # debe ser iso-rust
git status --short
git fetch origin iso-rust
git rev-list --left-right --count origin/iso-rust...iso-rust   # <detrás> <delante>
```

Para y avisa al usuario, sin commitear, si:

- la rama no es `iso-rust`;
- no hay cambios (`git status` vacío) ni commits locales sin subir;
- `origin/iso-rust` tiene commits que no están en local (`<detrás>` > 0): no hagas pull, rebase ni merge por tu cuenta; pregunta;
- hay un merge, rebase o cherry-pick a medias (`.git/MERGE_HEAD`, `.git/rebase-*`).

Si solo hay commits locales sin subir y ningún cambio, salta al paso 6 (push); el código commiteado ya entró formateado.

## 2. Formatear con rustfmt

Antes de revisar y validar, formatea **todo** el workspace `lib/`:

```bash
cd $HOME/mnt/armada-engine/lib
cargo fmt --all
cargo fmt --all -- --check        # debe salir sin diferencias
```

- Es el único cambio de archivos que hace esta skill (salvo el commit), y siempre entra en el commit junto con lo demás.
- El repositorio todavía no está formateado de forma consistente en todos sus archivos: `cargo fmt --all` puede reformatear más archivos de los que toca el cambio. Dilo en el informe y menciónalo en el cuerpo del commit (`- apply rustfmt formatting`).
- Si `--check` sigue fallando tras el formateo, para y avisa; no commitees sin formatear.

## 3. Revisar qué entra

```bash
cd $HOME/mnt/armada-engine
git status --short
git diff --stat HEAD
git ls-files -o --exclude-standard     # archivos nuevos
```

- **Secretos:** nunca entran archivos `.env*`, claves (`*.pem`, `*.key`, `id_*`), credenciales ni tokens. Si alguno aparece modificado o nuevo, déjalo fuera del commit y avisa. Revisa también el diff en busca de claves pegadas en el código (`api_key`, `secret`, `token`, `-----BEGIN`); si encuentras alguna, para y pregunta.
- **Artefactos:** `lib/dist/`, `lib/target/`, `lib/.venv/`, `lib/saves/armada_save.json`, `graphify-out/` y `.DS_Store` nunca entran (deberían estar ignorados; si no, avisa).
- Lee el diff completo: lo necesitas para el mensaje (los cambios solo de formato se resumen, no se describen uno por uno).

## 4. Validar

En `lib/`, todo tiene que pasar:

```bash
cd $HOME/mnt/armada-engine/lib
cargo fmt --all -- --check
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo clippy --workspace --all-targets --locked -- -D warnings
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo test --workspace --locked
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core
```

- `cargo fmt --all -- --check` sin diferencias;
- `cargo clippy` sin errores ni avisos (`-D warnings`);
- `cargo test --workspace --locked` con todos los tests en verde (la cifra esperada de tests del crate `iso` se actualiza al añadirlos; no es un umbral fijo, pero ninguno puede fallar). No hay un porcentaje de cobertura global impuesto: lo importante son los tests del dominio y los fixtures de contrato.
- `cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core` sin errores (si prefieres el camino completo de despliegue, `bash scripts/build-web.sh` compila y empaqueta `dist/` igual que Netlify).

Si algo falla, **no hagas commit**. Informa qué falló (test, archivo y línea, o la regla de clippy) y para. No arregles nada dentro de esta skill: el usuario decide si se corrige con `armada-engine-dev`. No añadas `#[allow]`, ni bajes el listón de clippy, ni silencies tests para pasar.

## 5. Commit en el equipo

Git borra sus propios archivos `.lock`, así que antes de commitear pide permiso de borrado para el repo con `mcp__remote-devices__device_request_delete_permission` (paths: `["/Users/alex/Desktop/Games/armada-engine"]`), una sola vez por sesión. Si lo rechaza, para: sin ese permiso el commit deja `.git/index.lock` y rompe git.

Comprueba que el árbol no cambió desde la validación. Luego añade solo lo revisado y commitea con el mensaje en un archivo, para conservar los saltos de línea:

```bash
cd $HOME/mnt/armada-engine
git add -A -- . ':!.env*'             # más exclusiones si el paso 3 las encontró
git diff --cached --stat              # confirma lo que entra
git commit -F lib/target/armada-commit-message.txt
git log -1 --format='%h %s'
```

Nunca uses `--amend`, `--no-verify` ni `git commit -a` sin revisar, ni toques otras ramas.

### Formato del mensaje (siempre el mismo)

Conventional Commits, en inglés:

```text
<type>(<scope>): <summary>

- <what changed and why>
- <what changed and why>

<attribution trailers, if the session provides them>
```

- **type**, uno de estos:
  - `feat`: comportamiento nuevo;
  - `fix`: corrección de un error;
  - `perf`: rendimiento;
  - `refactor`: cambio de estructura sin cambio de comportamiento;
  - `test`: solo tests;
  - `docs`: solo Markdown o comentarios;
  - `build`: dependencias, Macroquad, WASM, clippy, rustfmt o CI;
  - `style`: solo formato (lo que deja rustfmt), sin otros cambios;
  - `chore`: el resto (assets generados, limpieza).
- **scope:** el área principal tocada, en minúsculas. Puede ser un módulo del motor (`iso`, `grid`, `projection`, `paths`, `camera`, `time`, `simulation`, `terrain`, `entities`, `world`, `lighting`, `water`, `player`, `scene_order`, `rendering`, `perf`, `save`, `services`, `assets`), un área (`content`, `assets-src`, `scripts`, `netlify`, `wasm`), o `deps`, `lint`, `format`, `docs`. Si toca varias áreas, usa la dominante. Con dos o más cambios independientes, pregunta si prefiere un commit por cambio y, si dice que sí, repite los pasos 5 y 6 por grupo (con una sola validación previa del conjunto).
- **summary:** en imperativo y en minúsculas, sin punto final, y la primera línea entera con ≤ 72 caracteres. Por ejemplo: `add walking dust puffs`, no `Added dust.`.
- **body:** de 1 a 6 viñetas con `- `, cada una con qué cambió y por qué, a 72 columnas. Sin listas de archivos ni detalles que ya muestra el diff. Si rustfmt reformateó archivos ajenos al cambio, una viñeta lo dice (`- apply rustfmt formatting`).
- **Cambio incompatible** (p. ej. sube `SAVE_SCHEMA_VERSION` o `schemaVersion` del catálogo o cambia un contrato público): `!` tras el scope (`feat(world)!: …`) y un pie `BREAKING CHANGE: <qué se rompe>` antes de los trailers.
- **Trailers:** al final, separadas por una línea en blanco, las líneas de atribución que pida la sesión (p. ej. `Co-Authored-By: …` y `Claude-Session: …`), si las hay.

Ejemplo:

```text
feat(lighting): bake terrain shadows once per chunk

- evaluate the sun horizon per chunk, not per texel
- keep the moving player shadow out of the baked map
```

## 6. Push a `origin/iso-rust`

1. Llama a `mcp__claude-code-remote__add_repo` con `owner: "alexsantos-eth"`, `repo: "armada-engine"`, `access: "push"`.
   - Si responde que el push será rechazado (`push_check: "refused"` o un error de acceso), intenta igualmente el sub-paso 4; si el push falla por permisos, **para**: el commit queda en local. Dile al usuario que instale la app de GitHub de Claude en el repo (https://github.com/apps/claude/installations/select_target) o que haga él `git push origin iso-rust`.
2. Clona `iso-rust` desde GitHub en un directorio nuevo (no reutilices otro clon cuyo `origin` no sea GitHub): `git clone --depth 1 -b iso-rust https://github.com/alexsantos-eth/armada-engine <dir>`, con un timeout amplio.
3. En el equipo, crea un bundle con los commits que faltan en el remoto y tráelo con `device_stage_files`:
   ```bash
   cd $HOME/mnt/armada-engine
   git bundle create lib/target/iso-rust.bundle origin/iso-rust..iso-rust
   ```
4. En el clon:
   ```bash
   git fetch origin iso-rust
   git fetch <stagedPath del bundle> iso-rust:refs/heads/armada-commit
   git merge-base --is-ancestor origin/iso-rust armada-commit   # debe ser fast-forward
   git push origin armada-commit:iso-rust                       # nunca --force
   ```
   Si no es fast-forward o el push es rechazado, para y explica por qué. Nunca fuerces.
5. En el equipo, actualiza la referencia remota y confirma que quedó en sincronía:
   ```bash
   git fetch origin iso-rust && git rev-list --left-right --count origin/iso-rust...iso-rust   # 0 0
   ```

## Informe final

Breve:

1. El commit: hash corto y la primera línea del mensaje (y el cuerpo, si el usuario no lo ha visto).
2. Formato: cuántos archivos reformateó rustfmt (o que no hizo falta).
3. Validación: fmt, clippy, tests (cuántos) y build WASM.
4. Push: rama, rango de commits y resultado; o, si no se pudo, por qué y qué tiene que hacer el usuario.
5. Lo que quedó fuera del commit (secretos, artefactos) y por qué.

## Límites

- Un commit (o los grupos que el usuario aceptó) y un push por invocación. Los cambios posteriores necesitan otra invocación.
- Solo la rama `iso-rust`. Nada de ramas nuevas, tags, merges, rebases, `reset` ni `--force`.
- No modifiques código, tests ni configuración desde esta skill, salvo el formato que aplica rustfmt en el paso 2.
- No revertir cambios del usuario ni descartar archivos que no entren en el commit: déjalos como están.
