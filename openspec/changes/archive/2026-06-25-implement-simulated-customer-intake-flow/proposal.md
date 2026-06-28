## Why

Carobra Rewards ya tiene el modelo de persistencia inicial para intake, clientes,
servicios y relaciones, pero el comportamiento vigente todavía es un preview que
solo registra un intake `RECEIVED` sin ejecutar el alta simulada completa. Hace
falta cerrar ahora el primer recorrido funcional de punta a punta para validar
la conexión real entre HTTP, aplicación y PostgreSQL con idempotencia,
atomicidad, concurrencia y devolución del Rewards ID.

## What Changes

- Reemplazar el recorrido provisional `POST /api/v1/customers/intake/_preview`
  por un endpoint funcional provisional respaldado por persistencia real en
  `POST /api/v1/customers/intake`.
- Definir un payload estructural mínimo para `source`, `external_request_id`,
  `curp`, `nss`, `name`, `email`, `phone` opcional y `postal_code` opcional,
  aceptando únicamente `source = SISCA_SIMULATED` con reglas exactas de `strip`,
  vacíos y límites de longitud.
- Introducir un caso de uso de aplicación para procesar el alta simulada con
  una sola unidad de trabajo, crear cliente solo cuando corresponda, asociar el
  intake y devolver el Rewards ID.
- Declarar expresamente que, solo en este cambio, un payload estructuralmente
  válido puede tratarse como aprobado para probar el recorrido técnico, sin que
  eso represente validación oficial de CURP o NSS, elegibilidad real ni
  aprobación funcional definitiva.
- Definir la semántica funcional de nueva alta, replay idempotente por clave
  externa, replay inconsistente, y CURP existente con cliente ya vinculado a
  `AFORE` activo.
- Introducir un puerto explícito de generación de Rewards ID y una
  implementación provisional opaca basada en `RWD-` + `secrets.token_hex(16)`.
- Definir una estrategia de concurrencia apoyada en PostgreSQL mediante
  savepoints para la carrera de `(source, external_request_id)`, savepoints por
  intento de Rewards ID y resolución de carrera para CURP duplicada.
- Diferenciar errores de aplicación y de persistencia necesarios para
  distinguir conflicto por clave externa, ausencia de `AFORE`, inconsistencia
  de relación cliente-servicio, replay inconsistente, agotamiento de colisiones
  de Rewards ID, unicidad de CURP, unicidad de Rewards ID y fallos de mutación
  de intake.
- Ajustar los contratos de persistencia para que operaciones esperadas de
  asociación y cambio de estado sean idempotentes cuando corresponde y fallen
  explícitamente cuando el intake esperado no exista o no pueda mutarse.
- Persistir para nuevas altas exitosas y para `ALREADY_ACTIVE` un estado final
  con `processed_at` en UTC y `processing_details = NULL`.
- Cubrir el recorrido real con pruebas unitarias, HTTP y PostgreSQL usando
  `TEST_DATABASE_URL`, sin usar SQLite para validar la integración persistente.

## Capabilities

### New Capabilities
- `simulated-customer-intake-flow`: Flujo provisional end-to-end para altas
  simuladas que procesa intake válido, aplica aprobación exclusivamente
  simulada, usa persistencia real, maneja concurrencia y devuelve Rewards ID.

### Modified Capabilities
- `customer-persistence-model`: Ajusta contratos y garantías de persistencia
  para soportar el flujo atómico real con errores diferenciados por constraint,
  asociación idempotente, actualización de estado idempotente y fallos
  explícitos cuando una mutación esperada no encuentra el intake.

## Impact

- Afecta el módulo `customer_intake` en `api/`, `application/`, `ports/` e
  `infrastructure/persistence/`.
- Retira `/_preview` como ruta activa y lo reemplaza por un endpoint funcional
  provisional respaldado por persistencia real.
- Conecta el endpoint funcional a la unidad de trabajo SQLAlchemy existente y
  mantiene la UoW en memoria solo para pruebas unitarias.
- Introduce un nuevo puerto de infraestructura para Rewards IDs y nuevos errores
  de aplicación para traducción infraestructura -> aplicación -> HTTP.
- Amplía la cobertura de pruebas unitarias, HTTP y PostgreSQL para validar el
  recorrido completo, la idempotencia, la concurrencia, el rollback
  transaccional y la ausencia de exposición de datos sensibles.
