# Actualización del sitio y configuración Bonda

Esta entrega reúne el rediseño público y del portal, catálogo Bonda de consulta,
cursos/bienestar por nivel, progreso de videos y fecha de nacimiento en registro.
El PR se dirige a `main`; fusionarlo y desplegarlo son pasos posteriores.

## Destino de las variables

Las credenciales no viajan en Git. Se conservan en las variables privadas de cada
servicio. Los secretos de GitHub Actions no configuran Railway automáticamente.

| Servicio | Configuración que debe conservarse |
| --- | --- |
| Railway `rewards-api` | `DATABASE_URL` de producción, configuración SISCA existente, cookies seguras, orígenes autorizados y scheduler existentes |
| Railway `site-backend` | `DATABASE_URL` de la misma base con esquema `postgresql://`, `API_BASE_URL` de producción, host/puerto del servicio, cookies y `REFERRAL_IDENTITY_HMAC_SECRET` si ya se usa |
| Vercel `carobra-rewards`, entorno Production | `SITE_BACKEND_BASE_URL` apuntando al BFF de producción |

No sustituir las variables actuales con un `.env` local completo: contiene URLs
locales y configuración de desarrollo. No copiar `TEST_DATABASE_URL`, claves de
acceso de pruebas ni credenciales de Bonda al frontend.

## Bonda: importar solamente en `site-backend`

Copiar desde la configuración privada validada los valores de:

- `BONDA_BASE_URL`, `BONDA_ALLOWED_HOSTS`, `BONDA_ALLOWED_IMAGE_HOSTS`.
- `BONDA_MICROSITE_ID`, `BONDA_COUPON_API_KEY`, `BONDA_CATALOG_AFFILIATE_CODE`.
- `BONDA_REQUEST_TIMEOUT_MS`.
- `BONDA_AFFILIATE_TOKEN` solamente si existe un token específico aprobado. El
  diagnóstico de lectura actual usa la clave de cupones como alternativa cuando
  no hay token específico.

Configurar explícitamente:

```dotenv
BONDA_CATALOG_ENABLED=true
BONDA_COURSES_ENABLED=true
BONDA_AFFILIATE_PROVISIONING_ENABLED=false
BONDA_COUPON_REQUESTS_ENABLED=false
BONDA_LOCAL_PREVIEW_ENABLED=false
```

Guardar como variables del entorno de producción de Railway, preservando todas
las variables existentes ajenas a Bonda. La integración de esta entrega consulta
contenido; no autoriza altas de afiliados ni emisión de cupones.

## Secuencia de publicación

1. Confirmar acceso al proyecto y servicio de producción, variables anteriores y
   destino de la base. Revisar si guardar variables dispara un redespliegue.
2. Consultar `alembic_version` y `site_backend_migrations` en la base que usa
   realmente Railway. La revisión API esperada es
   `20260928_customer_birth_date`; el BFF incluye hasta
   `026_course_video_progress`. Aplicar sólo pendientes revisadas. El predeploy
   de `api/railway.toml` ejecuta `alembic upgrade head`.
3. Si está pendiente la migración de IDs numéricos, seguir primero
   [su procedimiento](numeric-rewards-id-runbook.md), incluyendo el inventario
   de afiliaciones externas. Para el BFF, `npm run db:migrate` aplica **todas**
   las migraciones pendientes; revisar esa lista antes de ejecutarlo.
4. Con las credenciales cargadas, desplegar API y BFF antes de promover el
   frontend. Verificar `/health` en API y que `/api/v1/me` en BFF responda
   `401` sin sesión; el BFF no expone un endpoint `/health`.
5. En el BFF ya actualizado, ejecutar `npm run bonda:check` con las variables
   de Railway. Debe devolver `ready: true` y cuatro comprobaciones `OK`.
   No imprime secretos ni escribe en Bonda.
6. Promover el frontend en Vercel y comprobar login, estado Invitado, catálogo
   por nivel, detalle de beneficios, cursos/bienestar y formulario de registro.
   Usar cuentas autorizadas y no emitir cupones para comprobar la conexión.

El frontend declara Node 20. Compilar con esa versión; el adaptador instalado
elige incorrectamente Node 18 al compilar localmente con Node 26. No subir una
compilación local realizada con ese fallback; usar el build del proveedor con
el runtime compatible y verificar el resultado del despliegue.

## Verificación del 28 de septiembre de 2026

- Las credenciales locales respondieron HTTP 200 en afiliado, cupones, cursos
  y bienestar; el diagnóstico devolvió `ready: true`.
- La base accesible mediante la configuración local de API tiene la revisión
  `20260928_customer_birth_date`, la columna `customers.birth_date` y todas las
  migraciones del BFF aplicadas. Se cotejaron el host y nombre de base con
  `DATABASE_URL` de Railway `site-backend`: corresponden al mismo destino.
- No se encontraron valores de los secretos locales configurados en los
  archivos versionados ni en el historial de commits de la entrega.
- BFF: 276 pruebas aprobadas y 7 omitidas por requerir infraestructura opcional.
  Frontend: 6 contratos aprobados; 292 pruebas de navegador aprobadas en la
  corrida completa y las 10 de elegibilidad aprobadas al actualizar sus
  comprobaciones al rediseño (8 de ellas fallaban por textos anteriores).
- El build con Node 20 terminó correctamente y generó `runtime: nodejs20.x`.
  Ruff y Pyright pasaron. CI de GitHub: 151 pruebas API aprobadas y 39 omitidas
  por no disponer de base de integración. La corrida remota en una base
  temporal aislada llegó a 161 pruebas aprobadas, pero falló después por DNS
  de Neon; no se considera una validación completa de integración. La base
  temporal y sus conexiones se eliminaron al finalizar.
- Se cargaron las 12 variables Bonda en Railway `site-backend`, entorno
  `production`, y se verificó que las 11 variables preexistentes no cambian.
  El responsable confirmó que aplicó las variables y reinició el BFF.
  Se verificaron las 23 variables en Railway y las respuestas públicas:
  API `/health` HTTP 200; BFF `/api/v1/me` HTTP 401 sin sesión.
  Estas comprobaciones no sustituyen el diagnóstico Bonda en el BFF actualizado
  después de publicar el código de esta entrega.
- GitGuardian reporta un posible `Generic Password` en
  `site-backend/src/rewards/courses/activities-gateway.ts:29`, commit `39389b5`.
  El incidente `37627936` resaltaba `url.port` después de `url.password` en
  una condición que rechaza URLs con credenciales o puertos no permitidos.
  No hay una contraseña literal. Se clasificó como `Not a secret (false
  positive)` en GitGuardian; el control permanece activo y el historial
  se conserva.

## Reversión

Ante un fallo del catálogo, apagar `BONDA_CATALOG_ENABLED` y
`BONDA_COURSES_ENABLED`, conservando las credenciales privadas y las banderas de
escritura apagadas. Revertir el despliegue de aplicación si es necesario;
conservar las tablas y el historial. No ejecutar downgrades destructivos como
parte de una reversión rutinaria.
