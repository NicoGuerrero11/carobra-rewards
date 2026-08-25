## Why

Rewards V2 ya es el único modelo de negocio vigente, pero el runtime todavía permite desactivar V2 y el portal conserva un fallback al modelo V1 que muestra reglas y saldos obsoletos, como la bonificación de 2,000 puntos. Debemos eliminar esa ambigüedad antes de continuar UAT y asegurar que `uat` y `main` ejecuten el mismo contrato V2, cada uno sobre su propio ambiente de datos.

## What Changes

- **BREAKING** Retirar los endpoints, fallbacks y banderas de ejecución que permiten seleccionar o presentar Rewards V1.
- Hacer obligatoria la creación idempotente del journey V2 `INVITED` al registrar un cliente y la transición V2 correspondiente al resolver SISCA.
- Hacer que el portal consulte y presente exclusivamente el resumen y portal V2; la ausencia de una proyección V2 se tratará como un estado de migración/error observable, nunca como autorización para volver a V1.
- Deshabilitar las reglas V1 para nuevas emisiones, conservando sus movimientos históricos como auditoría inmutable.
- Incorporar un backfill idempotente y reconciliable para crear journeys V2 faltantes a partir de clientes y evidencia SISCA existentes, sin duplicar premios.
- Aplicar el mismo código V2-only en las ramas `uat` y `main`, manteniendo Neon Testing y Neon Production separados por configuración de despliegue.

## Capabilities

### New Capabilities

- `rewards-v2-canonical-runtime`: Define V2 como el único contrato de ejecución, consulta y presentación de recompensas.
- `rewards-v2-legacy-migration`: Define la desactivación segura de V1 y la migración/reconciliación idempotente de clientes existentes hacia proyecciones V2.

### Modified Capabilities

- `customer-onboarding-auth`: El registro completado también debe establecer obligatoriamente el journey V2 invitado dentro del flujo canónico.
- `sisca-validation-lifecycle`: Las resoluciones SISCA deben sincronizar el journey, nivel y elegibilidad V2 sin depender de una bandera opcional.
- `site-application-architecture`: El frontend y el BFF deben exponer únicamente contratos Rewards V2 y no mantener rutas V1 como alternativa.

## Impact

- Backend del sitio: configuración, composición, registro, sincronización SISCA, rutas HTTP, reglas de puntos, migraciones y herramienta de backfill.
- Frontend: portal de recompensas, middleware y lista de rutas BFF permitidas.
- Neon Testing y Neon Production: nueva migración no destructiva, desactivación de reglas V1 para futuras emisiones y creación de proyecciones V2 faltantes.
- Railway/Vercel: `uat` y `main` compartirán el comportamiento V2-only; sólo cambiarán URLs, secretos y conexión Neon por ambiente.
- Compatibilidad: consumidores de `/api/v1/rewards/account` y `/api/v1/rewards/eligibility` deberán usar los contratos V2 de journey/portal.
