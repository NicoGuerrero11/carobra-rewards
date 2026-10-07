# Gift cards y ficha de afiliado: preparación local

Fecha: 2026-10-07. Rama: `codex/bonda-gift-cards-preparation`, base `339f718`. Este documento reemplaza los pendientes anteriores sobre autorización por nivel dentro de Bonda: el usuario aclaró que Oro controla **visibilidad en Carobra**, no permisos externos.

## Resultado y reglas confirmadas

- Número de socio Rewards utiliza `user.rewardsId` / `customers.rewards_id` existente: nueve dígitos, grupos de tres, copia canónica sin espacios, confirmación accesible y fallback. Aparece en Inicio, Mi cuenta y junto al enlace Bonda. Identidades ausentes/legadas no se transforman ni regeneran; UUID y CURP no cambian.
- La sección se renderiza en Beneficios y en la ruta existente `/cliente/gift-cards` solo con journey canónico ACTIVE desde Oro (Oro/Platino/Titanio). Por debajo de Oro, con cuenta restringida o nivel no verificable, no existe en el HTML; no depende de CSS.
- Micrositio autorizado: `https://carobrarewards.bonda.com`, ID informado `913085`. El enlace abre otra pestaña sin ID, query, credenciales, autologin ni Referer. Un número faltante/legado mantiene el botón deshabilitado. El enlace no afirma que la cuenta externa esté activa; ante número no reconocido orienta a Ayuda. No depende del permiso de cupones ni de completar la ficha opcional.
- Catálogo completo sin techo por nivel; conversión informativa 3 puntos = $1 MXN. La ampliación posterior prepara acreditación 1:1 y lectura del saldo Bonda, descritas más abajo; no implementa un canje local ni saldo compartido.
- Al descender de Oro se oculta la sección en Carobra. No se revoca afiliación, borra ficha ni modifica segmentación en Bonda.

## Flujo en dos etapas autorizado

1. La primera afiliación requiere cliente ACTIVE y journey canónico ACTIVE en Bronce o superior, con Rewards ID coincidente. El registro por sí solo ya no afilia a un Invitado. POST conserva `{code: rewardsId, send_welcome_email: false}`; no manda CURP, nombre, apellido ni correo. Se preservan flags y recuperación existentes.
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
MOCK_SITE_BACKEND_PORT=3006 GIFT_CARD_PREVIEW=true BONDA_POINTS_PREVIEW=fresh node tests/support/mock-site-backend.mjs
SITE_BACKEND_BASE_URL=http://127.0.0.1:3006 node node_modules/astro/bin/astro.mjs dev --ignore-lock --host 127.0.0.1 --port 4326
```

Login local `http://127.0.0.1:4326/login`, fixture `eligible@example.com` / `correct-horse-7`; sección `/cliente/beneficios#gift-cards`. No usar credenciales reales. Skandia en 4325 permanece separado. La suite `node node_modules/@playwright/test/cli.js test --config playwright.gift-cards.config.ts` requiere 3006/4326 libres e intercepta el micrositio con una respuesta sintética, bloqueando otros destinos externos.

Verificaciones previas: build frontend Node 24, ocho contratos, 58 regresiones de Inicio/Mi cuenta/portal/Gift Cards; Brave nativo en Mac con portapapeles real `123456789`, y Chromium desktop/Pixel 5/320px, fallbacks, teclado y navegación. La corrección final de enlace/visibilidad repite build, contratos y ocho casos desktop/móvil con clics repetidos al destino interceptado.

Backend completo: **300 aprobadas, 7 omitidas** por requerir base externa. Persistencia tiene ocho pruebas con PostgreSQL WASM PGlite aislado: migración up/down, rollback de evento, reinicio desde disco, claims entre stores independientes, fencing de lease vencido, conciliación idempotente, nuevas generaciones durante envío, descenso/retorno y catch-up. No había daemon Docker/PostgreSQL nativo disponible; no se afirma validación multiproceso contra PostgreSQL nativo. Tras el ajuste de enlace, 29 pruebas backend específicas, ocho contratos frontend y ocho pruebas Chromium desktop/móvil aprobaron; build frontend y OpenSpec estricto también.

Sin migraciones reales, endpoints de clientes/Bonda, exportación de identidades, puntos, credenciales, push, PR o deploy. `GET portal` puede sincronizar en un entorno real; todas las navegaciones de esta tarea usan backend sintético. Archivos QA locales en `tmp/gift-card-access-qa`; no se incluyen en commit.


## Ajuste posterior: primera afiliación desde Bronce

El usuario confirmó que sus cinco cuentas por nivel están en **producción**. No se inspeccionaron, modificaron ni copiaron a fixtures. No hay cuentas externas nuevas ni autorización de pruebas reales.

`PostgresBondaAffiliateEligibility` lee estado del cliente, journey, nivel y Rewards ID de la base canónica. `BondaAffiliateProvisioningApplication` aplica esa condición común al registro, acceso de beneficios/affiliate-status y reintentos; sin fuente canónica falla cerrado. Se revalida después del claim y antes de POST si hubo consulta externa previa. El backfill filtra Bronce+ en SQL y también pasa por la misma guarda, por lo que una selección obsoleta no la salta. Una afiliación ACTIVE existente se conserva al descenso y no se vuelve a consultar/crear por repetición. No se añaden revocaciones ni restricciones externas por nivel.

La migración **028**, preparada y registrada pero no ejecutada en datos reales, crea captura de eventos de nivel/estado y una cola generacional sin perfil crudo. Captura predeterminada false. El worker acotado usa el aprovisionamiento base con claim existente; eventos recibidos durante un envío permanecen pendientes. No depende de SISCA: cualquier camino que actualice el journey canónico puede dispararlo, incluido otro producto activo. No se cambiaron reglas de niveles/puntos ni se creó un scheduler.

Modo nuevo en CLI existente: `npm run bonda:affiliates -- --mode events` informa cero operaciones sin `--apply` (como los otros modos, el CLI construye el pool configurado; no ejecutarlo contra producción). Con `--apply` aún exige bandera base y captura SQL habilitadas. No se ejecutó este modo contra una base configurada. Un ascenso en entorno activado permite afiliar mediante eventos; visitas y backfill siguen como recuperación, con el mismo umbral.

Validación del ajuste: TypeScript compiló; **309 pruebas aprobadas, 7 omitidas** por requerir PostgreSQL externo. Nueve nuevas pruebas: tres unitarias de guardas/reintentos/concurrencia y seis PGlite de SQL/eventos/backfill/transiciones/recuperación. Incluyen todos los niveles, estados no elegibles, identidad incoherente, rollback, afiliación única, enriquecimiento Oro+, descenso/retorno y pérdida de confirmación. Los escenarios Afore/PPR usan hechos sintéticos y el motor de nivel real, luego escriben la proyección canónica aislada; no prueban la comunicación con SISCA ni el pipeline de otro proveedor. El gateway HTTP conserva pruebas del payload mínimo. No se repitió navegador porque esta ampliación no cambia UI; sigue válida la QA visual anterior.

Antes de prueba conectada: entorno aislado acordado con Bonda, identidades sintéticas aceptadas, contrato PATCH/CURP textual y activación operativa específica. Un PR o las cuentas reales por nivel no reemplazan ese aislamiento. No se creó PR ni se hizo push/deploy.


Verificación al publicar PR #11: el primer CI encontró dos expectativas antiguas de portal (desktop/móvil) que aún esperaban la sección para Invitado/Bronce. Se actualizaron para comprobar ausencia de `#gift-cards`, manteniendo la navegación de la ruta. Los 14 casos locales de portal + gift cards aprobaron después de la corrección; el resto de los 304 casos de navegador del primer CI había aprobado.

## Acreditación y saldo Bonda preparados (ampliación de PR #11)

El alcance fue ampliado y autorizado a implementación, publicación en la misma rama/PR y seguimiento de CI. No autoriza merge, despliegue manual, secretos, migraciones reales ni operaciones contra Bonda. Las menciones anteriores a «sin push/PR» describen etapas anteriores. El sandbox de Bonda aún debe configurarse; las cinco cuentas productivas por nivel quedan excluidas.

**Unidades confirmadas:** 1 punto Rewards se acredita como 1 punto Bonda; 300 puntos se envían como `each_amount: 300`. La equivalencia comercial es 3 puntos = $1 MXN. Los puntos solo financian gift cards. Bonda será la autoridad del saldo gastable; Carobra conserva los premios, ledger y lotes de origen. El envío no crea un cargo local y la lectura del saldo no infiere compras ni resta puntos otra vez. Gastar no reduce el nivel.

### Contrato utilizado

Fuente: [API pública de puntos Bonda](https://documenter.getpostman.com/view/1928874/2sB2j7cUvC), revisada mediante su colección pública, sin consultar APIs operativas.

- Header `token`; base HTTPS y hosts permitidos de configuración. Credencial dedicada `BONDA_POINTS_TOKEN`.
- GET `/api/v2/microsite/{id}/affiliate-wallets/search?query={rewardsId}`: exige `success:true`, `data.code` exactamente igual al socio y lee `data.wallet.id`/`balance`, nunca `data.id`. Verifica email coincidente con la ficha canónica antes de acreditar.
- POST `/api/v2/microsite/{id}/wallets/{sourceWalletId}/movements`: un destinatario en `affiliate_wallet_ids`, `each_amount` entero positivo, `type:ASSIGNATION`, descripción sin identidad. Solo confirma respuesta COMPLETED individual con importe y wallet exactos, y code coincidente cuando se devuelve. No usa REST, transferencias de grupo ni conversión a pesos.
- GET de movimiento por ID se usa para revisión APPLIED y comprueba la misma wallet/importe/estado. No se atribuye un movimiento por delta de saldo.
- Límite técnico documentado: 10.000.000 puntos por movimiento. Una entrada superior queda en revisión; no es un techo comercial por nivel ni se fracciona automáticamente.
- Solo rechazos documentados de saldo insuficiente/ficha incompleta se reintentan automáticamente después de cinco minutos. Respuestas ambiguas, timeout, pérdida de confirmación local, importe/wallet diferentes o agregados requieren conciliación. No hay clave de idempotencia de cliente documentada: por ello **no se reenvía un POST incierto**.

### Persistencia y operación

Migración **029** preparada, registrada y probada solo en PGlite aislado. Crea cola única por entrada ISSUANCE positiva, leases con fencing, intención durable, movimiento externo único por micrositio/wallet, auditoría por operación y caché de saldo. El trigger local encola en la misma transacción del premio aun con envío apagado, para no perder ganancias anteriores a cumplir requisitos; nunca hace HTTP. No captura snapshots acumulados, no cambia reglas que otorgan premios, no aplica automáticamente un backfill histórico.

El procesador exige cliente/journey ACTIVE Oro+, afiliación ACTIVE con mismo Rewards ID, email canónico válido e igual al devuelto por Bonda y lote de origen intacto/no vencido. Relee elegibilidad luego del GET. Antes del umbral conserva pendientes; al cumplirlo procesa todo el backlog elegible por lotes acotados. Descensos conservan afiliación/saldo, ocultan el acceso y detienen nuevas acreditaciones. Un lote corregido/consumido/vencido antes del envío queda ACTION_REQUIRED.

`BONDA_POINTS_SEND_ENABLED=false` y `BONDA_POINTS_BALANCE_ENABLED=false` por defecto. No se configura token, wallet, scheduler ni captura de perfil para activar estas funciones. Envío requiere además `BONDA_POINTS_SOURCE_WALLET_ID`; lectura necesita credencial/micrositio con permiso de consulta. Preview local bloquea ambas capacidades. El runtime está conectado, pero ningún GET, inicio de servidor o clic despacha la cola.

CLI preparada `npm run bonda:points -- --mode process` (dry-run sin DB/HTTP). Los modos requieren `--apply` para operar:

- `process --limit 25`: procesa como máximo 100 entradas por ejecución, solo con bandera encendida.
- `enqueue-existing --acknowledge-uncredited --limit 100 [--after-entry-id UUID]`: catch-up explícito de todos los lotes históricos no vencidos, por saldo remanente y una vez por entrada. Antes de habilitarlo un operador debe verificar que esos puntos no se acreditaron ya externamente; repetir páginas hasta terminar. No ejecutar durante esta preparación.
- `inspect --entry-id UUID`: muestra estado/operationId/movementId sin ficha personal.
- `reconcile --entry-id UUID --operation-id UUID --outcome APPLIED|NOT_APPLIED --reviewer-id UUID --evidence-ref ticket/REFERENCE [--movement-id ID]`: APPLIED exige verificar el movimiento documentado; NOT_APPLIED exige evidencia autorizada de esa operación, no un 404 ni ausencia de diferencia de saldo. Una revisión obsoleta/contradictoria se rechaza.

### Consulta y UI

Journey/portal incluyen `points.bonda`: estado FRESH/STALE/UNAVAILABLE/DISABLED, saldo/fecha y montos pendientes/en revisión como strings, sin números redondeados. Caché durable por cliente/micrositio/identidad de 60 segundos y deduplicación de lecturas simultáneas por proceso. Un error conserva último dato con aviso y fecha; sin dato se muestra «—», nunca cero inventado. Una respuesta nueva de cero sí es saldo cero. Cambios al consumir en Bonda se reflejan al volver/recargar después de expirar caché; no hay push en tiempo real ni polling mientras la página queda abierta. Pendientes y revisión no se suman al saldo Bonda.

Inicio, Actividad y bloque Gift Cards muestran la consulta. Los valores previos del ledger se etiquetan «Puntos registrados en Carobra» para no presentarlos como otro saldo gastable. Actividad aclara que el historial es local; no fabrica compras externas. Al descender, Inicio/Actividad pueden seguir mostrando la wallet existente y no cambian el nivel.

### Reglas preservadas y dependencias concretas

El documento maestro revisado (presentación compartida en Slack el 28 de septiembre, título interno v3) define saldo completo para Bonda en MVP1, lotes de 18 meses, avisos 30/15/1 días y cashback del 5% posterior a consumir gift cards. [Fuente del documento maestro](https://carobrarewards.slack.com/archives/C0B5FUA1HM0/p1790639241040729). Los premios requieren validación según [aclaración operativa](https://carobrarewards.slack.com/archives/C0B5FUA1HM0/p1791305690763439).

La colección pública revisada documenta movimientos administrativos, **no** un contrato de compras, cashback, webhook, devolución de compra ni caducidad por lote externo. Esto no prueba que Bonda carezca de esas capacidades; falta acordarlas. La ampliación implementa acreditación y lectura, pero **no completa el ciclo de compras/cashback/caducidad**. No agrega premios de 5% ni descuentos REST por vencimiento ni conciliación automática por delta. El vencimiento local existente no demuestra vencimiento del saldo en Bonda. Antes de activar dinero/puntos reales se debe definir quién aplica expiración/cashback y cómo se correlacionan con compras/lotes sin duplicarlos.

Diferencia previa detectada: `expirationNotificationWindows` en `site-backend/src/rewards/operations/expiration-notifications.ts` es `[60,30]`, frente a 30/15/1 del maestro. No se alteró en esta ampliación. Debe corregirse y validarse en el trabajo de alineación de vencimientos. También siguen pendientes el contrato PATCH/CURP textual y configurar sandbox, identidades sintéticas y permisos de wallet Bonda.

### Evidencia de esta ampliación

Pruebas backend nuevas usan SQL real de la migración en PostgreSQL WASM PGlite y transporte HTTP inyectado: rollback/duplicado, pre-Oro, atraso completo, descenso durante lectura, correo/afiliación faltantes, lote vencido, 1:1, respuesta incierta, pérdida de confirmación, nuevo worker, claims vencidos, conciliación APPLIED/NOT_APPLIED, catch-up y caché/errores/cero. Se conserva la limitación: no PostgreSQL nativo multiproceso ni sandbox Bonda conectado.

Para regresión visual aislada: `node node_modules/@playwright/test/cli.js test --config playwright.points.config.ts` en frontend (Node 24), puertos 3008/4327 libres, Chromium desktop/Pixel 5, más checks 320px existentes. Agrega cuatro pruebas de saldo y ejecuta Inicio/Actividad/Gift Cards. Todos los destinos de la nueva suite están interceptados; no hay escrituras externas. La suite backend ahora también se ejecuta en CI con variables de DB vacías.

Resultado local final de la ampliación: **322 backend aprobadas / 7 omitidas**, **44 Chromium desktop/móvil aprobadas**, **8 contratos frontend**, **6 SSR**, build/tipos frontend y OpenSpec estricto correctos. Los primeros intentos de backend/SSR sin permiso de escucha fallaron por EPERM del sandbox; al permitir loopback pasaron. Las primeras regresiones de navegador detectaron una sobreescritura del fixture Actividad y un puerto fijo del test de cursos; corregidos y repetidos con 44/44. Logs locales: `/tmp/carobra-bonda-points-{backend,browser,frontend}.log`.
