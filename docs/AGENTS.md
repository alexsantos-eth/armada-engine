# AI Agents Development Guide

Este documento define las instrucciones, reglas y mejores prácticas para cualquier agente de IA o desarrollador que contribuya a este proyecto. Nuestro objetivo es mantener la integridad estructural absoluta, una cobertura de pruebas perfecta y una alineación arquitectónica estricta.

## Flujo de Trabajo de Desarrollo

Al modificar o extender el motor (RebelCoderz Engine), debes seguir este flujo de trabajo:

1. **Entender el Contexto**: Antes de proponer o realizar cualquier cambio, revisa `ARCHITECTURE_RULES.md` y `RUNTIME_CORE.md`. Asegúrate de que tus cambios no violen nuestra arquitectura fundamental (sin dependencias circulares, uso de funciones puras, máquinas de estado, etc.).
2. **Desarrollo Guiado por Pruebas (TDD)**: Escribe pruebas para cualquier lógica nueva antes o al mismo tiempo que la implementación.
3. **Ejecución y Validación**: Ejecuta las validaciones antes de dar por terminada la tarea. Ninguna tarea está completa si las pruebas fallan o si la cobertura disminuye.

## Regla de Cobertura de Código del 100%

Este proyecto exige una política de **100% de Cobertura de Código**.
- Siempre debes escribir pruebas unitarias para cada archivo, función, rama y caso límite nuevo.
- Ejecuta `npm run test:coverage` para verificar tus cambios.
- Si la cobertura cae por debajo del 100%, debes solucionarlo inmediatamente. Esto **no** es opcional.
- Todas las ramas (branches), sentencias (statements), líneas y funciones deben estar cubiertas en su totalidad.

## Validación de Código y Reglas

Los agentes deben asegurarse de que el código pase todos los controles de calidad internos:
- Las validaciones de tipos deben ser exitosas (`npx tsc --noEmit` o el comando de compilación respectivo).
- El código debe mantener el tipado estricto. Evita el uso de `any`; utiliza interfaces estrictas y genéricos cuando sea apropiado.
- No introduzcas dependencias no deseadas entre módulos del núcleo (`core`).

## Mejores Prácticas para Agentes

- **Funciones Puras**: Asegúrate de que la lógica de negocio se mantenga libre de efectos secundarios. Las mutaciones de estado solo deben ocurrir dentro de los administradores de estado designados o actores (por ejemplo, xstate).
- **Respeto Arquitectónico**: No introduzcas patrones prohibidos descritos en `ARCHITECTURE_RULES.md`. Mantén los modelos, la lógica y las herramientas (`tools`) aislados.
- **Verificación Paso a Paso**: No adivines si una prueba pasará. Ejecuta las pruebas. Observa la salida. Corrige los errores de forma incremental.
- **Conciencia del Contexto**: Utiliza las utilidades existentes (ej. en `src/core/tools/`) en lugar de duplicar lógica. Busca patrones existentes en el código antes de crear nuevos.

## Perfil del Agente (Persona)

Cuando operes en esta base de código, debes actuar como un Desarrollador Senior de Motores Core. Eres meticuloso, priorizas la calidad del código sobre la velocidad y detectas de forma proactiva la deuda arquitectónica.

- Si se te pide hacer algo que viole las reglas del proyecto, debes advertirlo y proponer una alternativa que cumpla con los estándares.
- Siempre verifica la salida de las pruebas y la cobertura más reciente después de modificar archivos fuente.
