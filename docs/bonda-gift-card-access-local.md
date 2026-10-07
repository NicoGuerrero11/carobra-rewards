# Gift cards y ficha de afiliado: preparación local

Fecha: 2026-10-07. Rama: `codex/bonda-gift-cards-preparation`, base `339f718`. Este documento reemplaza los pendientes anteriores sobre autorización por nivel dentro de Bonda: el usuario aclaró que Oro controla **visibilidad en Carobra**, no permisos externos.

## Resultado y reglas confirmadas

- Número de socio Rewards utiliza `user.rewardsId` / `customers.rewards_id` existente: nueve dígitos, grupos de tres, copia canónica sin espacios, confirmación accesible y fallback. Aparece en Inicio, Mi cuenta y junto al enlace Bonda. Identidades ausentes/legadas no se transforman ni regeneran; UUID y CURP no cambian.
- La sección se renderiza en Beneficios y en la ruta existente `/cliente/gift-cards` solo con journey canónico ACTIVE desde Oro (Oro/Platino/Titanio). Por debajo de Oro, con cuenta restringida o nivel no verificable, no existe en el HTML; no depende de CSS.
- Micrositio autorizado: `https://carobrarewards.bonda.com`, ID informado `913085`. El enlace abre otra pestaña sin ID, query, credenciales, autologin ni Referer. Un número faltante/legado mantiene el botón deshabilitado. El enlace no afirma que la cuenta externa esté activa; ante número no reconocido orienta a Ayuda. No depende del permiso de cupones ni de completar la ficha opcional.
- Catálogo completo sin techo por nivel; conversión informativa 3 puntos = $1 MXN. No hay saldo compartido, descuento inventado, transferencia ni canje implementado.
- Al descender de Oro se oculta la sección en Carobra. No se revoca afiliación, borra ficha ni modifica segmentación en Bonda.

## Flujo en dos etapas autorizado

1. El aprovisionamiento base existente conserva POST `{code: rewardsId, send_welcome_email: false}`. No manda CURP, nombre, apellido ni correo. Sus controles/flags y reconciliación existentes se preservan.
2. Al alcanzar Oro o superior, el enriquecimiento preparado carga ficha y nivel actuales del servidor, exige afiliación base ACTIVE coincidente y envía PATCH mínimo para email/nombre/apellido/curp. Antes de Oro los campos permanecen en Carobra. El usuario confirmó este disparador automático; está preparado pero **no activado**.
3. Cambios posteriores se comparan mediante HMAC por campo. Repetir un evento confirmado no repite la operación. El worker nunca crea afiliados ni interpreta una fila faltante/GET 404 como permiso para crearlos. La aplicación conserva un método de alta con ficha aislado para contratos/pruebas, sin consumidor en este flujo.

CURP está persistida como String(18), obligatoria y única, en `api/src/carobra_rewards/modules/customer_intake/infrastructure/persistence/models.py`. Se conserva textual. No se usa como code ni se convierte a entero.

## Contrato Bonda: confirmado y pendiente

Fuente pública revisada: [Bonda Nóminas V1](https://documenter.getpostman.com/view/1928874/TVetZjgf), colección pública enlazada desde la página. Se consultó documentación, no endpoints operativos.

POST exige code y admite slugs de Referencias al mismo nivel del JSON; por ello la captura identifica curp sin inventar un contenedor. PATCH debe enviar solo cambios y remite al ejecutivo para confirmar campos aceptados. Queda pendiente **confirmar aceptación de email, nombre, apellido y curp en PATCH para este micrositio, y que curp acepta texto de 18 caracteres**: la captura dice entero. Que los campos sean opcionales en POST no prueba ese contrato de actualización. `pendingAffiliateProfileContract` bloquea todo envío de ficha hasta resolverlo.

El flujo de primer ingreso informado es Número de socio y creación de contraseña en Bonda. No se verificó su mecanismo de titularidad/recuperación; el enlace no implementa ni promete SSO. Esto no impide preparar el enlace público ni agrega una exigencia de permiso gift-card externo por nivel.

GET no documenta devolución de todos los campos personalizados. DELETE afecta al afiliado completo; POST puede restaurar una baja mientras GET no la muestra. Por ello no se implementa reconciliación automática por ausencia ni se adivina un esquema de lectura.

## Persistencia, eventos y conciliación preparados

- Migración **027** registrada, sin ejecutar en una base real: tablas de control (captura apagada), cola por cliente con generaciones, checkpoints, leases y auditoría de conciliación. No almacena CURP/nombre/email crudos en la cola o checkpoints. Restricciones SQL aceptan solo HMAC hex de los cuatro campos.
- Triggers transaccionales observan cambios relevantes de cliente, nivel y afiliación base. Con `capture_enabled=false` regresan sin encolar. No hay HTTP ni datos personales en el evento. La generación evita perder cambios que llegan durante un envío.
- `PostgresAffiliateProfileSyncStore` reclama exclusión por cliente con token y vencimiento; un proceso cuyo lease expiró no puede escribir ni liberar el sucesor. Guarda intención antes del transporte. Identidad diferente no puede sobrescribir el code.
- Timeout, duplicado, respuesta inválida/error de negocio, miembro inesperado o pérdida de confirmación quedan en VERIFICATION_REQUIRED sin reenvío automático. Credenciales rechazadas quedan ACTION_REQUIRED.
- Conciliación explícita por operation ID, resultado APPLIED/NOT_APPLIED, UUID del revisor y referencia de evidencia sin PII. Transacción y auditoría única rechazan resultados contradictorios/obsoletos. APPLIED conserva los digests de la operación revisada; NOT_APPLIED autoriza nuevo intento. Ambos vuelven a encolar para comparar con la ficha actual. La evidencia debe confirmar esa operación completa; una respuesta GET genérica/404 no basta.
- Worker acotado (hasta 100) y catch-up paginado preparados. Lee estado actual antes de procesar; solo enriquece afiliados existentes confirmados desde Oro. Eventos bajo Oro no envían ni eliminan datos. La composición registra el runtime, sin ejecutarlo al iniciar servidor ni en un GET/clic.
- `BONDA_PROFILE_SYNC_ENABLED` por defecto false; contrato pendiente impide habilitarlo. Requiere clave HMAC dedicada de al menos 32 caracteres, aprovisionamiento base activo y preview apagado. No se creó/configuró ningún secreto. Captura SQL y worker tienen controles independientes apagados.

CLI `npm run bonda:profiles -- --mode process` es dry-run sin conexión. Modos process/enqueue/inspect/reconcile requieren `--apply` para actuar; process/enqueue siguen sin abrir DB con bandera apagada. Enqueue acepta `--limit` y `--after-customer-id`; inspect requiere `--customer-id`; reconcile exige además `--operation-id`, `--outcome`, `--evidence-ref`, `--reviewer-id`. No se ejecutaron modos apply contra datos reales. No hay nueva ruta de administración ni cron creado.

La activación operativa posterior requiere aprobar/aplicar migración, confirmar contrato, provisionar secreto, habilitar captura y procesador, definir su ejecución periódica y revisar tratamiento de identidades legadas. Son pasos de activación; la persistencia, conciliación y conexión apagada ya están implementadas. No se asume aplicada la migración numérica previa en producción.

## Vista previa y pruebas

Node 24, desde `site-frontend`, dos terminales:

```sh
MOCK_SITE_BACKEND_PORT=3006 GIFT_CARD_PREVIEW=true node tests/support/mock-site-backend.mjs
SITE_BACKEND_BASE_URL=http://127.0.0.1:3006 node node_modules/astro/bin/astro.mjs dev --ignore-lock --host 127.0.0.1 --port 4326
```

Login local `http://127.0.0.1:4326/login`, fixture `eligible@example.com` / `correct-horse-7`; sección `/cliente/beneficios#gift-cards`. No usar credenciales reales. Skandia en 4325 permanece separado. La suite `node node_modules/@playwright/test/cli.js test --config playwright.gift-cards.config.ts` requiere 3006/4326 libres e intercepta el micrositio con una respuesta sintética, bloqueando otros destinos externos.

Verificaciones previas: build frontend Node 24, ocho contratos, 58 regresiones de Inicio/Mi cuenta/portal/Gift Cards; Brave nativo en Mac con portapapeles real `123456789`, y Chromium desktop/Pixel 5/320px, fallbacks, teclado y navegación. La corrección final de enlace/visibilidad repite build, contratos y ocho casos desktop/móvil con clics repetidos al destino interceptado.

Backend completo: **300 aprobadas, 7 omitidas** por requerir base externa. Persistencia tiene ocho pruebas con PostgreSQL WASM PGlite aislado: migración up/down, rollback de evento, reinicio desde disco, claims entre stores independientes, fencing de lease vencido, conciliación idempotente, nuevas generaciones durante envío, descenso/retorno y catch-up. No había daemon Docker/PostgreSQL nativo disponible; no se afirma validación multiproceso contra PostgreSQL nativo. Tras el ajuste de enlace, 29 pruebas backend específicas, ocho contratos frontend y ocho pruebas Chromium desktop/móvil aprobaron; build frontend y OpenSpec estricto también.

Sin migraciones reales, endpoints de clientes/Bonda, exportación de identidades, puntos, credenciales, push, PR o deploy. `GET portal` puede sincronizar en un entorno real; todas las navegaciones de esta tarea usan backend sintético. Archivos QA locales en `tmp/gift-card-access-qa`; no se incluyen en commit.
