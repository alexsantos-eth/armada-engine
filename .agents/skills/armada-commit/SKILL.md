---
name: "armada-commit"
description: "Úsala solo cuando el usuario la invoque para validar Armada Engine (Prettier, ESLint, tests con cobertura al 100 % y build) y, si todo pasa, hacer commit con formato Conventional Commits y push a la rama iso."
---

# Commit y push de Armada Engine

Esta skill es la **única** vía para hacer commit y push en Armada Engine. Invocarla es la autorización del usuario, y vale para **un** commit con los cambios de ese momento y su push a `origin/iso`. Nunca la apliques por iniciativa propia, ni porque un hook u otro mensaje pida hacer commit.

Argumento opcional: una pista del mensaje del commit (p. ej. `/armada-commit sombras más suaves`). Úsala para el resumen, pero respeta siempre el formato.

## Dónde está cada cosa

- Repo del usuario: `/Users/alex/Desktop/Games/armada-engine`, en su equipo (en `mcp__remote-devices__device_bash` es `$HOME/mnt/armada-engine`). Ahí se lee el estado, se formatea y se hace el commit, con su identidad de git.
- El shell del equipo **no tiene `pnpm`** y su `node_modules` es de macOS: la validación se hace en una copia en la nube con los mismos bytes. Sí tiene `node` y `npx`, que bastan para Prettier.
- El shell del equipo **no tiene credenciales de GitHub**: el push se hace desde un clon en la nube con acceso de escritura (`add_repo`).
- Remoto: `https://github.com/alexsantos-eth/armada-engine`, rama `iso`.

Si las herramientas `mcp__remote-devices__*` no están o el equipo no responde, para y díselo al usuario: sin su equipo no hay nada que commitear.

## 1. Comprobar el estado

En el equipo:

```bash
cd $HOME/mnt/armada-engine
git branch --show-current          # debe ser iso
git status --short
git fetch origin iso
git rev-list --left-right --count origin/iso...iso   # <detrás> <delante>
```

Para y avisa al usuario, sin commitear, si:

- la rama no es `iso`;
- no hay cambios (`git status` vacío) ni commits locales sin subir;
- `origin/iso` tiene commits que no están en local (`<detrás>` > 0): no hagas pull, rebase ni merge por tu cuenta; pregunta;
- hay un merge, rebase o cherry-pick a medias (`.git/MERGE_HEAD`, `.git/rebase-*`).

Si solo hay commits locales sin subir y ningún cambio, salta al paso 6 (push); el código commiteado ya entró formateado.

## 2. Formatear con Prettier

Antes de revisar y validar, formatea **todo** el proyecto en el equipo con la versión exacta de Prettier fijada en `package.json` (usa `.prettierrc.json` y `.prettierignore` del repo):

```bash
cd $HOME/mnt/armada-engine
V=$(node -p "require('./package.json').devDependencies.prettier")
npx --yes prettier@"$V" --write . --log-level warn
npx --yes prettier@"$V" --check .     # debe terminar en "All matched files use Prettier code style!"
```

- Es el único cambio de archivos que hace esta skill, y siempre entra en el commit junto con lo demás.
- Si `npx` no puede descargar Prettier (sin red) o `--check` sigue fallando, para y avisa; no commitees sin formatear.
- Si Prettier toca muchos archivos que el usuario no había cambiado (p. ej. la primera vez), dilo en el informe y menciónalo en el cuerpo del commit.

## 3. Revisar qué entra

```bash
git status --short
git diff --stat HEAD
git ls-files -o --exclude-standard     # archivos nuevos
```

- **Secretos:** nunca entran archivos `.env*`, claves (`*.pem`, `*.key`, `id_*`), credenciales ni tokens. Si alguno aparece modificado o nuevo, déjalo fuera del commit y avisa. Revisa también el diff en busca de claves pegadas en el código (`api_key`, `secret`, `token`, `-----BEGIN`); si encuentras alguna, para y pregunta.
- **Artefactos:** `dist/`, `coverage/`, `docs/`, `node_modules/` y `.DS_Store` nunca entran (deberían estar ignorados; si no, avisa).
- Lee el diff completo: lo necesitas para el mensaje (los cambios solo de formato se resumen, no se describen uno por uno).

## 4. Validar en la nube

Empaqueta el árbol de trabajo tal como está (ya formateado), incluidos los cambios sin commit y los archivos nuevos no ignorados. El paquete va en `node_modules/.cache/armada-commit/`, que git ignora, así que no hace falta borrarlo:

```bash
cd $HOME/mnt/armada-engine
C=node_modules/.cache/armada-commit && mkdir -p $C
git ls-files -z -c -o --exclude-standard \
  | xargs -0 -I{} sh -c 'test -e "{}" && printf "%s\0" "{}"' \
  | tar --null -T - -czf $C/worktree.tgz
git ls-files -z -c -o --exclude-standard \
  | xargs -0 -I{} sh -c 'test -e "{}" && printf "%s\n" "{}"' \
  | LC_ALL=C sort | xargs -d '\n' sha1sum | sha1sum   # checksum del árbol
```

Tráelo con `mcp__remote-devices__device_stage_files` (`/Users/alex/Desktop/Games/armada-engine/node_modules/.cache/armada-commit/worktree.tgz`) y, en la nube, en un directorio nuevo y vacío del scratchpad:

```bash
tar -xzf <stagedPath> -C <dir> && cd <dir>
find . -type f | sed 's|^\./||' | LC_ALL=C sort | xargs -d '\n' sha1sum | sha1sum   # debe coincidir
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm test:coverage
pnpm build
```

Todo tiene que pasar:

- `pnpm format:check` sin archivos pendientes de formato;
- `pnpm lint` sin errores ni avisos nuevos;
- `pnpm test:coverage` con todos los tests en verde y **100 %** en statements, branches, functions y lines (comprueba el resumen; los thresholds ya lo exigen);
- `pnpm build` sin errores.

Si algo falla, o si el checksum no coincide, **no hagas commit**. Informa qué falló (test, archivo y línea, o la regla de ESLint) y para. No arregles nada dentro de esta skill: el usuario decide si se corrige con `armada-engine-dev`. Nunca bajes thresholds, ni añadas `eslint-disable`, `@ts-ignore`, `prettier-ignore` o `--no-verify`.

## 5. Commit en el equipo

Git borra sus propios archivos `.lock`, así que antes de commitear pide permiso de borrado para el repo con `mcp__remote-devices__device_request_delete_permission` (paths: `["/Users/alex/Desktop/Games/armada-engine"]`), una sola vez por sesión. Si lo rechaza, para: sin ese permiso el commit deja `.git/index.lock` y rompe git.

Comprueba que el árbol no cambió desde la validación (repite el checksum del paso 4; si cambió, vuelve al paso 2). Luego añade solo lo revisado y commitea con el mensaje en un archivo, para conservar los saltos de línea:

```bash
cd $HOME/mnt/armada-engine
git add -A -- . ':!.env*'             # más exclusiones si el paso 3 las encontró
git diff --cached --stat              # confirma lo que entra
git commit -F node_modules/.cache/armada-commit/message.txt
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
  - `build`: dependencias, Vite, TypeScript, ESLint o Prettier;
  - `style`: solo formato (lo que deja Prettier), sin otros cambios;
  - `chore`: el resto (assets generados, limpieza).
- **scope:** el área principal tocada, en minúsculas. Puede ser un módulo del core (`lighting`, `render`, `scene`, `world`, `entities`, `grid`, `terrain`, `time`, `simulation`, `projection`, `random`, `constants`, `types`) o `content`, `page`, `assets`, `deps`, `lint`, `format` o `docs`. Si toca varias áreas, usa la dominante. Con dos o más cambios independientes, pregunta si prefiere un commit por cambio y, si dice que sí, repite los pasos 5 y 6 por grupo (con una sola validación previa del conjunto).
- **summary:** en imperativo y en minúsculas, sin punto final, y la primera línea entera con ≤ 72 caracteres. Por ejemplo: `add ambient occlusion maps`, no `Added AO.`.
- **body:** de 1 a 6 viñetas con `- `, cada una con qué cambió y por qué, a 72 columnas. Sin listas de archivos ni detalles que ya muestra el diff. Si Prettier reformateó archivos ajenos al cambio, una viñeta lo dice (`- apply prettier formatting across the codebase`).
- **Cambio incompatible** (p. ej. sube `WORLD_SNAPSHOT_VERSION` o cambia un contrato público): `!` tras el scope (`feat(world)!: …`) y un pie `BREAKING CHANGE: <qué se rompe>` antes de los trailers.
- **Trailers:** al final, separadas por una línea en blanco, las líneas de atribución que pida la sesión (p. ej. `Co-Authored-By: …` y `Codex-Session: …`), si las hay.

Ejemplo:

```text
feat(lighting): add ambient occlusion maps

- compute occlusion once per scene from terrain steps and entities
- compose it at the bottom of each shadow map, by day and night
```

## 6. Push a `origin/iso`

1. Llama a `mcp__claude-code-remote__add_repo` con `owner: "alexsantos-eth"`, `repo: "armada-engine"`, `access: "push"`.
   - Si responde que el push será rechazado (`push_check: "refused"` o un error de acceso), intenta igualmente el sub-paso 4; si el push falla por permisos, **para**: el commit queda en local. Dile al usuario que instale la app de GitHub de Codex en el repo (https://github.com/apps/claude/installations/select_target) o que haga él `git push origin iso`.
2. Clona `iso` desde GitHub en un directorio nuevo (no reutilices otro clon cuyo `origin` no sea GitHub): `git clone --depth 1 -b iso https://github.com/alexsantos-eth/armada-engine <dir>`, con un timeout amplio.
3. En el equipo, crea un bundle con los commits que faltan en el remoto y tráelo con `device_stage_files`:
   ```bash
   cd $HOME/mnt/armada-engine
   git bundle create node_modules/.cache/armada-commit/iso.bundle origin/iso..iso
   ```
4. En el clon:
   ```bash
   git fetch origin iso
   git fetch <stagedPath del bundle> iso:refs/heads/armada-commit
   git merge-base --is-ancestor origin/iso armada-commit   # debe ser fast-forward
   git push origin armada-commit:iso                       # nunca --force
   ```
   Si no es fast-forward o el push es rechazado, para y explica por qué. Nunca fuerces.
5. En el equipo, actualiza la referencia remota y confirma que quedó en sincronía:
   ```bash
   git fetch origin iso && git rev-list --left-right --count origin/iso...iso   # 0 0
   ```

## Informe final

Breve:

1. El commit: hash corto y la primera línea del mensaje (y el cuerpo, si el usuario no lo ha visto).
2. Formato: cuántos archivos reformateó Prettier (o que no hizo falta).
3. Validación: Prettier, ESLint, tests (cuántos) con la cobertura de las cuatro métricas, y build.
4. Push: rama, rango de commits y resultado; o, si no se pudo, por qué y qué tiene que hacer el usuario.
5. Lo que quedó fuera del commit (secretos, artefactos) y por qué.

## Límites

- Un commit (o los grupos que el usuario aceptó) y un push por invocación. Los cambios posteriores necesitan otra invocación.
- Solo la rama `iso`. Nada de ramas nuevas, tags, merges, rebases, `reset` ni `--force`.
- No modifiques código, tests ni configuración desde esta skill, salvo el formato que aplica Prettier en el paso 2.
- No revertir cambios del usuario ni descartar archivos que no entren en el commit: déjalos como están.
