# Registro de despliegue UAT de la API

## Decisión operativa

- Plataforma: Railway Pro, proyecto `demo rewards`, ambiente aislado `uat`.
- Servicio: `api-uat`, conectado a `NicoGuerrero11/carobra-rewards` en la rama
  `codex/sisca-uat-deploy`.
- Región y escala: `us-west2` (California), una réplica, límite de 0.5 vCPU y
  0.5 GB de memoria.
- Base de datos: PostgreSQL separado dentro del ambiente `uat`, conectado por
  red privada de Railway y con volumen persistente propio.
- URL HTTPS: `https://api-uat-uat-e9d1.up.railway.app`.
- Facturación: plan Railway Pro administrado por el equipo de Rewards; el
  propietario técnico revisará mensualmente el uso y las facturas con el equipo
  responsable del pago.
- Responsable técnico: Nicolás Guerrero. La aprobación de operadores para los
  checkpoints controlados sigue pendiente del equipo de Rewards.

## Configuración y secretos

- Las variables no sensibles se administran como variables del servicio.
- `DATABASE_URL` se compone mediante referencias privadas al servicio PostgreSQL;
  la contraseña no se copia al repositorio.
- El servicio está desplegado con `SISCA_ADAPTER=simulated` y
  `SISCA_UAT_CONTROL_ENABLED=false`.
- No se configuraron endpoint, API Key ni credenciales SISCA. Se agregarán sólo
  cuando SISCA entregue la especificación final, mediante variables secretas de
  Railway y sin incluirlas en código, logs ni evidencia.
- La conectividad hacia SISCA permanece cerrada por defecto. El modo HTTP exige
  HTTPS, host permitido explícito y secreto específico del ambiente UAT.

## Despliegue, monitoreo y reversión

- Railway construye `api/Dockerfile` y ejecuta `alembic upgrade head` antes de
  iniciar cada versión, conforme a `api/railway.toml`.
- Los cambios de la rama UAT producen un despliegue automático del mismo artefacto
  versionado que se promoverá a producción después de la aceptación UAT.
- Railway ejecuta el healthcheck `/health`, conserva logs de build/deploy y expone
  métricas del servicio. El dominio público se publica sólo por HTTPS.
- La reversión UAT consiste en volver al último despliegue exitoso y mantener
  `SISCA_ADAPTER=simulated` o deshabilitar `SISCA_UAT_CONTROL_ENABLED`; la base y
  la evidencia se conservan.
- PostgreSQL usa volumen persistente. Antes de iniciar los 100 casos se deberá
  verificar la política de respaldo/restauración disponible en Railway y tomar
  un respaldo operativo; antes de producción se definirá además retención y una
  prueba de restauración.

## Evidencia del 24 de agosto de 2026

- Despliegue activo: commit `0ef0319` (`Fix API Docker package build`).
- Migraciones aplicadas hasta `20260814_sisca_uat_audit`.
- Healthcheck interno de Railway: HTTP 200.
- Verificación externa: `/health`, `/docs` y `/openapi.json` respondieron HTTP 200.
- El contrato publicado contiene los endpoints de autenticación, estado de
  validación y checks SISCA internos/controlados.

## Pendientes externos y de habilitación

- Especificación SISCA definitiva: URL, path, método/body, nombre del header de
  API Key, catálogo de errores técnicos y criterio exacto de registro más actual.
- Confirmación de si SISCA exige allowlist de IP o algún requisito adicional de
  red. No se asumirá IP fija mientras SISCA no la solicite.
- Credencial exclusiva de SISCA y canal seguro de intercambio.
- Lista aprobada de operadores Rewards, token interno de operación y habilitación
  explícita de checkpoints controlados.
- Política de respaldo/restauración y alertas antes de ejecutar el piloto completo.
