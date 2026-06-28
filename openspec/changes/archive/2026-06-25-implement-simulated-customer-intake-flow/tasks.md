## 1. Application Contracts

- [x] 1.1 Reemplazar el comando provisional de intake por un comando plano para `ProcessSimulatedCustomerIntake` con `source`, `external_request_id`, `curp`, `nss`, `name`, `email`, `phone`, `postal_code` y `original_payload`
- [x] 1.2 Reemplazar el resultado provisional por un resultado plano con `intake_request_id`, `customer_id`, `rewards_id`, `status` y `replayed`
- [x] 1.3 Definir los estados exitosos del caso de uso para `APPROVED` y `ALREADY_ACTIVE`
- [x] 1.4 Introducir el puerto `RewardsIdGenerator.generate() -> str` fuera de la capa HTTP y fuera del ORM
- [x] 1.5 Documentar en el contrato del caso de uso que la aprobación es exclusivamente simulada para este cambio y no reutilizable automáticamente para el contrato real de SISCA

## 2. Application Errors And Persistence Contracts

- [x] 2.1 Definir errores de aplicación explícitos para `ExternalRequestConflict`, `ServiceNotFound`, `CustomerServiceInconsistency`, `SuccessfulIntakeInconsistency`, `RewardsIdCollisionExhausted` e `IntakeMutationFailed`
- [x] 2.2 Definir errores contractuales de persistencia para `DuplicateExternalRequestError`, `DuplicateCustomerCurpError`, `DuplicateCustomerRewardsIdError`, `DuplicateCustomerServiceError`, `IntakeRequestNotFoundError`, `IntakeCustomerReassignmentError` y `UnexpectedPersistenceError`
- [x] 2.3 Separar en persistencia la unicidad de CURP y la unicidad de Rewards ID con errores diferenciados en lugar de una excepción ambigua
- [x] 2.4 Clasificar errores de persistencia por constraint concreta reportada por PostgreSQL y no por cualquier `IntegrityError`
- [x] 2.5 Ajustar `associate_customer` para que sea idempotente con el mismo cliente, falle por reasignación a cliente distinto y falle explícitamente cuando el intake esperado no exista
- [x] 2.6 Ajustar `update_status` para que falle explícitamente cuando el intake esperado no exista, sea idempotente al mismo estado y preserve `processed_at` en resultados exitosos
- [x] 2.7 Mantener `AsyncSession` y excepciones SQLAlchemy encapsuladas en infraestructura mientras la aplicación consume solo errores del módulo

## 3. Simulated Intake Use Case

- [x] 3.1 Implementar `ProcessSimulatedCustomerIntake` sobre la unidad de trabajo existente sin depender de FastAPI ni SQLAlchemy
- [x] 3.2 Implementar la secuencia atómica de nueva alta: buscar intake, crear intake `RECEIVED`, mover a `PROCESSING`, obtener `AFORE`, generar Rewards ID, crear cliente, crear relación, asociar intake, marcar `APPROVED` y confirmar al final
- [x] 3.3 Implementar replay idempotente para intakes `APPROVED` y `ALREADY_ACTIVE` sin crear registros ni reinvocar el generador
- [x] 3.4 Implementar conflicto funcional para claves externas existentes en estados no reutilizables
- [x] 3.5 Implementar `SuccessfulIntakeInconsistency` cuando un replay exitoso no pueda recuperar intake, customer_id, cliente o Rewards ID de forma coherente
- [x] 3.6 Implementar la rama `ALREADY_ACTIVE` para CURP existente con relación `AFORE` en estado `ACTIVE`
- [x] 3.7 Implementar fallo controlado para CURP existente sin relación `AFORE` o con relación `INACTIVE` o `ENDED`
- [x] 3.8 Implementar reintentos acotados ante colisión de Rewards ID con máximo de tres intentos totales y fallo controlado cuando se agoten
- [x] 3.9 Implementar `processed_at` en UTC y `processing_details = NULL` para resultados finales `APPROVED` y `ALREADY_ACTIVE`

## 4. Infrastructure Wiring

- [x] 4.1 Implementar el generador provisional de Rewards ID con formato `RWD-` + `secrets.token_hex(16)`
- [x] 4.2 Exponer savepoints desde la UoW o una abstracción de infraestructura sin filtrar `AsyncSession` a la aplicación
- [x] 4.3 Implementar savepoint para la carrera de `(source, external_request_id)` y releer el intake ganador solo ante duplicado externo concreto
- [x] 4.4 Implementar savepoint por intento de creación de cliente y Rewards ID para mantener utilizable la transacción exterior
- [x] 4.5 Implementar la consulta de relación cliente-servicio mediante `get_by_customer_and_service(customer_id, service_id)`
- [x] 4.6 Conectar el caso de uso a la unidad de trabajo SQLAlchemy real y dejar de usar la UoW en memoria para el endpoint funcional provisional
- [x] 4.7 Mantener la consulta de `AFORE` por `services.code` sin depender de UUID fijo
- [x] 4.8 Asegurar que `original_payload` se persista intacto mientras CURP se normaliza solo en columnas estructuradas

## 5. HTTP Contract

- [x] 5.1 Reemplazar `POST /api/v1/customers/intake/_preview` por `POST /api/v1/customers/intake`
- [x] 5.2 Definir schemas HTTP provisionales para el payload mínimo con `source = SISCA_SIMULATED`, validación exacta, rechazo de extras y límites alineados con persistencia
- [x] 5.3 Adaptar el request HTTP al comando de aplicación incluyendo una copia íntegra de `original_payload`
- [x] 5.4 Traducir resultados del caso de uso a la respuesta `{ intake_request_id, customer_id, rewards_id, status, replayed }`
- [x] 5.5 Traducir errores de aplicación a `201`, `200`, `409`, `422` y `500` sin exponer detalles de SQLAlchemy ni datos sensibles
- [x] 5.6 Documentar en OpenAPI que el endpoint es funcional pero provisional, acepta solo `SISCA_SIMULATED` y trata la validez estructural como aprobación exclusivamente simulada
- [x] 5.7 Eliminar el comportamiento alternativo activo del preview una vez que el nuevo flujo quede cableado

## 6. Unit And Architecture Tests

- [x] 6.1 Actualizar pruebas unitarias del caso de uso para la nueva alta completa y la respuesta con Rewards ID
- [x] 6.2 Agregar pruebas unitarias para validación exacta, `strip`, rechazo de vacíos y rechazo de extras
- [x] 6.3 Agregar pruebas unitarias para normalización de CURP, preservación de `original_payload` y conservación de NSS con ceros iniciales
- [x] 6.4 Agregar pruebas unitarias para estados finales correctos de intake, customer, onboarding y relación `AFORE`
- [x] 6.5 Agregar pruebas unitarias para replay idempotente de `APPROVED`
- [x] 6.6 Agregar pruebas unitarias para replay idempotente de `ALREADY_ACTIVE`
- [x] 6.7 Agregar pruebas unitarias para replay inconsistente de intake exitoso
- [x] 6.8 Agregar pruebas unitarias para conflicto por clave externa existente en estado incompatible
- [x] 6.9 Agregar pruebas unitarias para CURP existente con `AFORE ACTIVE` y para cliente existente sin `AFORE`, con `AFORE INACTIVE` o `AFORE ENDED` como inconsistencia
- [x] 6.10 Agregar pruebas unitarias para retry de colisión de Rewards ID y agotamiento de tres intentos
- [x] 6.11 Agregar pruebas unitarias para asociación idempotente con el mismo cliente y actualización de estado idempotente al mismo estado
- [x] 6.12 Mantener o ampliar las pruebas de arquitectura para asegurar que aplicación y dominio sigan independientes de FastAPI y SQLAlchemy

## 7. HTTP And PostgreSQL Integration Tests

- [x] 7.1 Reemplazar las pruebas del router preview por pruebas HTTP del endpoint `POST /api/v1/customers/intake`
- [x] 7.2 Agregar pruebas HTTP para `201 Created` en nueva alta y `200 OK` en replay o `ALREADY_ACTIVE`
- [x] 7.3 Agregar pruebas HTTP para `409 Conflict`, `422` por payload inválido y `500` por errores internos controlados
- [x] 7.4 Verificar por HTTP que la respuesta no exponga `original_payload`, `processing_details`, CURP, NSS, email o teléfono
- [x] 7.5 Agregar pruebas PostgreSQL del recorrido completo exitoso contra `TEST_DATABASE_URL`
- [x] 7.6 Agregar pruebas PostgreSQL para `processed_at` en UTC y `processing_details = NULL` en resultados exitosos
- [x] 7.7 Agregar pruebas PostgreSQL para relación `AFORE ACTIVE`, ausencia de duplicados y devolución del Rewards ID existente
- [x] 7.8 Agregar pruebas PostgreSQL para rollback total ante fallo después de una escritura intermedia
- [x] 7.9 Agregar pruebas PostgreSQL para ausencia del servicio `AFORE`
- [x] 7.10 Agregar pruebas PostgreSQL para carrera concurrente por clave externa usando savepoint y la unicidad real de la base
- [x] 7.11 Agregar pruebas PostgreSQL para carrera de CURP con claves externas distintas
- [x] 7.12 Confirmar explícitamente que SQLite no se usa para validar este recorrido persistente

## 8. Final Verification

- [x] 8.1 Ejecutar Ruff sobre el flujo actualizado y corregir hallazgos
- [x] 8.2 Ejecutar Pyright sobre el flujo actualizado y corregir problemas de tipado
- [x] 8.3 Ejecutar pytest para unidad, HTTP, arquitectura e integración PostgreSQL y resolver fallos
- [x] 8.4 Revisar que el endpoint funcional provisional, el caso de uso y la persistencia real reflejen exactamente la semántica cerrada en proposal, design y specs
