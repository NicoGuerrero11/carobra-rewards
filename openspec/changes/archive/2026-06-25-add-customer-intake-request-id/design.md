## Context

El intake provisional vive en `POST /api/v1/customers/intake` y hoy combina tres puntos relevantes para esta change: el body se valida con Pydantic antes de entrar a la función de ruta, el `422` del endpoint se remapea desde un exception handler global en `main.py`, y el resultado exitoso o de replay devuelve `intake_request_id` sólo cuando ya existe un intake persistido. Eso deja sin referencia técnica uniforme a fallas tempranas como `422` o excepciones inesperadas.

La solución debe garantizar un UUID v4 opaco generado por Rewards antes de cualquier validación del body, ignorar por completo cualquier `X-Request-ID` entrante, devolver `X-Request-ID` en toda respuesta HTTP producida por esa combinación exacta de método y ruta, y registrar exactamente un evento estructurado mínimo sin body, payload ni PII. También debe mantener intactos el body de éxito y el envelope de error existentes.

## Goals / Non-Goals

**Goals:**
- Generar un UUID v4 opaco nuevo por cada ejecución HTTP del endpoint antes de la validación Pydantic.
- Ignorar por completo cualquier `X-Request-ID` entrante.
- Devolver el mismo `request_id` en `X-Request-ID` para toda respuesta HTTP producida por `POST /api/v1/customers/intake`, incluyendo éxito, replay, conflicto, validación, error controlado y excepción inesperada.
- Mantener separados `request_id` e `intake_request_id`, incluyendo el caso de replay con nuevo `request_id` y mismo `intake_request_id`.
- Emitir exactamente un evento estructurado `customer_intake_http_completed` por petición con `request_id`, método, ruta, status, duración e `intake_request_id` sólo cuando exista.
- Documentar `X-Request-ID` en OpenAPI como header de respuesta del endpoint sin tocar los schemas JSON.
- Evitar cambios a contratos JSON, persistencia, tablas, errores públicos y flujo de negocio.

**Non-Goals:**
- Persistir `request_id` o permitir búsquedas administrativas por ese identificador.
- Incorporar métricas, tracing distribuido, OpenTelemetry, integraciones externas o almacenamiento nuevo.
- Cambiar la semántica de creación de intakes, replay, conflicto o validación estructural.
- Extender esta trazabilidad a otros endpoints fuera de `POST /api/v1/customers/intake`.

## Decisions

### Usar middleware HTTP global con guard exacto de método y ruta

Se implementará un middleware HTTP global que se active sólo cuando `request.method == "POST"` y `request.url.path == "/api/v1/customers/intake"`. Esta decisión mantiene el cambio pequeño en superficie funcional, pero garantiza ejecución antes de la validación Pydantic y antes del exception handler custom de `422`.

Alternativas consideradas:
- Middleware sólo de router o lógica en la función de ruta: descartado porque no cubre fallas de validación previas a la ejecución de la ruta.
- Middleware global sin guard de ruta: descartado porque amplía el alcance de trazabilidad a endpoints no pedidos.

### Ignorar por completo `X-Request-ID` entrante y generar siempre un UUID v4 nuevo

El middleware no leerá ni validará `X-Request-ID` de entrada. Siempre generará un `uuid4()` nuevo y opaco para la ejecución actual. El header entrante no se reutilizará, no se reflejará y no se convertirá en contexto interno ni operativo.

Alternativas consideradas:
- Reutilizar un header entrante bien formado: descartado porque delega correlación al caller y rompe la decisión funcional de que Rewards es el emisor único.
- Validar y descartar el header entrante: descartado porque agrega lógica sin valor operativo si de todas formas se ignora.

### Transportar el identificador por `request.state` y centralizar el header en el middleware

El middleware generará `uuid4()` al inicio y lo guardará en `request.state.request_id`. Ese valor será la fuente única para:
- fijar `X-Request-ID` en toda respuesta del endpoint;
- ponerlo a disposición de handlers o mappings sólo como contexto de lectura, nunca como punto de escritura del header;
- usarlo en el log estructurado de cierre.

La función de ruta, los exception handlers y los mappings no modificarán bodies para incluir `request_id` ni escribirán `X-Request-ID`. El header se agregará exclusivamente en el middleware para no duplicar ramas por status ni puntos de salida.

Alternativas consideradas:
- Inyectar `request_id` en cada `Response` manualmente desde la ruta y handlers: descartado por duplicación y riesgo de omitir `422`.
- Añadir `request_id` al body: descartado porque rompe el contrato actual y está fuera de alcance.

### Publicar `intake_request_id` sólo como contexto opcional de logging

`request.state.intake_request_id` se poblará sólo cuando la ejecución haya producido o recuperado un intake persistido. Eso incluye:
- `201` con `APPROVED`;
- replay exitoso;
- `200` con `ALREADY_ACTIVE`;
- `409` con `curp_nss_conflict`, porque ese intake queda persistido antes del error.

No es obligatorio poblarlo para `external_request_conflict` cuando la ejecución no resolvió un resultado persistido. El middleware no intentará derivarlo desde el body ni persistirlo.

Esto preserva la distinción funcional:
- `request_id`: una ejecución HTTP;
- `intake_request_id`: el intake persistido, ausente en `422` y opcional en conflictos no resueltos sobre un resultado persistido.

### Manejar excepción inesperada con el mismo `request_id`, 500 seguro y un solo log ERROR

Si ocurre una excepción inesperada dentro de la ejecución del endpoint, el middleware conservará el `request_id` ya generado para esa petición, producirá el `500` genérico y seguro existente, incluirá `X-Request-ID` y emitirá exactamente un evento de nivel `ERROR`. El body no expondrá traceback ni detalles internos.

Esta rama sigue el mismo contrato de un solo evento por petición: no habrá un log `INFO` adicional para la misma ejecución.

### Logging mínimo, estructurado, con nombre fijo y sin datos sensibles

El middleware emitirá exactamente un único evento estructurado por petición del endpoint con nombre `customer_intake_http_completed`. Los únicos campos permitidos serán:
- `event`
- `request_id`
- `method`
- `path`
- `status_code`
- `duration_ms`
- `intake_request_id` sólo cuando exista

Reglas:
- `INFO` para respuestas HTTP normales, conflictos, validaciones y errores controlados;
- `ERROR` para excepción inesperada;
- `duration_ms` numérico y no negativo;
- omitir `intake_request_id` cuando no exista.

No se registrarán request body, response body, `original_payload`, headers completos, query string, `detail.message`, `source`, `external_request_id`, CURP, NSS, nombre, email, teléfono, código postal, Rewards ID, SQL, credenciales ni traceback dentro de los campos estructurados del evento. El diseño asume el logger estándar del servicio y evita introducir una plataforma nueva de observabilidad.

### Documentar `X-Request-ID` como response header en OpenAPI

La operación OpenAPI de `POST /api/v1/customers/intake` documentará `X-Request-ID` como header de respuesta para el endpoint. Esta documentación no añadirá `request_id` al body ni modificará los schemas JSON existentes.

## Risks / Trade-offs

- [Middleware global mal acotado] → Mitigar con guard estricto por método y path, y pruebas que verifiquen que otros endpoints mantienen su contrato actual.
- [Pérdida accidental del header en respuestas excepcionales] → Mitigar centralizando la inserción de `X-Request-ID` exclusivamente en el middleware para toda salida del endpoint.
- [Logs con campos sensibles por interpolación accidental] → Mitigar con logs estructurados de campos explícitos y pruebas que inspeccionen que no aparecen payload ni PII.
- [Duplicación de eventos de log] → Mitigar registrando el evento sólo en el middleware, con una única rama `INFO` o `ERROR` por petición.
- [Duración inconsistente entre ramas] → Mitigar midiendo tiempo en el middleware alrededor de toda la ejecución y registrando siempre un `duration_ms` numérico no negativo.

## Migration Plan

No requiere migraciones de datos ni cambios de esquema. El despliegue consiste en publicar el middleware, asegurar el `500` genérico seguro para excepciones inesperadas dentro del alcance del endpoint, documentar el header en OpenAPI y actualizar pruebas HTTP/estructurales. Rollback: revertir la change sin necesidad de corrección de datos, ya que `request_id` no se persiste.

## Open Questions

No hay preguntas abiertas para iniciar implementación; la change usa UUID v4 opaco generado localmente y alcance restringido al endpoint actual.
