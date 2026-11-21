# CI obligatorio

`.github/workflows/ci.yml` corre en cada PR contra `iso-rust` (y en cada push a `iso-rust`) las
mismas comprobaciones que la skill `armada-commit`:

| Job | Comando (desde `lib/`) |
| --- | --- |
| `rustfmt` | `cargo fmt --all -- --check` |
| `clippy (native)` | `cargo clippy --workspace --all-targets --locked -- -D warnings` |
| `clippy (wasm32)` | `cargo clippy --workspace --target wasm32-unknown-unknown --locked -- -D warnings` |
| `tests` | `cargo test --workspace --locked` |
| `wasm build` | `cargo build --release --locked --target wasm32-unknown-unknown --bin iso-core` |
| `CI` | Falla si cualquiera de los anteriores falla, se cancela o se salta. |

No arranca el juego ni saca capturas (eso es `pr-screenshots.yml`), así que tarda unos minutos.
El toolchain sale de `lib/rust-toolchain.toml` y la caché de `Swatinem/rust-cache`.

Los tests no se ejecutan en WebAssembly: `wasm32-unknown-unknown` no tiene un runner sin
`wasm-bindgen`, y Macroquad no lo usa. En su lugar, clippy y la build release comprueban que el
código que solo compila para la web (`#[cfg(target_arch = "wasm32")]`) sigue compilando y enlazando
igual que en Netlify.

## Formato de commits y título (`Format`)

`.github/workflows/pr-format.yml` corre en cada PR contra `iso-rust` (también al editar el título)
y falla si el título del PR o el asunto de algún commit no es
`<feat|docs|fix>(<dominio/módulo o palabra clave>): <descripción>`; los commits de merge se
saltan. Las reglas viven en `.github/scripts/check-pr-format.sh` (se puede correr en local) y el
flujo de ramas y PRs en la skill `armada-pull-request`. Es un check aparte de `CI`: para que
bloquee el merge, añade también `Format` a los checks obligatorios de la regla de rama.

## Hacerlo obligatorio

Un workflow no puede marcarse a sí mismo como obligatorio: eso es una regla de la rama y la pone
alguien con permisos de administrador del repo. Basta con exigir **un** check, `CI`, que resume a
los demás; así se pueden añadir o quitar jobs sin tocar la regla.

El check tiene que haber corrido al menos una vez para que GitHub lo ofrezca en la lista (el PR
que añade este workflow ya lo corre).

### Desde la web

1. *Settings → Rules → Rulesets → New ruleset → New branch ruleset*.
2. Nombre: `iso-rust`; *Enforcement status*: **Active**.
3. *Target branches → Add target → Include by pattern*: `iso-rust`.
4. Activar **Require status checks to pass** → *Add checks* → buscar `CI` y elegir el de
   *GitHub Actions*. Opcional: **Require branches to be up to date before merging**.
5. Activar **Require a pull request before merging** si aún no lo está.
6. *Create*.

(Con *Settings → Branches → Add classic branch protection rule* sale lo mismo: patrón
`iso-rust`, *Require status checks to pass before merging*, check `CI`.)

### Con `gh`

```bash
gh api -X POST repos/alexsantos-eth/armada-engine/rulesets --input - <<'EOF'
{
  "name": "iso-rust",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/iso-rust"], "exclude": [] } },
  "rules": [
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false, "require_last_push_approval": false,
        "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [ { "context": "CI", "integration_id": 15368 },
                                    { "context": "Format", "integration_id": 15368 } ] } }
  ]
}
EOF
```

`15368` es la app de GitHub Actions; fija el check a esa fuente para que nadie lo pueda
satisfacer con un estado puesto a mano.

## Si falla

- **rustfmt:** `cargo fmt --all` en `lib/` y commitear el resultado.
- **clippy:** arreglar el aviso; no se silencia con `#[allow]` salvo que haya un motivo escrito al
  lado.
- **wasm:** casi siempre es código nativo (`std::fs`, hilos, `std::time::Instant`) usado fuera de
  un `#[cfg(not(target_arch = "wasm32"))]`.
