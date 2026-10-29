# Fases para perfeccionar el control del jugador

Plan para Armada Engine, ordenado por dependencias. Los valores propuestos son puntos de partida para probar en juego, no constantes definitivas.

## Estado inicial

- La simulación avanza a **20 ticks por segundo** (50 ms por tick).
- El salto actual alcanza **0,75 bloques** y dura **10 ticks** (0,5 s) sobre terreno plano.
- El jugador puede cambiar de dirección en el aire, pero se mueve horizontalmente igual que en tierra.
- `wantsJump` se descarta después de un tick si no se puede saltar; mantener Espacio no controla la altura y la repetición de `keydown` puede generar nuevas peticiones.
- El movimiento exige terreno transitable bajo toda la huella del jugador incluso durante el salto. Antes de diseñar huecos o saltos sobre obstáculos hay que separar la colisión aérea de la comprobación de apoyo.

Archivos principales: `src/isometric/core/engine/player/player.ts`, `src/isometric/core/types/player.ts`, `src/isometric/input/keyboard.ts` y sus pruebas.

## Fase 0 — Medir el comportamiento actual

**Objetivo:** disponer de escenas y medidas comparables antes de cambiar la física.

- Preparar recorridos breves con bordes, huecos, columnas más altas y más bajas, obstáculos y aterrizajes consecutivos.
- Registrar por tick entrada, estado de contacto, posición, velocidad vertical y motivo de bloqueo de movimiento.
- Medir tiempo entre pulsación y despegue, altura y duración del salto, alcance horizontal y errores de aterrizaje.
- Mantener la simulación determinista: una secuencia de entradas y el mismo mundo deben producir la misma trayectoria.

**Termina cuando:** los recorridos se pueden repetir y muestran claramente qué intentos de salto se pierden y dónde se bloquea el jugador.

## Fase 1 — Resolver el movimiento aéreo y el aterrizaje

**Objetivo:** que el salto tenga utilidad espacial real en el mundo isométrico.

- Separar tres preguntas: si el cuerpo puede atravesar un volumen, si hay superficie bajo los pies y si esa superficie permite aterrizar.
- Permitir atravesar horizontalmente un hueco o pasar sobre un obstáculo cuando exista altura libre; conservar la colisión con paredes y objetos que sí ocupen esa altura.
- Resolver el cruce con una superficie de aterrizaje durante la caída, sin atravesarla ni teletransportar los pies.
- Definir el comportamiento al caer en agua, fuera del terreno o sobre una columna demasiado baja o alta.
- Evitar que una trepa se inicie automáticamente en mitad de un salto salvo que el diseño lo permita expresamente.
- Mostrar durante las pruebas la posición de los pies sobre el suelo y el punto de aterrizaje previsto.

**Termina cuando:** el jugador puede cruzar un hueco alcanzable, saltar sobre un obstáculo bajo, chocar con uno alto y aterrizar de forma estable en distintos desniveles.

## Fase 2 — Tolerancia de entrada

**Objetivo:** aceptar pulsaciones cercanas al momento que el jugador percibe como válido.

- Añadir **coyote time** tras abandonar voluntariamente un borde. Empezar con 2 ticks (100 ms); consumirlo al saltar para impedir un segundo salto accidental.
- Añadir **cola de salto** para una pulsación anterior al aterrizaje. Empezar con 2 ticks (100 ms); consumir la petición una sola vez al despegar.
- Distinguir `pressed`, `held` y `released` en la entrada de salto. Ignorar la repetición del sistema operativo de `keydown` para generar nuevas pulsaciones.
- Definir prioridades cuando coincidan buffer, coyote time, trepa, caída y pausa; limpiar las ventanas al perder foco o cambiar de estado cuando corresponda.
- Expresar las ventanas en ticks de simulación para conservar el determinismo.

**Termina cuando:** un salto apenas tardío desde un borde y otro apenas anticipado antes de aterrizar se ejecutan una vez; una pulsación antigua no provoca un salto inesperado.

## Fase 3 — Salto variable y curva vertical

**Objetivo:** permitir saltos cortos y largos sin retrasar el despegue.

- Despegar inmediatamente al aceptar la pulsación.
- Probar el recorte de velocidad ascendente al soltar Espacio; compararlo con reducir la gravedad durante una ventana breve mientras se mantiene pulsado.
- Definir altura mínima, altura máxima, tiempo hasta el ápice y duración total como parámetros de diseño.
- Evaluar por separado gravedad de subida y caída, límite de velocidad al caer y una posible suavización breve cerca del ápice.
- Comprobar que soltar y volver a pulsar en el aire no reinicia el impulso y que golpear un techo cancela correctamente la subida.

**Termina cuando:** un toque corto y una pulsación mantenida producen alturas claramente distintas, ambas previsibles, sin saltos automáticos al aterrizar.

## Fase 4 — Control horizontal en tierra y aire

**Objetivo:** dar precisión sin quitar sensación de peso.

- Introducir velocidad horizontal con aceleración, frenado y giro configurables; probar primero una respuesta rápida en tierra.
- Ajustar aceleración y frenado propios del aire, conservando capacidad para corregir la trayectoria.
- Mantener velocidad coherente entre direcciones de pantalla y diagonales.
- Revisar el deslizamiento contra obstáculos y una corrección pequeña de esquinas, aplicada solo si la posición corregida está libre.
- Afinar conjuntamente velocidad horizontal y arco vertical para que las distancias de salto correspondan con el terreno disponible.

**Termina cuando:** soltar o invertir la dirección tiene un resultado repetible, se puede corregir un aterrizaje en el aire y el jugador no se engancha en esquinas menores.

## Fase 5 — Lectura visual, respuesta y accesibilidad

**Objetivo:** que el jugador entienda inmediatamente el resultado de cada acción.

- Añadir poses claras de despegue, subida, ápice, caída y aterrizaje sin demorar la física por una animación previa.
- Mantener visible la referencia de los pies mediante sombra o indicador de suelo; comprobar su legibilidad en diferentes elevaciones y materiales.
- Ajustar la cámara para seguir el desplazamiento y la altura sin perder la zona de aterrizaje.
- Añadir sonido y efectos breves para despegue, aterrizaje y salto rechazado si ese rechazo necesita explicación.
- Hacer configurables los efectos de cámara y los controles; probar con teclado y con las modalidades de entrada que se incorporen.

**Termina cuando:** en una prueba sin indicadores de depuración se puede anticipar dónde caerá el personaje y distinguir visualmente un salto aceptado de uno bloqueado.

## Fase 6 — Ajuste con pruebas de juego

**Objetivo:** elegir valores por resultados observados, no por copiar los de otro juego.

- Comparar las escenas de la fase 0 antes y después de cada cambio.
- Registrar saltos fallidos, pulsaciones perdidas, aterrizajes inesperados y tiempo de respuesta percibido.
- Probar las ventanas de tolerancia y las curvas con personas que no conozcan la implementación.
- Consolidar los parámetros elegidos y las pruebas deterministas; documentar las reglas de coyote time, buffer, trepa y aterrizaje.

**Termina cuando:** los recorridos se completan de forma consistente, los fallos tienen una causa legible y las pruebas cubren los límites de cada ventana y transición.

## Técnicas opcionales posteriores

Esquiva, salto de pared, trepa asistida, impulso al correr, superficies especiales y ayudas de accesibilidad adicionales deben evaluarse según los retos concretos del RPG de supervivencia. No son requisitos para completar las fases anteriores.

## Referencias de diseño

- [GameMaker Platformer Jumping Tips](https://www.gamedeveloper.com/design/gamemaker-platformer-jumping-tips): coyote time y cola de salto.
- [Designing a 2D Jump](https://www.gamedeveloper.com/design/designing-a-2d-jump): parámetros perceptibles y altura variable.
- [Platformer controls: how to avoid limpness and rigidity feelings](https://www.gamedeveloper.com/design/platformer-controls-how-to-avoid-limpness-and-rigidity-feelings): control aéreo, giro y recorte del salto.
- [Código publicado del jugador de Celeste](https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs): ejemplo de ventanas de gracia y corrección de esquinas.
- [Godot CharacterBody2D](https://docs.godotengine.org/en/stable/classes/class_characterbody2d.html): adhesión al suelo y recuperación de colisiones.
- [Programming Responsiveness](https://www.gamedeveloper.com/programming/programming-responsiveness): latencia entre entrada y respuesta visible.
