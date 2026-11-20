# Zonas semánticas de poblado

**Estado: fases 1 y 2 implementadas (2026-11-16).** El dominio `iso::settlements` decide dónde hay un poblado y qué significa cada columna dentro de él, antes de que el WFC coloque nada; la fase 2 añade la vegetación del poblado (`iso::entities::greenery`), que se siembra **después** de los edificios con un muestreo de disco de Poisson y un patio por edificio. El contenido vive en `content/json/settlements.json` (`schemaVersion` 1) y lo valida `iso::settlements::parse_settlements` contra el catálogo de entidades y las familias de `wfc.json`.

**Fase 3 (2026-11-19): cuadrícula de manzanas.** El esquema pasa a `schemaVersion` 2 y el Voronoi de las fases 1 y 2 (`seeds`, `ring`, `pull`, `radius`) desaparece. Cada poblado es ahora una rejilla de manzanas cuadradas cortada por calles: la manzana del medio es la plaza (`center`), el resto se reparte entre barrio (`residential`, con varios lotes en el borde de la manzana tocando la calle, y zonas `uniform` que levantan un solo tipo de edificio por manzana, como un mercado) y parque (`park`, cuyos lotes levantan bosquetes y decoración), alrededor queda una franja `edge` y cada lado abre una calle hacia el campo. Las calles se pavimentan antes de colocar nada, las casas las levanta `iso::entities::lots` sobre lotes fijos y el WFC solo rellena. El lado de la cámara (`x`/`y` bajas) prefiere parques y las casas miran hacia él, así que el poblado nunca encierra al jugador. Lo que sigue describe el diseño de las fases 1 y 2 y se conserva como historia; el contrato vigente está en [ARCHITECTURE.md](ARCHITECTURE.md#poblados-y-zonas-semánticas) y en el `mod.md` de `iso::settlements`.

## Por qué

Hasta ahora `iso::entities::wfc` repartía los edificios por todo el mundo con un peso global y un techo por chunk: una cabaña, un templo y un mead hall podían brotar en mitad de un bosque, a kilómetros de cualquier otra cosa. No había poblados, solo densidad. La referencia (el generador de aldeas de Watabou) hace lo contrario: primero decide qué parte del terreno es plaza, qué parte es barrio y qué parte es campo, y solo después coloca edificios dentro de cada parte.

## Cómo

1. **Sitios.** Los candidatos están en una rejilla de `spacing` columnas (112 hoy). Cada sitio hospeda un poblado con probabilidad `chance` (0,6), desplazado dentro de su celda por una tirada determinista y con un radio entre `radius.min` y `radius.max` (10–18). La validación exige `spacing > 2 · radius.max`, así que dos poblados nunca se solapan y una columna pertenece como mucho a uno: resolverla es mirar los nueve sitios de alrededor.
2. **Zonas.** Dentro del radio, cada zona suelta `seeds` semillas en una banda del radio (`ring`) y gana la columna la semilla cuya **distancia menos `pull · radio`** es menor: un Voronoi aditivo pesado. El `pull` ensancha o estrecha la celda de una zona; de ahí salen fronteras irregulares en vez de anillos concéntricos, que es lo que hace que el poblado parezca crecido y no trazado.
3. **Perfiles.** Cada zona multiplica el peso wfc de cada blueprint (un `0` lo saca de las posibilidades de esa columna) y declara su `greens`, cuánta vegetación de poblado crece en ella. Una clave de perfil puede nombrar un blueprint o una familia de `wfc.json`; la del blueprint gana sobre la de su familia.
4. **Vegetación.** Dentro de un poblado el bioma no planta: el pase de biomas se salta toda columna cubierta por un asentamiento, y la vegetación la siembra `greenery::plant_greens` sobre los edificios ya levantados (ver «La vegetación» más abajo).

## Las cuatro zonas de hoy

| Zona | Semillas | Banda | `pull` | `greens` | Qué crece |
| --- | --- | --- | --- | --- | --- |
| `center` | 1 | 0–0,1 | 0,15 | 0 | mead hall, templo vikingo, santuario, puestos, círculo de runas, herrería, atalaya |
| `residential` | 4 | 0,25–0,6 | 0,17 | 0,5 | cabañas, casa de campo, herrería, casa del sanador, puestos, runas sueltas |
| `green` | 3 | 0,45–0,9 | 0,08 | 1,6 | bosquetes, arbustos, runas, santuario; es el único sitio donde los árboles salen más densos que fuera |
| `edge` | 5 | 0,75–1,0 | 0,06 | 0,9 | atalayas, cobertizos de barcas, cabañas sueltas, runas caídas, bosque aclarado |

El perfil `wilderness` rige fuera de todo poblado y pone a `0` todos los edificios: runas, arbustos, bosquetes y cobertizos siguen creciendo sueltos, pero una casa solo existe en un poblado.

## La vegetación

Dentro de un poblado los árboles no vienen del bioma: el pase de biomas se salta toda columna cubierta por un asentamiento y la vegetación la siembra `iso::entities::greenery::plant_greens` después del WFC, cuando los edificios ya están en pie. Las reglas comunes viven en el bloque `greens` de `settlements.json`; la densidad por zona, en el `greens` de cada zona.

**El patio** (lo que un vecino planta en su parcela). Cada edificio —todo blueprint con `roadAccess`— tira `patio.chance` (0,7) y cuelga entre `patio.min` y `patio.max` (2–4) plantas de su **parte trasera**, siguiendo su eje hasta `patio.reach` (2) columnas. La altura en pantalla baja al crecer `x + y`, así que la fachada mira hacia las columnas de menor `x` y menor `y` y la trasera es `+x`, `+y`: el patio queda detrás de la casa, nunca entre ella y la cámara. Una proporción `patio.groveChance` (0,18) de esas plantas es un bosquete de 2 × 2 en vez de un árbol suelto. La especie sale siempre del bioma de debajo, así que un poblado en taiga tiene patios de taiga.

**El esparcido azul** (lo que crece solo). El resto del suelo libre lo llena `iso::grid::PoissonScatter`: el mundo se corta en bloques, cada bloque ofrece una columna candidata y una prioridad derivadas de sus propias coordenadas, y una candidata se mantiene si ninguna más fuerte cae dentro del radio. El radio no es fijo —es la idea de la recomendación—: vale `tight` (2) pegado a una pared, `spacing` (6) a partir de `far` (9) columnas de todo edificio, e interpola entre `near` (3) y `far`; la densidad de la zona lo divide, con un mínimo de una columna. Las columnas del despeje delantero (`front`, 2 columnas en diagonal decreciente desde cada celda de edificio) se rechazan de plano, así que nada crece delante de una puerta.

Como cada columna se decide sola —sin lista de muestras activas y sin mirar a los vecinos—, el esparcido es el mismo mire el chunk a quien mire. El precio es que las muestras conservadas son máximos locales de prioridad dentro de su radio, de modo que salen algo más ralas que un Poisson empaquetado; la densidad se compensa en el contenido, no en el código.

## Medido

Sobre `WORLD_SEED`, nueve chunks alrededor de cada centro:

- Poblado `(267, 204)`, el más llano y herboso de los ocho primeros: `center` 57 columnas, 15 edificios y **0 plantas** (la plaza queda limpia); `residential` 270 columnas con 53 edificios y 84 plantas (≈ 1,5 por casa); `green` 330 columnas y 32 plantas, que se leen como un cinturón de arboleda; `edge` 188 columnas y 20 plantas.
- Poblado `(-58, -292)`: 61 edificios y 82 plantas en `residential`, 29 en `green`, 36 en `edge`, 0 en `center`.
- Poblado `(-148, -71)`, en la costa: su `green` son 121 columnas de arena y agua, así que no crece nada ahí. No es un fallo del pase, sino del sitio: ver la última limitación.

Del primer conteo de zonas (fase 1, poblado `(279, 32)`, radio 12,4): 43 columnas de `center`, 207 de `residential` con 54 edificios, 143 de `edge`, 96 de `green`, y ni un solo edificio en las 472 columnas de yermo alrededor.

## Qué no hace esta fase

- **Los techos siguen siendo por chunk.** `maxPerChunk` no sabe de poblados, así que uno a caballo de dos chunks puede repetir un edificio único. La fase siguiente sería un ancla por poblado: como el centro es función pura de la semilla, la casilla del mead hall se puede derivar sin mirar al chunk.
- **Los caminos no conocen las zonas.** `connect_roads` sigue uniendo lo que tenga `roadAccess` dentro de un chunk; como ahora los edificios están agrupados, el árbol que traza ya se lee como calles, pero una calle mayor trazada desde el `center` y las casas colgando de ella daría una traza mucho más deliberada.
- **El sitio no mira la superficie.** Un poblado se coloca donde cae su tirada, sin comprobar que haya tierra firme debajo: de los ocho poblados más cercanos al origen, cuatro caen sobre agua o arena y se quedan vacíos, porque todos los blueprints exigen su superficie. La fase siguiente sería puntuar el sitio por la proporción de hierba a su alrededor y desplazarlo o descartarlo, todo ello función pura de la semilla.
- **El terreno no se aplana.** Un poblado en pendiente reparte sus edificios por niveles, porque el WFC exige elevación uniforme por huella. Puede quedar bien o puede partir el poblado; aplanar el `center` sería una decisión de terreno, no de zonas.
