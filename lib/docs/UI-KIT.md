# Armada UI kit

La librería HTML/CSS/JS que define el aspecto de toda la interfaz del juego: el HUD y cualquier
menú, diálogo o panel que venga después. El juego no carga HTML: el kit se **exporta a sprites** y
Macroquad los dibuja igual en nativo y en web (ver «El HUD del juego»), así que hay un solo
método en todas las plataformas. Estilo «arcilla y cómic», a juego con los
sprites voxel clay: colores planos, contorno de tinta grueso que tiembla como crayón, sombra sólida
desplazada y un grano fino de plastilina. Las cifras y los avisos son de cómic: globos que entran
con sacudida y números con contorno que vuelan en arco hasta su slot.

| Archivo | Qué es |
| --- | --- |
| [`web/ui/armada-ui.css`](../web/ui/armada-ui.css) | Tokens (`--ac-*`), componentes (`.ac-*`), animaciones. |
| [`web/ui/armada-ui.js`](../web/ui/armada-ui.js) | `window.ArmadaUI`: construye componentes y lanza las animaciones (catálogo y exportación). Script plano, sin build. |
| [`web/ui/items/<id>.png`](../web/ui/items/) | Iconos de los ítems: el sprite que el juego usa para el montón en el suelo, recortado y centrado en 128 px. |
| [`web/ui/index.html`](../web/ui/index.html) | Catálogo vivo: la muestra interactiva del HUD y cada componente con sus clases. Se publica en `/ui/`. |
| [`scripts/build-ui-icons.py`](../scripts/build-ui-icons.py) | Regenera los iconos desde `assets/items/` (necesita Pillow). |

`build-web.sh` copia `web/ui/` tal cual a `dist/ui/` para servir el catálogo; no hay paso de
compilación. La página del juego (`web/index.html`) no carga el kit. El CSS es la única fuente del
aspecto: nada se redibuja a mano en Rust, todo sale de las piezas exportadas.

El flujo de trabajo para cualquier cambio de interfaz (diseñar o extender el kit, exportar y
dibujar en el cliente, con cómo comprobarlo) está en la skill `armada-ui`
(`.claude/skills/armada-ui/SKILL.md`).

## Reglas del estilo

- **Colores planos, sin degradados.** Todo color sale de un token `--ac-*`; un color nuevo se
  añade como token en `:root`, nunca suelto en un componente. La textura es `--ac-noise`
  (ruido fino multiplicado sobre el relleno), no un degradado.
- **Contorno de tinta.** `--ac-line` (4 px) en `--ac-ink`, deformado con el filtro SVG
  `#ac-wobble` que `ArmadaUI.install()` inyecta una vez por página. El filtro va en un
  pseudo-elemento `::before` para que el texto quede nítido.
- **Sombra sólida desplazada** (`--ac-shadow-x`/`--ac-shadow-y`, sin desenfoque). Al pulsar, el
  elemento baja hacia su sombra y la sombra se encoge.
- **Formas irregulares**: los radios `--ac-blob*` nunca son círculos ni rectángulos perfectos.
- **Tipografía**: Fredoka (`--ac-display`) para cifras, botones, títulos y globos; Nunito Black
  (`--ac-body`) para texto corrido. Los números sobre fondo cambiante llevan contorno
  (`.ac-outlined`, `--ac-number-stroke`).
- **Iconos**: los de ítems son los PNG de `web/ui/items/` (`ArmadaUI.icon(id)`), con
  `drop-shadow` de tinta (`--ac-icon-shadow`). Los de herramienta (hacha, pico, red, mano) son
  símbolos SVG del kit (`ArmadaUI.toolIcon(kind)`).
- **Movimiento con propósito**: pop con sacudida para lo que se gana, rebote para lo que cambia,
  aplastado para lo que se pulsa. Con `prefers-reduced-motion` las animaciones se quitan y el
  número volador se salta (el contador se actualiza al instante).

## Componentes

Toda superficie con contorno es `.ac-hand` más un relleno: `.ac-paper`, `.ac-cream`,
`.ac-umber`, `.ac-gold`, `.ac-red` o `.ac-leaf` (o `--ac-fill` a mano).

| Componente | Clases | JS |
| --- | --- | --- |
| Chip | `.ac-chip` (+ `b` resaltado) | — |
| Tarjeta | `.ac-card` | — |
| Barra de inventario | `.ac-hotbar` | `new ArmadaUI.Hotbar(el, { keys, buttons })`, `.render(slots)`, `.slotFor(item)`, `.select(i)`, `.bump(slotEl)` |
| Mochila de inventario táctil | `.ac-backpack`, `.is-open` | — |
| Slot | `.ac-slot`, `__icon`, `__count`, `__key`; estados `.is-selected` / `[aria-pressed=true]`, `.is-empty`, `.is-bump` | lo crea `Hotbar` |
| Fila de tienda | `.ac-row`; estados `.is-selected`, `.is-disabled` | — |
| Toast | `.ac-row.is-toast`; `.is-warning` la pone roja | `toast`, `toast_warning` |
| Moneda | `.ac-coin`; tamaño `--ac-coin` | — |
| Marca de mercado | `.ac-mark` (lleva una `.ac-coin`); tamaño `--ac-mark` | — |
| Globo de cómic | `.ac-bubble`, `__body`, `__tail`, `__amount`, `__icon`; `.is-warning`, `.is-in`, `.is-out` | `ArmadaUI.bubble(capa, { x, y, amount, item, name, text, warning, ms })` |
| Botón de acción | `.ac-action`, `__icon`, `__label`, `__key`; `.is-pressed`, `.is-working` | `ArmadaUI.actionButton({ verb, tool, key })`, `ArmadaUI.setAction(btn, { verb, tool })`, `ArmadaUI.holdButton(btn, onChange, { refocus })` |
| Progreso de cosecha | `.ac-progress`, `__fill`; `--ac-progress-share` de 0 a 1 | — |
| Número volador | `.ac-fly`, `__icon` | `ArmadaUI.fly({ from: {x, y}, to: elemento, amount, item, onLand })` |
| Golpe | `.ac-hit` | `ArmadaUI.hit(el)` |
| Joystick táctil | `.ac-stick`, `__knob` (`.is-running`); tamaños `--ac-stick`, `--ac-stick-knob` | — |

`bubble` mantiene un solo globo por capa (la capa es su contenedor posicionado) y lo esconde
solo tras `ms` (1600 por defecto); `x`, `y` son la punta de la cola en píxeles de la capa.
`fly` va en coordenadas de la ventana: sale de `from`, sube en parábola sacudiéndose y entra en
el centro de `to`, y entonces llama a `onLand`. `holdButton` sigue un puntero (ratón, dedo o
lápiz) con captura, así que soltar fuera del botón también suelta.

## El HUD del juego (exportar a sprites)

El juego no abre HTML en ninguna plataforma, así que el kit se congela a imágenes y Macroquad las dibuja con las mismas medidas,
el mismo troquelado y las mismas animaciones.

La barra de cosecha usa dos piezas troqueladas, `progress` para el fondo oscuro y
`progress_fill` para el papel verde. El cliente estira el relleno dentro del borde según el
avance y dibuja solo el fondo cuando el avance es cero.

Las piezas `backpack_closed` y `backpack_open` indican el estado del inventario táctil. Un toque
alterna la barra de slots y reproduce el sonido correspondiente. La barra conserva su estado al
soltar el dedo.

| Pieza | Qué es |
| --- | --- |
| [`scripts/export-ui.cjs`](../scripts/export-ui.cjs) | Node + Playwright: abre `web/ui/export.html`, fotografía cada `[data-piece]` a un PNG transparente a 2× y escribe `content/ui/ui.json` (tamaño, margen alrededor de la forma, borde de troquelado y los colores de los tokens). Copia los iconos a `content/ui/items/`. |
| [`web/ui/export.html`](../web/ui/export.html) | Un `[data-piece]` por pieza, pintado con el CSS real. `data-slice` marca el borde para el nine-slice (0 = estirar entero). |
| [`content/ui/`](../content/ui/) | La salida commiteada: PNG por pieza, `ui.json`, `items/<id>.png`. Se regenera con el script, no a mano. |
| `content/fonts/Fredoka-Bold.ttf` | La fuente display del kit para Macroquad (descargada de Google Fonts). |
| [`src/ui/`](../src/ui/mod.md) | El cliente Rust: `skin.rs` (carga el manifest, texturas y fuente), `slice.rs` (nine-slice puro), `layout.rs` (dónde va cada pieza en escritorio y con controles táctiles), `motion.rs` (las curvas de `ac-pop`/`ac-out`/`ac-bump`/`ac-chop` y el vuelo, puras), `hud.rs` (estado de las animaciones: globo, vuelos, rebotes, cuentas en el aire) y `draw.rs` (lo pinta con Macroquad). |

Cada fotograma `harvest::hud_frame` arma un `UiFrame` (slots con id, nombre y cantidad; aviso con
verbo y herramienta, progreso y si está bloqueado; nota de inventario lleno) y un `UiGain` por
cada slot que recibe unidades de una recogida. El número sale del pecho del jugador
(`Game::player_chest`, `hud_frame::screen_share`) y vuela hasta el slot de destino o la mochila
táctil. Cada slot descuenta solo sus propias unidades en vuelo. Cuando aterrizan, se actualiza
su cantidad y rebota. El verbo y la herramienta salen de la regla de recolección
(`hacha → Talar`, `pico → Picar`, `red → Atrapar`, a mano → `Recoger`). `ClayHud` anima y
`draw_clay_hud` pinta. El botón de acción se maneja con ratón o toque (`action_pressed` en el
bucle) y se suma a `E` por `MacroquadInput::action_held`. Con los controles táctiles en pantalla
la barra sube arriba (una fila fina si cabe, como en un móvil apaisado; si no, filas de seis) y no
hay botón de acción: se recolecta manteniendo quieto el joystick flotante, que también se pinta
con el kit (`draw_clay_stick`: piezas `stick_base`, `stick_knob`, `stick_knob_run` con
la herramienta de lo que está al alcance sobre el mando). Ver [`src/touch/`](../src/touch/mod.md).

Es igual en nativo, en web y en las corridas guionizadas, así que las capturas automáticas de los
PR muestran el HUD tal como se juega. `ClaySkin::load` devuelve `None` (con un aviso) si falta
`content/ui/ui.json`, una pieza o la fuente; entonces el cliente pinta la hotbar simple de
`harvest::hotbar`.

**Regenerar tras cambiar el CSS o los iconos:**

```bash
python3 scripts/build-ui-icons.py     # si cambiaron los sprites de ítems
node scripts/export-ui.cjs            # necesita Playwright con Chromium
```

y commitea `content/ui/`. Si añades una pieza, decláralas en los tres sitios: `export.html`,
`REQUIRED_PIECES` (`src/ui/skin.rs`) y donde la dibuje `draw.rs`.

## Añadir algo al kit

1. Si hace falta un color, tamaño o tiempo nuevo, añádelo como token en `:root`.
2. Escribe el componente como `.ac-<nombre>` con elementos `__parte` y estados `.is-<estado>`,
   apoyado en `.ac-hand` o en el mismo patrón `::before` con `#ac-wobble`.
3. Si necesita comportamiento, añade una función o clase a `ArmadaUI` en `armada-ui.js`.
4. Añade su muestra a `web/ui/index.html` y su fila a la tabla de componentes de este documento.
5. Si el juego la dibuja, añádela como pieza a `export.html`, vuelve a exportar y dibújala desde
   `src/ui/`.
