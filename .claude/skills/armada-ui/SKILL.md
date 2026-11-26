---
name: "armada-ui"
description: "Úsala para cualquier cambio de interfaz en Armada Engine (HUD, barra de slots, avisos, globos, botones, controles táctiles, menús, diálogos, iconos): se diseña o extiende el kit de UI clay/cómic en HTML/CSS (lib/web/ui), se exporta a sprites con scripts/export-ui.cjs y Macroquad los dibuja igual en nativo y en web (src/gui/clay)."
---

# Interfaz de Armada: diseñar en el kit, exportar y dibujar

Toda la interfaz del juego sale de **un solo sitio**: el kit de UI de arcilla y cómic en
`lib/web/ui/`. El aspecto se diseña en HTML/CSS, se **exporta a sprites** y el cliente Rust los
dibuja con Macroquad (`lib/src/gui/clay/`). Es el mismo método en nativo, en web y en las corridas
guionizadas: el juego **nunca** monta HTML sobre el canvas.

```
web/ui/armada-ui.css      tokens --ac-*, componentes .ac-*, animaciones     (diseño)
web/ui/armada-ui.js       window.ArmadaUI: construye y anima componentes    (catálogo y export)
web/ui/index.html         catálogo vivo, servido en /ui/                    (ver y probar)
web/ui/export.html        un [data-piece] por pieza que el juego dibuja     (qué se exporta)
web/ui/items/<id>.png     iconos de ítems (scripts/build-ui-icons.py)
        │  node scripts/export-ui.cjs  (Playwright + Chromium, escala 2)
        ▼
content/ui/<pieza>.png + ui.json   (commiteados; nunca a mano)
        │  ClaySkin::load
        ▼
src/gui/clay/   skin (manifest) · slice (nine-slice) · layout (dónde) · motion (curvas del CSS)
                hud (estado de animación) · draw (Macroquad) · frame (datos del fotograma)
```

La guía completa del kit, sus reglas de estilo y la tabla de componentes están en
`lib/docs/UI-KIT.md`; léela antes de empezar.

## Cuándo usar esta skill

Cualquier cambio que se vea en la interfaz: una pieza nueva del HUD, cambiar un color, un
tamaño o una animación, un menú o diálogo, el joystick o cualquier control táctil, un icono
nuevo de ítem o de herramienta, o la colocación de algo en pantalla. Si el cambio también toca
el dominio o el cliente, sigue además `armada-engine-dev`; esta skill manda en el cómo de la UI.

## Reglas

- **Una sola fuente del aspecto: el CSS del kit.** Nada se redibuja a mano en Rust con formas,
  colores o fuentes propias. Rust dibuja piezas exportadas (`draw_piece`, `nine_slice`), iconos y
  texto con la fuente del kit; los pocos trazos que pinta a mano (barra de progreso, contornos de
  texto) usan los colores de `ClaySkin::palette`, que vienen de los tokens.
- **Nada de HTML sobre el canvas**, en ninguna plataforma. `web/index.html` no carga el kit.
- **Colores, radios, tiempos y medidas son tokens** `--ac-*` en `:root`. Un valor nuevo se añade
  como token; nunca suelto en un componente. Colores planos, sin degradados; contorno de tinta con
  `#ac-wobble`; sombra sólida desplazada; formas irregulares (`--ac-blob*`).
- **Las animaciones se diseñan en CSS y se portan con las mismas curvas y duraciones** a
  `src/gui/clay/motion.rs` (`POP_MS`, `BUMP_MS`, `FLY_MS`, `CHOP_MS`…), puras y con test.
- **Fuente**: Fredoka (`content/fonts/Fredoka-Bold.ttf`, `DISPLAY_FONT`) para todo lo que el juego
  escribe en el HUD.
- **Táctil**: con los controles táctiles visibles no hay botón de acción; el joystick flotante
  (`src/touch/`) se dibuja con las piezas `stick_*` (`draw_clay_stick`). Las posiciones táctiles
  viven en `src/touch/layout.rs` y las del HUD en `src/gui/clay/layout.rs`; cambia ambas juntas.
- `content/ui/` se regenera con el script, **nunca a mano**. Los scripts de export sobrescriben,
  no borran (`rm -rf`/`fs.rmSync` recursivo están bloqueados en algunos entornos).

## Flujo

### 1. Diseñar o extender el kit

1. Si hace falta un color, tamaño o tiempo nuevo, añádelo como token en `:root` de
   `armada-ui.css`.
2. Escribe el componente como `.ac-<nombre>` con elementos `__parte` y estados `.is-<estado>`,
   apoyado en `.ac-hand` (o el mismo patrón `::before` con `#ac-wobble`).
3. Si necesita comportamiento para el catálogo, añádelo a `ArmadaUI` en `armada-ui.js`.
4. Añade su muestra al catálogo `web/ui/index.html` y su fila a la tabla de componentes de
   `lib/docs/UI-KIT.md`.
5. **Míralo**: sirve `lib/web/` (o `bash scripts/build-web.sh <dist>` y `python3 -m http.server`)
   y abre `/ui/`; captura con Playwright (Chromium está preinstalado) si no hay navegador.

Un icono de ítem o herramienta nuevo se renderiza desnudo con `artifacts/vox/clay/vox_icons.py
--render <id>` (`artifacts/vox/icons/<id>.png`: la pieza voxel que cae por el ítem, o el modelo de la
herramienta) y `python3 scripts/build-ui-icons.py` (Pillow, numpy) lo recorta y le dibuja el mismo
contorno de tinta que a todos, a `web/ui/items/<id>.png`; el contorno vive solo en ese script. Los de herramienta son símbolos SVG
del kit (`ArmadaUI.toolIcon`).

### 2. Declarar las piezas que el juego dibuja

En `web/ui/export.html`, un `<div data-piece="<nombre>" data-slice="<px>">` por pieza, con el
componente dentro a su tamaño de diseño:

- `data-slice` es el borde de nine-slice en px CSS (0 = la pieza se estira entera, para formas
  redondas o de tamaño fijo). Usa nine-slice para paneles que cambian de tamaño.
- El `--pad` (12 px) deja sitio al temblor y a la sombra; el manifest lo guarda como `pad`.
- Nombres en `snake_case`; las variantes de estado son piezas aparte (`slot_selected`,
  `stick_knob_run`).

### 3. Exportar

```bash
cd lib
python3 scripts/build-ui-icons.py      # solo si cambiaron los iconos o el contorno
node scripts/export-ui.cjs             # Node + Playwright con Chromium
```

En un contenedor sin Playwright local: `NODE_PATH=/opt/node-tools/node_modules node scripts/export-ui.cjs`.
El render no es bit a bit estable: si una pieza que no tocaste sale cambiada solo por ruido,
restáurala con `git checkout content/ui/<pieza>.png` para no ensuciar el cambio. Commitea
`content/ui/` (PNG nuevos o cambiados y `ui.json`).

### 4. Dibujarlo en el cliente

1. Añade la pieza a `REQUIRED_PIECES` (`src/gui/clay/skin.rs`): el test
   `the_committed_manifest_has_every_piece_the_hud_draws` falla hasta que el export la trae.
2. **Dónde**: geometría pura en `layout.rs` (o `src/touch/layout.rs`), con test.
3. **Cómo se mueve**: curvas en `motion.rs`, estado en `hud.rs`, ambos puros y con test.
4. **Qué muestra**: los datos llegan en `UiFrame`/`UiGain` (`frame.rs`), que arma
   `harvest::hud_frame` desde el juego; un dato nuevo se añade ahí, con test.
5. **Pintar**: `draw.rs`, solo llamadas a Macroquad (`draw_piece`, `draw_icon`, `draw_label`,
   `posed` para escala y giro como un `transform` de CSS). Es la excepción de GPU: se comprueba
   mirando, no con test.
6. Sin el kit (`ClaySkin::load` devuelve `None`) el cliente cae a un dibujo simple; mantenlo
   funcionando para lo que añadas.

### 5. Comprobar

- `cargo fmt`, `clippy -D warnings` (nativo y wasm32), `cargo test --workspace` y la build wasm
  (ver `armada-engine-dev`).
- **Nativo**: skill `armada-visual-check` con una escena que encuadre la UI (`scenes/pr-harvest.json`
  muestra la barra, el aviso, el botón de acción y los números voladores).
- **Web y táctil**: `bash scripts/build-web.sh <dist>`, sirve `<dist>` y ábrelo en Chromium
  (`--use-angle=swiftshader --enable-unsafe-swiftshader`, `/?fresh`, ~20 s de carga). Para móvil,
  viewport apaisado con `hasTouch`/`isMobile` y toques por CDP (`Input.dispatchTouchEvent`).
  Mira las capturas; un test verde no demuestra que se vea bien.

### 6. Documentar

En el mismo cambio: `lib/docs/UI-KIT.md` (componente, pieza, regla nueva), el `mod.md` de
`src/gui/clay/` (y de `src/touch/` si tocaste controles) con anclas verificadas, y esta skill si
cambia el flujo. Sube la versión (`armada-engine-dev`, Versionado).

## Lista de comprobación

- [ ] El aspecto está en el CSS del kit (tokens, `.ac-*`) y se ve en el catálogo `/ui/`.
- [ ] La pieza está en `export.html`, exportada a `content/ui/` y en `REQUIRED_PIECES`.
- [ ] Layout, curvas y estado son puros y tienen test; `draw.rs` solo pinta.
- [ ] Nada de HTML sobre el canvas; nada de colores o formas inventados en Rust.
- [ ] Visto en nativo (escena) y en web (escritorio y, si aplica, móvil emulado).
- [ ] `UI-KIT.md`, `mod.md` y versión actualizados.
