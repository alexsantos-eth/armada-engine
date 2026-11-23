# Armada UI kit

La librería HTML/CSS/JS con la que se hace toda la interfaz en HTML del juego: el HUD de la build
web y cualquier menú, diálogo o panel que venga después. Estilo «arcilla y cómic», a juego con los
sprites voxel clay: colores planos, contorno de tinta grueso que tiembla como crayón, sombra sólida
desplazada y un grano fino de plastilina. Las cifras y los avisos son de cómic: globos que entran
con sacudida y números con contorno que vuelan en arco hasta su slot.

| Archivo | Qué es |
| --- | --- |
| [`web/ui/armada-ui.css`](../web/ui/armada-ui.css) | Tokens (`--ac-*`), componentes (`.ac-*`), animaciones y el layout del HUD del juego. |
| [`web/ui/armada-ui.js`](../web/ui/armada-ui.js) | `window.ArmadaUI`: construye componentes, lanza las animaciones y monta el HUD del juego. Script plano, sin build. |
| [`web/ui/items/<id>.png`](../web/ui/items/) | Iconos de los ítems: el sprite que el juego usa para el montón en el suelo, recortado y centrado en 128 px. |
| [`web/ui/index.html`](../web/ui/index.html) | Catálogo vivo: la muestra interactiva del HUD y cada componente con sus clases. Se publica en `/ui/`. |
| [`scripts/build-ui-icons.py`](../scripts/build-ui-icons.py) | Regenera los iconos desde `assets/items/` (necesita Pillow). |

`build-web.sh` copia `web/ui/` tal cual a `dist/ui/`; no hay paso de compilación. La página del
juego (`web/index.html`) carga las fuentes de Google Fonts, `ui/armada-ui.css` y
`ui/armada-ui.js` antes de `adapter.js`.

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
| Slot | `.ac-slot`, `__icon`, `__count`, `__key`; estados `.is-selected` / `[aria-pressed=true]`, `.is-empty`, `.is-bump` | lo crea `Hotbar` |
| Aviso | `.ac-prompt` (`kbd` opcional), `.is-blocked` | `new ArmadaUI.Prompt(el)`, `.render({ text, key, progress, blocked })` o `null` para ocultarlo |
| Barra de progreso | `.ac-progress`, `__fill`, variable `--ac-progress` (0–1) | la usa `Prompt` |
| Globo de cómic | `.ac-bubble`, `__body`, `__tail`, `__amount`, `__icon`; `.is-warning`, `.is-in`, `.is-out` | `ArmadaUI.bubble(capa, { x, y, amount, item, name, text, warning, ms })` |
| Botón de acción | `.ac-action`, `__icon`, `__label`, `__key`; `.is-pressed`, `.is-working` | `ArmadaUI.actionButton({ verb, tool, key })`, `ArmadaUI.setAction(btn, { verb, tool })`, `ArmadaUI.holdButton(btn, onChange, { refocus })` |
| Número volador | `.ac-fly`, `__icon` | `ArmadaUI.fly({ from: {x, y}, to: elemento, amount, item, onLand })` |
| Golpe | `.ac-hit` | `ArmadaUI.hit(el)` |

`bubble` mantiene un solo globo por capa (la capa es su contenedor posicionado) y lo esconde
solo tras `ms` (1600 por defecto); `x`, `y` son la punta de la cola en píxeles de la capa.
`fly` va en coordenadas de la ventana: sale de `from`, sube en parábola sacudiéndose y entra en
el centro de `to`, y entonces llama a `onLand`. `holdButton` sigue un puntero (ratón, dedo o
lápiz) con captura, así que soltar fuera del botón también suelta.

## El HUD del juego

`ArmadaUI.mountGameHud(document.body, { canvas })` construye `.ac-hud` encima del canvas: el
aviso y la barra de slots abajo en el centro y el botón de acción abajo a la derecha. Todo es
`pointer-events: none` salvo el botón, así que el canvas sigue recibiendo el ratón y los toques.
El botón no toma el foco (`tabindex=-1`, `preventDefault` al pulsar) y al soltarlo devuelve el
foco al canvas, para que el teclado siga llegando al juego.

Con los controles táctiles en pantalla (`.is-touch`) la barra sube arriba en dos filas de seis y
el botón de acción se pone encima del botón SALTAR, con las mismas medidas que
`src/touch/layout.rs` (margen `0,14 vh`, radio `0,073 vh`). Si esas medidas cambian en Rust,
cambian aquí.

### Puente con el cliente Rust

`web/adapter.js` monta el HUD y registra tres imports en `env`; el cliente los declara en
[`src/gui/web_ui.rs`](../src/gui/mod.md):

| Import | Qué hace |
| --- | --- |
| `iso_ui_active() -> i32` | 1 si la página tiene el kit. Si no, el cliente pinta su hotbar de Macroquad como en nativo. |
| `iso_ui_push(ptr, len)` | El cliente manda un JSON `{ frame?, gains }`; el HUD lo aplica con `GameHud.apply`. |
| `iso_ui_gather_held() -> i32` | 1 mientras el botón de acción está pulsado; se suma a la tecla `E` en `NormalizedInput::gather_held`. |

El mensaje (`WebUi::message`) solo lleva `frame` cuando cambió desde el anterior, y lleva cada
recogida del fotograma en `gains`:

```json
{
  "frame": {
    "visible": true,
    "touch": false,
    "slots": [{ "item": "wood", "name": "Madera", "count": 9 }, null],
    "prompt": { "text": "Madera", "verb": "Talar", "tool": "axe", "progress": 0.4, "blocked": false },
    "note": null
  },
  "gains": [{ "item": "wood", "name": "Madera", "amount": 3, "x": 0.5, "y": 0.42 }]
}
```

`x`, `y` de una ganancia son el pecho del jugador como fracción de la pantalla
(`Game::player_chest`, `harvest::web_hud::screen_share`): de ahí sale el globo `+3 Madera` y de
ahí vuela el número hasta el slot. Mientras un número está en el aire, el slot sigue mostrando la
cantidad anterior; al aterrizar se actualiza y rebota. `note` solo lleva «Inventario lleno»
(globo rojo encima de la barra): las ganancias tienen su propio globo. El verbo y la herramienta
salen de la regla de recolección (`hacha → Talar`, `pico → Picar`, `red → Atrapar`, a mano →
`Recoger`).

La build nativa y las corridas guionizadas no tienen HTML: siguen pintando la hotbar con
Macroquad (`harvest::hotbar::draw_hotbar`), así que las capturas automáticas de los PR no
muestran este HUD. Para verlo, sirve `dist/` y abre `/` o `/ui/`.

## Añadir algo al kit

1. Si hace falta un color, tamaño o tiempo nuevo, añádelo como token en `:root`.
2. Escribe el componente como `.ac-<nombre>` con elementos `__parte` y estados `.is-<estado>`,
   apoyado en `.ac-hand` o en el mismo patrón `::before` con `#ac-wobble`.
3. Si necesita comportamiento, añade una función o clase a `ArmadaUI` en `armada-ui.js`.
4. Añade su muestra a `web/ui/index.html` y su fila a la tabla de componentes de este documento.
5. Sube el `?v=` de `armada-ui.css`/`armada-ui.js` en `web/index.html` para saltar la caché de
   Safari, igual que con el adaptador.
