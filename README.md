# 🗺️ Yorch Adventure

> Un mundo isométrico en voxeles de arcilla, generado proceduralmente, donde explorar playas, bosques y colinas a cualquier hora del día.

---

<p align="center">
  <img src="./lib/reference/referennce.png" alt="Yorch Adventure — escena isométrica" width="700" />
  <br>
  <em>Mundo isométrico generado desde semilla, con ciclo día/noche y criaturas amigables.</em>
</p>

---

## 🎮 Sobre el juego

**Yorch Adventure** es un cliente de mundo abierto isométrico escrito en Rust sobre [Macroquad]. El terreno se genera a partir de una semilla y se desfraga por trozos (*chunks*) a medida que avanzas, con sombras dinámicas que giran con el ciclo día/amanecer/anochecer, partículas ambientales, sonido posicional y guardado manual.

El protagonista camina, corre, salta (doble salto con voltereta al aire), nada, trepa y puede activar un mochila-reactor para surcar los cielos. No hay combate ni objetivos fijos: solo explorar, observar y moverse a tu ritmo.

### 🔖 Versión

| Componente | Versión |
|------------|---------|
| **Juego (iso-core)** | **0.27.0** |
| Motor de dominio (iso) | 0.1.0 |
| Gráficos / ventana | Macroquad 0.4.16 |
| Lenguaje | Rust (edición 2024) |

---

## ✨ Características

- 🌍 **Mundo isométrico infinito** generado proceduralmente desde semilla, streamado por chunks.
- 🌅 **Ciclo día/noche** con fases de luz y sombras proyectadas que giran con el sol.
- 🏃 **Movimiento completo:** camina, corre, salta, doble-salto con voltereta, nada y trepa.
- 🚀 **Mochila-reactor** (`J`) para volar libremente por el escenario.
- 🐰 **NPCs:** cangrejos que escarban a la orilla y conejos que saltan por el prado.
- 📱 **Controles táctiles** con joystick virtual y botón de salto en móviles/táctil.
- 💾 **Guardado manual** (`F5` / `Ctrl+S`) del progreso y chunks descubiertos.
- 🎨 **Arte en estilo clay/voxel**, renderizado en Blender desde piezas del kit oficial.

---

## 🕹️ Controles

| Acción | Teclado | Táctil |
|--------|---------|--------|
| Moverse | `WASD` o flechas | Joystick virtual (izquierda) |
| Correr | `Mayús` | Toque en el joystick |
| Saltar | `Espacio` | Botón `Saltar` (derecha) |
| Doble salto / voltereta | `Espacio` en el aire | `Saltar` en el aire |
| Activar mochila-reactor | `J` | Botón de reactor en el HUD |
| Guardar partida | `F5` o `Ctrl+S` | — |
| Alternar vista de terreno | `T` | — |
| Ver rendimiento | `P` | — |

> Los controles táctiles aparecen automáticamente en pantallas táctiles y se dibujan siempre encima del juego.

---

## 🛠️ Cómo ejecutar

### Requisitos

- [Rust](https://rustup.rs/) (canal estable)

### Ejecutar en local

```bash
# Clona el repositorio
git clone <url-del-repositorio>
cd armada-engine

# Entra al cliente del juego
cd lib

# Ejecuta el juego
cargo run --release
```

La ventana se abre a **960×600 px** con el título *Yorch Adventure*. El mundo se genera solo desde la semilla predeterminada; no hace falta configurar nada.

### Compilar para release

```bash
cd lib
cargo build --release
```

El binario queda en `lib/target/release/iso-core`.

---

## 🧱 Estructura del proyecto

```
armada-engine/
├── README.md                 # este showcase
├── screenshot.png            # captura principal
├── lib/                      # cliente del juego (Rust + Macroquad)
│   ├── Cargo.toml            # iso-core 0.27.0
│   ├── src/                  # dominios: game, player, terrain, lighting, gui, …
│   ├── assets/               # sprites y hojas de animación (clay/voxel)
│   ├── reference/            # capturas de referencia del motor
│   └── target/               # compilación
├── artifacts/                # kit voxel y scripts de Blender (.vox, .py)
├── graphify-out/             # grafo de conocimiento del código
└── netlify.toml              # despliegue web
```

---

## 📄 Licencia

Proyecto de motor de juego privado. Los assets de arte (sprites, modelos .vox, renders clay) son parte del kit oficial de *Yorch Adventure*.

---

<p align="center">
  <b>Yorch Adventure</b> — camina, salta, vuela. Un mundo de arcilla te espera.
</p>

[Macroquad]: https://macroquad.rs
