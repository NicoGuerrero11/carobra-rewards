## Context

Carobra Rewards ya cuenta con el modelo persistente inicial para
`customer_intake_requests`, `customers`, `services` y `customer_services`, con
una unidad de trabajo SQLAlchemy y cobertura PostgreSQL. Sin embargo, el flujo
vigente sigue siendo un preview en `POST /api/v1/customers/intake/_preview` que
solo guarda un intake en `RECEIVED`, usa una UoW en memoria y devuelve un
resultado neutral sin cliente, sin Rewards ID y sin persistencia real.

El cambio propuesto cierra el primer recorrido funcional de alta simulada de
punta a punta. Debe mantenerse el límite actual `HTTP -> command -> use case ->
UnitOfWork`, reutilizar la persistencia existente y evitar que FastAPI,
SQLAlchemy o `AsyncSession` se filtren a `application` o `domain`.

La principal desviación respecto del explore es formalizar una modificación
puntual de `customer-persistence-model`: no basta con reutilizar la persistencia
tal como está, porque el flujo real necesita errores diferenciados de unicidad
y fallos explícitos cuando una actualización esperada del intake no encuentra
registro. El impacto es acotado: no cambia el modelo de datos base, pero sí
cierra los contratos operativos necesarios para implementar el caso de uso sin
ambigüedad.

## Goals / Non-Goals

**Goals:**
- Reemplazar el preview HTTP por `POST /api/v1/customers/intake` como endpoint
  funcional provisional respaldado por persistencia real.
- Definir un caso de uso `ProcessSimulatedCustomerIntake` con comando y
  resultado planos, independiente de FastAPI y SQLAlchemy.
- Ejecutar una nueva alta simulada en una sola transacción contra la unidad de
  trabajo real, creando cliente y relación `AFORE` solo cuando corresponda.
- Definir idempotencia por `(source, external_request_id)` con replay estable
  para estados recuperables `APPROVED` y `ALREADY_ACTIVE`.
- Cerrar el comportamiento transaccional y de concurrencia con savepoints para
  la carrera de clave externa, reintentos de Rewards ID y carrera de CURP.
- Definir el tratamiento de CURP existente con cliente ya vinculado a `AFORE`.
- Introducir un puerto explícito de Rewards ID con generación provisional opaca
  y reintentos acotados ante colisión.
- Traducir resultados y errores de aplicación a HTTP sin exponer excepciones de
  SQLAlchemy ni datos sensibles.

**Non-Goals:**
- Cerrar el contrato técnico definitivo de SISCA.
- Implementar autenticación, catálogo definitivo de fuentes, validación oficial
  de CURP o NSS, reglas reales de elegibilidad, onboarding, invitaciones,
  correo, términos y condiciones, sincronización de Rewards ID a SISCA o
  procesamiento asíncrono.
- Reparar automáticamente datos inconsistentes como un cliente con CURP
  existente pero sin relación `AFORE`.
- Definir el formato comercial definitivo del Rewards ID.

## Decisions

### 1. Reemplazar `/_preview` por `POST /api/v1/customers/intake`

El nuevo endpoint funcional provisional respaldado por persistencia real será
`POST /api/v1/customers/intake`, y `/_preview` dejará de existir como recorrido
alternativo activo una vez que el flujo exista.

Por qué:
- Mantiene una única entrada HTTP real para el recorrido simulado.
- Evita dos contratos concurrentes para la misma capacidad.

Alternativas consideradas:
- Mantener `/_preview` en paralelo. Rechazada porque duplicaría semántica,
  pruebas y wiring, y facilitaría que el preview quede obsoleto.

### 2. El payload HTTP será estructuralmente mínimo, exacto y específico para `SISCA_SIMULATED`

El request aceptará solo:
- `source`
- `external_request_id`
- `curp`
- `nss`
- `name`
- `email`
- `phone` opcional
- `postal_code` opcional

`source` deberá ser exactamente `SISCA_SIMULATED`. No se implementará todavía
un catálogo general de fuentes.

Reglas exactas:
- `source`: obligatorio, valor literal exacto `SISCA_SIMULATED`, sin variantes
  de casing ni espacios extra
- `external_request_id`: obligatorio, `strip`, no vacío tras `strip`,
  longitud `1..120`
- `curp`: obligatoria, conservar original en `original_payload`, `strip +
  uppercase` para dominio y columnas estructuradas, no vacía tras `strip`,
  máximo `18` después de normalización, sin validación oficial
- `nss`: obligatorio, texto, `strip`, no vacío, longitud `1..16`, conservar
  ceros iniciales, no convertir a número, sin validación oficial
- `name`: obligatorio, `strip`, no vacío, longitud `1..200`
- `email`: obligatorio, `strip`, validar estructura de correo en HTTP,
  longitud `3..254`
- `phone`: opcional, texto, `strip`, si existe no puede quedar vacío,
  longitud `1..32`
- `postal_code`: opcional, texto, `strip`, si existe no puede quedar vacío,
  longitud `1..16`
- campos extra: rechazados

Por qué:
- Respeta el modelo persistente vigente y evita truncamientos.
- Conserva NSS como texto con ceros iniciales.

Alternativas consideradas:
- Validar oficialmente CURP/NSS. Rechazada por estar fuera de alcance.
- Permitir fuentes libres desde ahora. Rechazada porque abriría un contrato no
  soportado por el cambio.

### 3. La aprobación será explícitamente simulada y acotada a este cambio

Solo para este cambio, un payload estructuralmente válido puede tratarse como
aprobado para probar el recorrido técnico end-to-end. Esta regla:
- no representa validación oficial de CURP
- no representa validación oficial de NSS
- no representa elegibilidad real
- no representa aprobación funcional definitiva
- no debe reutilizarse automáticamente cuando llegue el contrato real de SISCA

Por qué:
- Permite validar wiring, atomicidad e idempotencia sin inventar reglas reales.

Alternativas consideradas:
- Esperar al contrato real antes de habilitar el recorrido. Rechazada porque
  bloquea la prueba técnica del flujo completo.

### 4. El caso de uso será `ProcessSimulatedCustomerIntake`

Se define un caso de uso de aplicación con:
- comando plano con todos los campos del payload y `original_payload`
- resultado plano con `intake_request_id`, `customer_id`, `rewards_id`,
  `status` y `replayed`

Estados exitosos devueltos:
- `APPROVED`
- `ALREADY_ACTIVE`

Por qué:
- Aísla la semántica funcional del transporte.
- Permite probar idempotencia y atomicidad sin FastAPI ni SQLAlchemy.

Alternativas consideradas:
- Reutilizar `ProcessCustomerIntake` y su resultado actual. Rechazada porque el
  contrato actual es explícitamente provisional e insuficiente.

### 5. El flujo de nueva alta seguirá una sola unidad de trabajo

Secuencia de aplicación:
1. abrir UoW
2. buscar intake por `(source, external_request_id)`
3. si no existe, abrir savepoint e intentar crear intake nuevo en `RECEIVED`
4. mover intake a `PROCESSING`
5. buscar cliente por CURP normalizada
6. obtener servicio `AFORE` por `code`
7. si no existe cliente, generar Rewards ID y crear cliente dentro de un
   savepoint por intento; luego crear relación `AFORE`
8. si existe cliente con relación `AFORE`, asociar intake y marcar
   `ALREADY_ACTIVE`
9. asociar intake con cliente
10. actualizar estado final `APPROVED` o `ALREADY_ACTIVE`
11. commit único al final

Los repositorios pueden hacer `flush` para detectar constraints temprano. El
caso de uso no hará `commit` parcial.

Las transiciones `RECEIVED -> PROCESSING -> APPROVED` son lógicas internas
dentro de una sola unidad de trabajo. Debido al commit único:
- no se promete que otros procesos observen estados intermedios
- después del commit se observa solo el estado final
- si hay rollback, el intake nuevo no queda persistido

Estados finales requeridos:
- nueva alta exitosa:
  - intake `APPROVED`
  - customer `PENDING_ONBOARDING`
  - onboarding `PENDING`
  - customer_service `ACTIVE`
  - `processed_at` establecido en UTC
  - `processing_details = NULL`
- CURP existente con `AFORE` activo:
  - intake `ALREADY_ACTIVE`
  - `customer_id` del cliente existente
  - `processed_at` establecido en UTC
  - `processing_details = NULL`

Por qué:
- Asegura que no queden cliente, relación o intake aprobados a medias.

Alternativas consideradas:
- Crear primero cliente y luego intake. Rechazada porque rompe trazabilidad e
  idempotencia por clave externa.

### 6. Idempotencia por clave externa con replay estable y manejo concurrente

Si ya existe un intake para `(source, external_request_id)`:
- si está en `APPROVED` o `ALREADY_ACTIVE`, está asociado a cliente y el
  Rewards ID es recuperable, se devuelve el mismo resultado con
  `replayed = true`
- si el intake, `customer_id`, cliente o Rewards ID recuperable faltan o son
  incoherentes, el caso de uso falla con `SuccessfulIntakeInconsistency`
- en cualquier otro estado, el caso de uso falla con `ExternalRequestConflict`

Para concurrencia por clave externa:
- la unicidad de base de datos sigue siendo la defensa final
- el intento inicial de insertar el intake se ejecuta dentro de un savepoint
- si falla específicamente por duplicado de clave externa, se revierte solo el
  savepoint, se relee el intake ganador dentro de una transacción exterior
  todavía utilizable y se aplica replay o conflicto
- otros errores de integridad no se convierten en replay

Por qué:
- La idempotencia no puede descansar solo en el primer `SELECT`.
- El replay evita registros duplicados y evita re-invocar el generador.

Alternativas consideradas:
- Usar upsert opaco. Rechazada porque escondería la semántica de replay detrás
  de SQL y complicaría el aislamiento de puertos.

### 7. `ALREADY_ACTIVE` solo aplica si el cliente ya tiene relación `AFORE` ACTIVE

Si la clave externa es nueva pero la CURP ya pertenece a un cliente:
- se persiste un nuevo intake por trazabilidad
- se busca la relación del cliente con `AFORE`
- si la relación existe, se asocia el intake al cliente, el estado final es
  `ALREADY_ACTIVE`, se devuelve el Rewards ID existente y no se crea nada más
- si la relación no existe, o existe con estado `INACTIVE` o `ENDED`, el caso
  de uso falla con
  `CustomerServiceInconsistency`

Por qué:
- Evita reparar silenciosamente datos que el flujo no comprende.
- Mantiene el significado de `ALREADY_ACTIVE` ligado a una relación activa de
  servicio, no solo a la existencia del cliente.

Alternativas consideradas:
- Crear la relación `AFORE` faltante automáticamente. Rechazada por ocultar una
  inconsistencia interna.

### 8. El Rewards ID saldrá de un puerto explícito y no del repositorio

Se introduce `RewardsIdGenerator.generate() -> str`.

La implementación provisional generará:
- `RWD-` + `secrets.token_hex(16)`

Esto produce un identificador opaco, de 128 bits aleatorios, sin PII y
compatible con `VARCHAR(64)`.

El repositorio y el ORM no generarán Rewards IDs. La base de datos conserva la
garantía final de unicidad. Cada intento de creación de cliente se ejecutará en
un savepoint propio. El límite será de `3` intentos totales:
- identificador inicial
- hasta dos regeneraciones
- después `RewardsIdCollisionExhausted`

Por qué:
- Mantiene la responsabilidad en aplicación e infraestructura, no en
  persistencia.
- Permite pruebas deterministas del caso de uso.

Alternativas consideradas:
- Generar Rewards ID en ORM o migración. Rechazada porque mezclaría identidad de
  negocio con persistencia.

### 9. Las colisiones de Rewards ID y de CURP deben diferenciarse

La infraestructura de persistencia dejará de usar una excepción ambigua para
mezclar `curp` y `rewards_id`.

Se proponen errores diferenciados equivalentes a:
- `DuplicateCustomerCurpError`
- `DuplicateCustomerRewardsIdError`

El caso de uso:
- reintentará solo ante colisión de Rewards ID
- tratará duplicado de CURP como señal de carrera de identidad y no como
  colisión aleatoria de Rewards ID
- fallará con `RewardsIdCollisionExhausted` cuando se alcance el máximo de
  intentos

Para la carrera de CURP:
1. dos solicitudes con claves externas distintas no encuentran cliente al inicio
2. una creación gana
3. la otra falla por la constraint concreta de CURP dentro del savepoint
4. se revierte solo el savepoint
5. se relee el cliente ganador
6. se obtiene `AFORE`
7. se consulta la relación del cliente con `AFORE`
8. si la relación está `ACTIVE`, el intake perdedor termina `ALREADY_ACTIVE`
9. si la relación no existe o está `INACTIVE` o `ENDED`, se falla con
   `CustomerServiceInconsistency`

Por qué:
- El retry solo es correcto para Rewards ID.
- CURP duplicada significa que ya existe identidad de persona; no debe ocultarse
  como si fuera una simple colisión aleatoria.

Alternativas consideradas:
- Seguir capturando una sola excepción `DuplicateCustomerError`. Rechazada
  porque impide retries correctos y vuelve opaca la causa funcional.

### 10. Las operaciones esperadas sobre intake deben ser idempotentes o fallar explícitamente

Para este flujo, `associate_customer` y `update_status` no deben ignorar
silenciosamente un intake inexistente. Deben producir un error explícito
equivalente a `IntakeRequestNotFound`.

Semántica de asociación:
- intake sin cliente -> asignar
- intake ya asociado al mismo cliente -> éxito idempotente
- intake asociado a otro cliente -> `IntakeCustomerReassignmentError`
- intake inexistente -> `IntakeRequestNotFoundError`

Semántica de actualización de estado:
- intake inexistente -> error específico
- actualización al mismo estado -> operación idempotente
- `processed_at` se establece al alcanzar por primera vez `APPROVED` o
  `ALREADY_ACTIVE`
- repetir el mismo estado no sobrescribe `processed_at`
- `processing_details` queda `NULL` para `APPROVED` y `ALREADY_ACTIVE`
- la operación no reporta éxito si no actualizó el intake esperado

Por qué:
- El caso de uso espera que el intake exista dentro de la misma transacción.
- Ignorar el caso ocultaría corrupción lógica y permitiría commits engañosos.

Alternativas consideradas:
- Mantener `return` silencioso. Rechazada porque impide detectar fallos
  transaccionales reales.

### 11. `AFORE` se resuelve por código y su ausencia es error interno controlado

El caso de uso consultará `services.code == "AFORE"`. No dependerá de UUID fijo.
Si el servicio no existe, abortará con `ServiceNotFound`.

Por qué:
- Reutiliza la semilla determinística ya definida sin acoplar la aplicación a un
  identificador de migración.

Alternativas consideradas:
- Referenciar el UUID semillado desde aplicación. Rechazada porque acopla lógica
  funcional a un detalle de infraestructura.

### 12. La capa HTTP traducirá resultados y errores sin exponer detalles internos

Mapeo mínimo:
- `201 Created` para nueva alta `APPROVED`
- `200 OK` para replay idempotente o `ALREADY_ACTIVE`
- `409 Conflict` para `ExternalRequestConflict`
- `422 Unprocessable Content` para payload inválido estructuralmente
- `500 Internal Server Error` para `ServiceNotFound`,
  `CustomerServiceInconsistency`, `SuccessfulIntakeInconsistency`,
  `RewardsIdCollisionExhausted`, `IntakeMutationFailed` y fallos internos
  controlados

La respuesta solo devolverá:
- `intake_request_id`
- `customer_id`
- `rewards_id`
- `status`
- `replayed`

No expondrá `original_payload`, `processing_details`, CURP, NSS, email, teléfono
ni errores internos de base de datos.

Los errores usarán:
- código externo estable
- mensaje genérico
- sin PII
- sin SQL
- sin nombres de tablas
- sin nombres de constraints
- sin stack traces
- sin mensajes crudos de PostgreSQL o SQLAlchemy

### 13. La UoW debe ofrecer savepoints sin exponer `AsyncSession`

La aplicación necesita recuperación controlada ante:
- carrera de `(source, external_request_id)`
- colisión de Rewards ID
- carrera de CURP

La capacidad de savepoint deberá salir de la UoW o de una abstracción de
infraestructura consumible por aplicación, sin pasar `AsyncSession` al caso de
uso.

### 14. Cualquier fallo final antes del commit debe revertir la operación completa

Los savepoints solo recuperan intentos controlados. Cualquier fallo final antes
del commit de la transacción exterior debe provocar rollback completo de la
operación de intake simulado, incluyendo fallos:
- después de guardar intake
- después de crear cliente
- después de crear relación
- durante asociación
- durante actualización
- durante commit
- por agotamiento de colisiones
- por `AFORE` ausente
- por inconsistencia

## Risks / Trade-offs

- [Carreras concurrentes entre requests con la misma clave externa] → Releer el
  intake ganador cuando la unicidad DB rechace la inserción y encapsular el
  intento inicial en savepoint.
- [Colisiones repetidas de Rewards ID] → Reintentos acotados y error interno
  específico cuando se agoten tras tres intentos totales.
- [Inconsistencias heredadas de datos, como cliente sin `AFORE`] → Fallar con
  error explícito y no reparar silenciosamente.
- [Replay de intakes exitosos pero incoherentes] → Fallar con
  `SuccessfulIntakeInconsistency` y no reparar automáticamente.
- [Mayor cantidad de errores de aplicación y persistencia] → Mantenerlos
  específicos, clasificados por constraint concreta y centralizar su traducción
  HTTP.
- [El contrato HTTP sigue siendo provisional] → Documentar explícitamente que no
  representa todavía el contrato definitivo de SISCA.

## Migration Plan

1. Introducir el nuevo comando, resultado, puerto de Rewards ID y errores de
   aplicación.
2. Ajustar los contratos de persistencia para diferenciar unicidades y fallar
   explícitamente cuando el intake esperado no exista o no pueda mutarse.
3. Añadir soporte de savepoints a la UoW o a una abstracción equivalente sin
   exponer `AsyncSession`.
4. Implementar el nuevo caso de uso sobre la UoW SQLAlchemy existente.
5. Sustituir el wiring HTTP para usar `POST /api/v1/customers/intake` con
   persistencia real.
6. Documentar en OpenAPI que el endpoint es funcional pero provisional y que la
   aprobación es exclusivamente simulada para esta prueba técnica.
7. Retirar `/_preview` del router activo y actualizar pruebas HTTP.
8. Ejecutar pruebas unitarias, HTTP y PostgreSQL con `TEST_DATABASE_URL`.

Rollback:
- El rollback operativo consiste en volver a una versión anterior del código si
  fuera necesario.
- No requiere revertir esquema, borrar intakes, borrar clientes ni volver a
  exponer dos recorridos HTTP activos.

## Open Questions

- El único punto intencionalmente abierto es el formato comercial definitivo del
  Rewards ID; el cambio usa un formato técnico provisional `RWD-<hex>`.
