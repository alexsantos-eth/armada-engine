# Armada - Game Design Document

Nov 21, 2026 - @Alex

## Vision del juego

Armada es un juego de exploration, supervivencia y progresion en el que el jugador controla a un viajero espacial que cae en planetas procedurales, recolecta recursos, mejora sus herramientas, construye naves y conquista mundos cada vez mas hostiles.

El loop central es: **aterriza sin nada -> recolecta con herramientas rudimentarias -> vende en aldeas -> compra mejoras -> recolecta mas rapido -> construye nave -> viaja al siguiente planeta -> repite con mas dificultad**.

Cada planeta es una semilla procedural diferente: bioma, fauna y aldeas propias. \*\*Todos los recursos del juego existen en todos los planetas desde el primero\*\* — cristales exoticos, nucleos estelares y componentes de alta tecnologia estan ahi desde el dia 1. La diferencia es la accesibilidad: sin las herramientas correctas, encontrarlos es casi imposible. El jugador no conquista planetas mas faciles conforme avanza; se vuelve mas capaz de extraer lo que siempre estuvo ahi. El reto es el jugador, no el mundo.

**Genero:** exploration / survival / idle progression\
**Referencia principal:** No Man's Sky + Idle Miner\
**Plataforma objetivo:** macOS nativo + web (WASM)

## Progresion de herramientas

La progresion tiene 10 niveles agrupados en 4 eras. Cada nivel multiplica la velocidad de recoleccion del anterior y desbloquea acceso a recursos nuevos. Los saltos entre eras son graduales: cada era tiene al menos 2-3 niveles intermedios.

### Era 1 — Primitiva (planetas 1-2)

| Nivel | Herramientas | Mult. recoleccion | Desbloquea |
| --- | --- | --- | --- |
| 1 — Piedra | Hacha de pedernal, pico de piedra, red de fibra | x1 | Madera, piedra, fauna pequena |
| 2 — Hueso | Hacha de hueso, lanza, trampa de bejuco | x2 | Fauna mediana, raices |
| 3 — Cobre | Pico de cobre, cuchillo, anzuelo de cobre | x3.5 | Minerales superficiales, peces |

### Era 2 — Mecanica (planetas 2-4)

| Nivel | Herramientas | Mult. recoleccion | Desbloquea |
| --- | --- | --- | --- |
| 4 — Hierro | Hacha de hierro, pico de hierro, cepo de acero | x6 | Venas de hierro, rocas profundas |
| 5 — Acero | Sierra manual, barrena, red de acero | x10 | Arboles grandes, minerales medios |
| 6 — Engranaje | Taladora a manivela, triturador portatil | x18 | Recursos compuestos, fauna rara |

### Era 3 — Electrica (planetas 4-6)

| Nivel | Herramientas | Mult. recoleccion | Desbloquea |
| --- | --- | --- | --- |
| 7 — Basica | Sierra electrica, dron explorador, escaner de recursos | x35 | Cristales energeticos, minerales raros |
| 8 — Avanzada | Taladro laser, recolector de plasma, red cuantica | x60 | Esencia de fauna, compuestos exoticos |

### Era 4 — Automata (planetas 6+)

| Nivel | Herramientas | Mult. recoleccion | Desbloquea |
| --- | --- | --- | --- |
| 9 — Basico | Automata recolector (1 recurso), extractor fijo | x100 | Recoleccion pasiva, nucleos estelares |
| 10 — Flota | Flota de automatas, nave minera, IA conquistadora | x500+ | Conquista idle, planetas en paralelo |

### Equipo espacial (paralelo a las herramientas)

El traje y el equipo del viajero se mejoran en la misma tienda que las herramientas. Cada nivel de traje reduce el dano de fauna hostil y amplifica capacidades del jetpack.

| Nivel de traje | Mejoras clave |
| --- | --- |
| 1 — Ropa de viaje | Sin proteccion, jetpack x1 |
| 2 — Traje reforzado | -20% dano, jetpack x1.3, bolsillos extra |
| 3 — Armadura ligera | -40% dano, jetpack x1.6, escaner de flora |
| 4 — Armadura mecanica | -60% dano, jetpack x2, radar de recursos |
| 5 — Exoesqueleto | -80% dano, jetpack x3, recoleccion automatica de suelo |
| 6 — Traje de asalto | Inmune a fauna nivel 1-3, jetpack x5, escudo de energia |

El jugador desbloquea herramientas en cuatro eras. Cada era multiplica la velocidad de recoleccion y abre recursos nuevos inaccesibles en la era anterior.

| Era | Herramientas ejemplo | Multiplicador de recoleccion |
| --- | --- | --- |
| Rudimentaria | Hacha de piedra, pico de madera, red de mano | x1 (base) |
| Mecanica | Hacha de acero, pico de hierro, trampa de resorte | x5 |
| Electrica | Sierra electrica, taladro laser, dron recolector | x25 |
| Automatas | Maquinas cosechadoras, conquistas idle, flota minera | x100+ |

Las herramientas se compran en las aldeas con la moneda del planeta o se craftean combinando recursos. Las electricas requieren un componente raro que solo aparece en planetas de nivel 3+. Los automatas se programan para recolectar recursos especificos y enviarlos automaticamente al inventario del jugador aunque este explore otro planeta.

## Economia

Cada planeta tiene su propia moneda local y un catalogo de recursos que las aldeas compran. El jugador vende lo recolectado en las aldeas para obtener moneda y comprar mejoras o partes de nave.

**Recursos:**

- Comunes (madera, piedra, fibra): disponibles desde el nivel 1, precio bajo
- Raros (cristal energetico, mineral rojo, esencia de fauna): aparecen en planetas de nivel 2+, precio alto
- Exoticos (nucleo estelar, fragmento de artefacto): solo en planetas de nivel 4+, necesarios para automatas y naves avanzadas

**Comercio en aldeas:**

- Cada aldea tiene un catalogo que rota cada ciclo dia/noche
- Las herramientas, mejoras y partes de nave se compran con moneda del planeta actual
- Los automatas se financian con recursos exoticos, no con moneda

**Dinero entre planetas:** La moneda no desaparece al viajar entre planetas, pero su valor cambia: cada planeta tiene sus propios precios, así que la misma cantidad compra más o menos según el nuevo mundo. El jugador conserva herramientas, partes y autómatas.

## Viaje entre planetas

Cuando el jugador reune las partes necesarias puede construir una nave en cualquier zona abierta del planeta actual. Al despegar se genera un nuevo planeta (semilla aleatoria) con dificultad escalada segun el numero de planetas visitados.

**Partes de nave (progresion):**

| Nave | Partes requeridas | Planetas accesibles |
| --- | --- | --- |
| Capsula de escape | Motor rudimentario + casco | Planetas nivel 1-2 |
| Nave ligera | Motor mecanico + generador + casco reforzado | Planetas nivel 1-3 |
| Nave de asalto | Motor electrico + escudo + IA de navegacion | Planetas nivel 1-5 |
| Nave nodriza | Nucleo estelar x3 + automata piloto | Todos los niveles |

**Por que viajar a otro planeta:**

Todos los planetas tienen la misma dificultad base. El jugador no viaja porque el mundo escale, sino porque cada planeta tiene una semilla distinta con aldeas y biomas unicos. Viajar da acceso a distribuciones geograficas diferentes de los mismos recursos, aldeas con catalogos frescos, y la sensacion de conquista de explorar algo nuevo con un equipo mas poderoso. El reto siempre es el jugador: un planeta nuevo con equipo de nivel 10 se recorre en minutos; con equipo de nivel 1 tarda horas. Lo mismo aplica a los enemigos: desde el primer planeta hay criaturas faciles (conejos, cangrejos) y criaturas que pueden matar al jugador sin el equipo adecuado. El jugador aprende a leer el terreno y evitar lo que aun no puede vencer.

- Fauna mas agresiva
- Recursos comunes mas escasos, raros mas frecuentes
- Nuevos biomas que bloquean zonas sin herramientas adecuadas
- Aldeas mas grandes con mejores catalogos
- Algunos planetas con recursos valiosos cobran una tarifa de entrada al aterrizar

**Semilla:** el jugador puede guardar la semilla de un planeta favorito para volver a el con la nave.

## Combate y muerte

Todos los enemigos existen en todos los planetas desde el nivel 1. La dificultad percibida depende del equipo del jugador, no de la semilla.

| Tipo de enemigo | Comportamiento | Peligro sin equipo | Peligro con traje nivel 4+ |
| --- | --- | --- | --- |
| Conejo, cangrejo | Huye o ignora al jugador | Ninguno | Ninguno |
| Bestia territorial | Ataca si el jugador se acerca | Alto | Bajo |
| Depredador rapido | Persigue activamente al jugador | Letal | Moderado |
| Coloso | Enorme, defiende zonas de recursos raros | Letal x2 | Alto |
| Swarm (enjambre) | Muchos individuos debiles que rodean | Letal | Bajo |

**Vida y muerte:**

- El jugador tiene una barra de vida protegida por su traje; sin traje, unos pocos golpes lo matan.
- Al morir, cae en el lugar de su muerte y deja un **mochila de recursos** con todo lo que llevaba encima.
- El jugador reaparece en la ultima aldea visitada sin recursos, pero conserva herramientas equipadas y traje.
- Puede volver al punto de muerte a recuperar la mochila; si muere de nuevo antes de llegar, la mochila anterior desaparece.
- Esta mecanica crea tension real: salir a recolectar lejos de una aldea con recursos valiosos es un riesgo calculado.

## Fases de desarrollo

Cada fase entrega un loop jugable completo antes de pasar a la siguiente.

| Fase | Que entrega | Prerequisito tecnico |
| --- | --- | --- |
| 0. Fundacion determinista | Toda la simulacion (worldgen, NPCs, fisica, combate) usa RNG determinista con semilla; dos clientes con la misma semilla producen el mismo estado. Base necesaria para multijugador. | Prerequisito de todo lo demas |
| 1. Inventario y recoleccion | El jugador puede agarrar items del mundo (arboles, rocas, fauna) y llenarlos a un inventario con slots | Colision con entidades existentes |
| 2. Economia basica | Aldeas con NPC vendedor, moneda, catalogo de items; el jugador vende y compra herramientas | Fase 1 |
| 3. Herramientas rudimentarias y mecanicas | Dos primeras eras funcionales; la herramienta activa acelera la recoleccion del item correcto | Fase 2 |
| 4. Nave y viaje | Receta de nave en el inventario; al completarla se genera un nuevo planeta mas dificil | Fase 3 |
| 5. Herramientas electricas y automatas | Era 3 y 4; los automatas se colocan en el mundo y recolectan en idle | Fase 4 |
| 6. Pulido: fauna hostil y escalado | Criaturas con IA de ataque; dificultad por numero de planeta visitado | Fase 5 |

**Prioridad inmediata:** Fase 1 (inventario y recoleccion) es la base sin la que nada de lo demas funciona.
