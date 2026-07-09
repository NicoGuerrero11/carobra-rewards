# Customer Intake API Proof Demo (histórica)

Esta evidencia corresponde al endpoint retirado y no representa el contrato
vigente. Solo puede ejecutarse con `--allow-legacy`; el runtime normal mantiene
`LEGACY_CUSTOMER_INTAKE_ENABLED=false`.

## 1. Proposito

Esta demo ejecuta varios escenarios reales contra `POST /api/v1/customers/intake`
para mostrar evidencia de que la API:

- responde con el contrato HTTP esperado
- persiste correctamente en PostgreSQL o Neon
- es idempotente
- rechaza conflictos y errores de validacion de forma controlada

## 2. Escenarios incluidos

1. `approved_new_customer`
   Resultado esperado: `201 APPROVED`
   Evidencia en Neon: `customer_intake_requests` + `customers` + `customer_services`

2. `approved_replay_same_external_request`
   Resultado esperado: primer request `201`, segundo request `200` con `replayed=true`
   Evidencia en Neon: sin duplicados para el mismo `external_request_id`

3. `already_active_existing_customer`
   Resultado esperado: `200 ALREADY_ACTIVE`
   Evidencia en Neon: nuevo intake asociado a un customer sintetico ya existente

4. `already_active_replay_same_external_request`
   Resultado esperado: dos respuestas `200`, la segunda con `replayed=true`
   Evidencia en Neon: un solo intake asociado al customer reutilizado

5. `identity_conflict_same_curp_different_nss`
   Resultado esperado: `409 curp_nss_conflict`
   Evidencia en Neon: intake persistido con `processing_status=IDENTITY_CONFLICT`

6. `identity_conflict_replay_same_external_request`
   Resultado esperado: dos respuestas `409` para la misma clave externa
   Evidencia en Neon: un solo intake persistido con el motivo original

7. `external_request_conflict_processing_state`
   Resultado esperado: `409 external_request_conflict`
   Evidencia en Neon: el intake preexistente en `PROCESSING` se conserva

8. `validation_error_bad_source`
   Resultado esperado: `422 validation_error`
   Evidencia en Neon: no se persiste ningun intake nuevo

9. `validation_error_missing_email`
   Resultado esperado: `422 validation_error`
   Evidencia en Neon: no se persiste ningun intake nuevo

10. `validation_error_extra_field`
    Resultado esperado: `422 validation_error`
    Evidencia en Neon: no se persiste ningun intake nuevo

11. `validation_error_invalid_email`
    Resultado esperado: `422 validation_error`
    Evidencia en Neon: no se persiste ningun intake nuevo

12. `seeded_not_approved_intake`
    Resultado esperado: intake sembrado en `NOT_APPROVED`
    Evidencia en Neon: intake sin customer ni `rewards_id`

13. `seeded_not_eligible_intake`
    Resultado esperado: intake sembrado en `NOT_ELIGIBLE`
    Evidencia en Neon: intake sin customer ni `rewards_id`

14. `seeded_eligibility_pending_intake`
    Resultado esperado: intake sembrado en `ELIGIBILITY_PENDING`
    Evidencia en Neon: intake sin customer ni `rewards_id`

15. `seeded_incomplete_intake`
    Resultado esperado: intake sembrado en `INCOMPLETE`
    Evidencia en Neon: intake sin customer ni `rewards_id`

## 3. Requisitos

- `APP_ENV=test`
- `TEST_DATABASE_URL` configurada
- la base de pruebas debe tener migraciones aplicadas
- dependencias instaladas en `.venv`

## 4. Comando

```bash
PYTHONPATH=src APP_ENV=test TEST_DATABASE_URL="<test_database_url>" DATABASE_URL="<otra_url_o_vacio>" .venv/bin/python scripts/demo_customer_intake.py --suite api-proof --keep-data
```

Usa `--keep-data` cuando quieras dejar la data sintetica visible en Neon. Si lo
omites, la demo limpia todo al final.

## 5. Que mostrar durante la demo

Para cada escenario, el script imprime:

- payload enviado
- status HTTP
- `X-Request-ID`
- body devuelto
- resumen de persistencia

## 6. Que revisar en Neon

### `customer_intake_requests`

Busca por `external_request_id` con prefijo `demo-`.

Debes ver:

- un intake `APPROVED`
- un intake `ALREADY_ACTIVE`
- un intake `IDENTITY_CONFLICT`
- un intake `PROCESSING` sembrado para demostrar `external_request_conflict`
- un intake `NOT_APPROVED`
- un intake `NOT_ELIGIBLE`
- un intake `ELIGIBILITY_PENDING`
- un intake `INCOMPLETE`

### `customers`

Debes ver:

- customers nuevos para los escenarios `APPROVED`
- customers sinteticos presembrados para `ALREADY_ACTIVE` y `IDENTITY_CONFLICT`

### `customer_services`

Debes ver relaciones `AFORE` en `ACTIVE` para los customers involucrados.

## 7. Guion corto para explicarla

- `approved_new_customer`: la API crea cliente, Rewards ID e intake completo.
- `approved_replay_same_external_request`: la API demuestra idempotencia y no duplica filas.
- `already_active_existing_customer`: la API reutiliza un customer activo ya existente.
- `already_active_replay_same_external_request`: la idempotencia también aplica cuando el resultado base es `ALREADY_ACTIVE`.
- `identity_conflict_same_curp_different_nss`: la API detecta una identidad inconsistente y deja rastro auditable.
- `identity_conflict_replay_same_external_request`: el conflicto queda fijado y no vuelve a crear intake.
- `external_request_conflict_processing_state`: una solicitud en proceso no puede reprocesarse.
- `validation_error_*`: la API rechaza payloads inválidos sin contaminar la base.
- `seeded_*`: datos sembrados para enseñar estados funcionales todavía no producidos automáticamente por la API actual.
