# Customer Intake Demo Walkthrough

## 1. Proposito de la demo

Esta demo tecnica recorre el alta provisional SISCA -> Rewards usando el endpoint HTTP real y PostgreSQL real de pruebas, con limpieza segura al finalizar.

## 2. Que demuestra

- Solicitud sintetica valida para el contrato HTTP actual.
- Validacion por el schema HTTP real y el endpoint real `POST /api/v1/customers/intake`.
- Procesamiento por la aplicacion real creada con `create_application()`.
- Uso de `ASGITransport`, router real, middleware de trazabilidad, caso de uso real, `SqlAlchemyCustomerIntakeUnitOfWork`, repositorios SQLAlchemy y PostgreSQL.
- Respuesta `201 APPROVED` con `X-Request-ID`, `intake_request_id`, `customer_id` y `rewards_id`.
- Persistencia de intake, customer y relacion AFORE.
- Verificacion de no duplicados acotada a la ejecucion.
- Limpieza segura de los registros sinteticos creados.

## 3. Que no demuestra

- No demuestra elegibilidad real.
- No ejecuta onboarding.
- No envia el Rewards ID a SISCA.
- No valida integraciones externas reales.
- No debe ejecutarse contra produccion.

La aprobacion es simulada. Esta demo es una demo tecnica del flujo provisional.

## 4. Requisitos

- `APP_ENV=test`.
- `TEST_DATABASE_URL` configurada.
- `TEST_DATABASE_URL` debe apuntar a PostgreSQL.
- `DATABASE_URL`, si existe, debe ser distinta de `TEST_DATABASE_URL`.
- La base de pruebas debe tener las migraciones ya aplicadas.
- Dependencias instaladas en `.venv`.

## 5. Protecciones de seguridad

- Rechaza la ejecucion si falta `TEST_DATABASE_URL`.
- Rechaza la ejecucion si `APP_ENV` no es exactamente `test`.
- Rechaza la ejecucion si `DATABASE_URL == TEST_DATABASE_URL`.
- Rechaza configuraciones identificadas como productivas.
- Reconfigura la app para usar exclusivamente `TEST_DATABASE_URL`.
- Nunca imprime la URL completa ni credenciales.
- La limpieza se limita a los IDs creados por esa ejecucion.

## 6. Comando exacto para ejecucion normal

```bash
PYTHONPATH=src APP_ENV=test TEST_DATABASE_URL="<test_database_url>" DATABASE_URL="<otra_url_o_vacio>" .venv/bin/python scripts/demo_customer_intake.py
```

## 7. Comando con `--keep-data`

```bash
PYTHONPATH=src APP_ENV=test TEST_DATABASE_URL="<test_database_url>" DATABASE_URL="<otra_url_o_vacio>" .venv/bin/python scripts/demo_customer_intake.py --keep-data
```

## 8. Explicacion de cada paso mostrado

- `Paso 1. Entorno`: confirma ambiente no productivo y base de prueba confirmada, sin mostrar secretos.
- `Paso 2. Solicitud`: imprime el JSON sintetico enviado.
- `Paso 3. Validacion y procesamiento`: valida el payload con el schema real y lo envia por `AsyncClient` + `ASGITransport` al endpoint real.
- `Paso 4. Persistencia`: inspecciona intake, customer y relacion AFORE con SQLAlchemy contra PostgreSQL.
- `Paso 5. No duplicados`: verifica conteos limitados a los identificadores unicos de esa ejecucion.
- `Paso 6. Limpieza`: elimina por defecto solo los registros creados por la demo y confirma que no quedaron residuos.

## 9. Resultado esperado

- HTTP `201`.
- Header `X-Request-ID` con UUID valido.
- Body con `status=APPROVED` y `replayed=false`.
- `rewards_id` con el formato actual `RWD-<32 hex>`.
- Intake persistido en `APPROVED`.
- Customer persistido en `PENDING_ONBOARDING` y `PENDING`.
- Relacion AFORE persistida en `ACTIVE`.
- Mensaje final `DEMO COMPLETADA`.

## 10. Forma de confirmar la persistencia

Durante `Paso 4` el script consulta y resume:

- `customer_intake_requests`
- `customers`
- `customer_services`
- `services`

La inspeccion confirma coherencia de IDs, estado del intake, presencia de `processed_at`, coincidencia del `original_payload` y coherencia del `Rewards ID`, sin imprimir CURP, NSS, email, telefono ni `original_payload` completo.

## 11. Comportamiento de limpieza

- Sin `--keep-data`, la limpieza corre por defecto y tambien se intenta desde `finally` si ya hubo creacion de registros.
- El borrado ocurre en orden compatible con claves foraneas: relacion, intake, customer.
- Solo borra IDs creados por la propia ejecucion.
- Con `--keep-data`, conserva datos sinteticos y muestra los IDs necesarios para limpieza posterior.

## 12. Resolucion breve de errores comunes

- `TEST_DATABASE_URL es obligatorio`: exporta `TEST_DATABASE_URL`.
- `APP_ENV debe ser exactamente 'test'`: ajusta `APP_ENV=test`.
- `DATABASE_URL y TEST_DATABASE_URL no pueden apuntar a la misma base`: usa una URL primaria distinta o vacia.
- `TEST_DATABASE_URL fue identificada como configuracion potencialmente productiva`: revisa host, nombre de base o credenciales para eliminar referencias productivas.
- `Se esperaba HTTP 201`: revisa que la base de pruebas tenga migraciones aplicadas y que el servicio `AFORE` exista.

## 13. Evidencia de ejecucion

- Fecha: 2026-06-28
- Comando: `PYTHONPATH=src APP_ENV=test TEST_DATABASE_URL="<configured>" DATABASE_URL="" .venv/bin/python scripts/demo_customer_intake.py`
- HTTP obtenido: `201`
- Estados comprobados: `status=APPROVED`, `replayed=false`, `X-Request-ID` valido, `intake_request_id` valido, `customer_id` valido, `rewards_id` con formato `RWD-<32 hex>`, intake `APPROVED`, customer `PENDING_ONBOARDING`, onboarding `PENDING`, relacion `AFORE ACTIVE`, conteos `1/1/1` limitados a la ejecucion
- Limpieza confirmada: registros creados eliminados y conteos posteriores `0/0/0`
- Resultado: `PASS`
