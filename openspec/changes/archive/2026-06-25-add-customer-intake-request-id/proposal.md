## Why

`POST /api/v1/customers/intake` ya devuelve resultados controlados para éxito, replay, conflicto y validación, pero hoy no garantiza una referencia técnica correlacionable en todas las respuestas, especialmente cuando la petición falla antes de crear un intake. Esto dificulta soporte, depuración y revisión operativa de `422` y `500` sin exponer payload sensible.

## What Changes

- Agregar un `request_id` HTTP opaco generado por Rewards como UUID v4 nuevo para cada ejecución de `POST /api/v1/customers/intake`, siempre antes de la validación del body.
- Ignorar por completo cualquier `X-Request-ID` entrante: no validarlo, no reutilizarlo, no reflejarlo y no convertirlo en contexto operativo.
- Hacer que el middleware sea el único responsable de añadir `X-Request-ID` y garantizar que toda respuesta HTTP producida por esa combinación exacta de método y ruta incluya el header sin cambiar el body actual de éxito ni el envelope actual de error.
- Definir explícitamente que `request_id` identifica la ejecución HTTP y es distinto de `intake_request_id`, que sigue identificando el intake persistido.
- Incorporar un único evento estructurado `customer_intake_http_completed` por petición con `request_id`, método, ruta, status HTTP, duración e `intake_request_id` sólo cuando exista, usando `INFO` para respuestas normales y `ERROR` para excepciones inesperadas.
- Documentar `X-Request-ID` como header de respuesta del endpoint en OpenAPI sin agregar `request_id` a bodies ni schemas JSON existentes.
- Mantener fuera de alcance la persistencia de `request_id`, cambios de tablas, métricas, tracing distribuido, OpenTelemetry, plataformas externas y consultas administrativas por `request_id`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `simulated-customer-intake-flow`: el endpoint provisional debe emitir `X-Request-ID` en toda respuesta HTTP de `POST /api/v1/customers/intake`, ignorar cualquier header entrante homónimo, documentar ese header en OpenAPI y registrar exactamente un evento estructurado mínimo sin exponer payload ni PII.

## Impact

Afecta el transporte HTTP del intake provisional, el manejo de validaciones y excepciones del endpoint, la documentación OpenAPI y las pruebas HTTP/estructurales asociadas. No cambia la persistencia, el catálogo público de errores, el flujo de negocio ni los contratos JSON actuales.
