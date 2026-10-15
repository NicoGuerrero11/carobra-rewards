# Carobra Rewards API

FastAPI es la fuente de verdad para registro, contraseñas, sesiones, clientes,
consentimientos, Rewards ID, transacciones PostgreSQL y validaciones SISCA.
Todos los comandos de esta guía se ejecutan desde `api/`.

## Instalación y entorno

```bash
uv python install 3.13
uv sync --dev
cp .env.example .env
```

Variables principales:

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL/Neon del runtime |
| `TEST_DATABASE_URL` | Base aislada y destructible para integración/migraciones |
| `AUTH_SESSION_COOKIE_NAME` | Nombre de la cookie HTTP-only; debe coincidir con el BFF |
| `AUTH_SESSION_TTL_HOURS` | Duración de la sesión, 168 horas por defecto |
| `AUTH_SESSION_COOKIE_SECURE` | `false` en HTTP local; `true` bajo HTTPS |
| `AUTH_SESSION_COOKIE_SAME_SITE` | `lax` local; admite `strict` o `none` según despliegue |
| `AUTH_SESSION_COOKIE_DOMAIN` | Dominio opcional de la cookie en producción |
| `CORS_ALLOWED_ORIGINS` | Lista explícita de orígenes locales permitidos; nunca `*` con credenciales |
| `LEGACY_CUSTOMER_INTAKE_ENABLED` | Mantiene oculto el intake anterior por defecto |
| `SISCA_*` | Adaptador y configuración de validación SISCA |

`DATABASE_URL` y `TEST_DATABASE_URL` usan el dialecto async de SQLAlchemy, por
ejemplo `postgresql+asyncpg://...`. Nunca configures ambas con la misma base.

## Desarrollo

```bash
uv run alembic upgrade head
uv run uvicorn carobra_rewards.main:app --no-proxy-headers --reload --host 127.0.0.1 --port 8000
```

- API: `http://127.0.0.1:8000`
- OpenAPI: `http://127.0.0.1:8000/docs`
- Salud: `GET http://127.0.0.1:8000/health`

Endpoints canónicos del cliente:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`
- `GET /api/v1/me/validation-status`

El login emite una cookie HTTP-only. La API guarda únicamente el hash del token
de sesión y el hash de la contraseña; nunca devuelve ni persiste contraseñas en
texto plano o su confirmación.

### Fecha de nacimiento en el registro

`POST /api/v1/auth/register` acepta `birth_date` opcional, como fecha `YYYY-MM-DD`
(o `null`). Omitirla mantiene el comportamiento anterior. Se aceptan fechas reales
desde `1900-01-01` hasta el día actual en `America/Mexico_City`; no se aceptan
timestamps, fechas futuras ni valores numéricos. Un valor inválido devuelve
`422 invalid_birth_date` sin reflejar el dato enviado. Registro, login y `/me`
devuelven el valor en el perfil del propio cliente.

Se guarda en `customers.birth_date` como `DATE` nullable. Es un dato declarado por
el cliente: no escribe en `verified_birth_dates`, no genera puntos de cumpleaños
y no se incorpora a evidencia de SISCA, Bonda o decisiones de nivel.

Antes de iniciar esta versión de la API, aplicar la migración
`20260928_customer_birth_date` sobre `20260910_numeric_rewards_ids`, con autorización
del responsable de la base. Sólo agrega la columna, sin default ni backfill.
Para revertir código puede conservarse la columna; ejecutar su downgrade eliminaría
las fechas ya recopiladas y requiere aprobación independiente.

## Integración SISCA UAT

La API incluye un adaptador HTTP para SISCA. Para un ambiente UAT, configura
`SISCA_ADAPTER=http`, la URL y ruta confirmadas por SISCA, y carga los secretos
solamente mediante el gestor de secretos del despliegue. Usa
[`sisca-uat.env.example`](sisca-uat.env.example) como plantilla; no copies una
CURP sintética, token o credencial al repositorio.

Cuando SISCA haya permitido la conectividad y proporcionado una CURP sintética,
la verificación segura de salida se ejecuta con:

```bash
uv run python scripts/verify_sisca_uat.py
```

El comando imprime solo la clasificación de la respuesta, código HTTP y
`X-Request-Id`; no expone CURP, tokens ni cuerpos de respuesta. El contrato
confirmado usa `POST /afore/ws/ws_datos_por_curp.php`, autenticación mediante
`X-API-Key`, trazabilidad con `X-Rewards-Id` y `X-Request-Id`, y el sobre
`success/codigo/mensaje/data`. `SIN_INFORMACION` llega con HTTP 200. El registro
más reciente usa `tipo_movimiento=TRASPASO`, `estatus=Certificado` y fecha
`DD/MM/AAAA`. SISCA permite 60 solicitudes por minuto y reconsultas de una CURP.
Actualmente su servidor omite el intermedio público `RapidSSL TLS RSA CA G1` de
la cadena TLS. UAT carga la copia verificada incluida en `certs/` mediante
`SISCA_CA_BUNDLE_PATH`; la verificación de hostname, vigencia y raíz permanece
activa y nunca debe reemplazarse por `verify=false`.

### Railway UAT

El directorio contiene `Dockerfile` y `railway.toml`. Al crear el servicio
Railway, selecciona `api/` como directorio raíz y configura las variables en el
panel; el archivo ejecuta `alembic upgrade head` antes del despliegue y exige
que `/health` responda correctamente. Mantén `SISCA_ADAPTER=simulated` hasta
cargar el secreto UAT por el mecanismo seguro. Railway Pro hospeda el runtime;
la especificación final no exige una IP estática, VPN ni certificado de cliente.

Para las pruebas controladas, usa `APP_ENV=uat`, `SISCA_UAT_API_TOKEN` y
`SISCA_UAT_ALLOWED_HOSTS`; este último debe contener únicamente el host que
SISCA autorice, aunque sea su servicio operativo. El runtime ignora
`SISCA_API_TOKEN` en ese ambiente. `SISCA_AUTH_MODE`, `SISCA_API_KEY_HEADER` y
`SISCA_RESPONSE_FORMAT` permiten ajustar el adaptador sin mezclar secretos. Los
catálogos de movimiento y estatus también son configurables y fallan de forma
cerrada ante valores desconocidos.
Los checkpoints acelerados quedan apagados por defecto y requieren
`SISCA_UAT_CONTROL_ENABLED=true` más una lista de identificadores internos en
`SISCA_UAT_AUTHORIZED_OPERATORS`.

### Scheduler SISCA de producción

Producción debe configurar `SISCA_SCHEDULER_ENABLED=true`. La API consulta la
base cada `SISCA_SCHEDULER_POLL_SECONDS` (60 segundos por defecto), procesa como
máximo `SISCA_SCHEDULER_BATCH_SIZE` validaciones vencidas por ciclo y conserva
los vencimientos calculados desde el registro: H24 a 24 horas, D3 a 72 horas y
D5 a 120 horas. Un reinicio no pierde trabajo porque los vencimientos y la
idempotencia viven en PostgreSQL.

Los eventos seguros `sisca_validation_checkpoint_due`,
`sisca_scheduler_batch_completed` y `sisca_scheduler_iteration_failed` permiten
monitorear retrasos, volumen y fallos sin registrar CURP ni credenciales. Para
pausar la operación se cambia `SISCA_SCHEDULER_ENABLED=false` y se vuelve a
desplegar; las validaciones pendientes permanecen guardadas para el siguiente
arranque.

El navegador normal se comunica con el BFF mediante el proxy same-origin de
Astro. CORS queda restringido a `CORS_ALLOWED_ORIGINS` para pruebas o clientes
locales explícitos y rechaza configuraciones con origen comodín.

## Verificaciones

```bash
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest
```

Las pruebas que requieren PostgreSQL se omiten si `TEST_DATABASE_URL` no está
configurada. Cuando está presente, validan transacciones de registro, rollback,
autenticación, persistencia y migraciones. Esas pruebas bajan y recrean el
esquema de la base indicada.

## Alembic

```bash
uv run alembic current
uv run alembic history
uv run alembic upgrade head
uv run alembic downgrade -1
```

El esquema vigente separa `auth_users`, `auth_sessions`, `customers` y
`customer_consents`. `customers` guarda los campos de registro acordados y no
requiere ni conserva NSS.

## Alcance vigente

Rewards registra al cliente, guarda el consentimiento y crea una validación
SISCA `PENDING` en una sola transacción. Después del commit dispara una consulta
inicial y el scheduler productivo procesa H24, D3 y D5 cuando corresponda. El
intake anterior sigue deshabilitado y oculto de OpenAPI por defecto.


## Admisión de login y registro

La migración `20261014_auth_admission` agrega contadores temporales en PostgreSQL.
Todos los procesos y réplicas de la API deben usar la misma base y estos mismos
límites; el BFF no es la autoridad de admisión. Aplicar la migración antes de
habilitar esta versión. Si el almacenamiento falla, la API devuelve 503 y no
realiza el hash. Este cambio local no constituye autorización de despliegue.

| Variable | Valor inicial | Alcance |
| --- | ---: | --- |
| `AUTH_ADMISSION_WINDOW_SECONDS` | 60 | Ventana fija; rechazar no prolonga el vencimiento |
| `AUTH_LOGIN_ACCOUNT_LIMIT` | 10 | Email normalizado, login |
| `AUTH_REGISTER_ACCOUNT_LIMIT` | 5 | Email normalizado, registro |
| `AUTH_CONNECTION_LIMIT` | 240 | Conexión TCP compartida, login + registro |
| `AUTH_GLOBAL_LIMIT` | 300 | Toda la API, login + registro |
| `AUTH_HASH_WORKERS` | 2 | Hashes scrypt simultáneos por proceso |
| `AUTH_HASH_QUEUE_SIZE` | 8 | Hashes en espera por proceso |
| `AUTH_ADMISSION_TIMEOUT_SECONDS` | 4 | Adquisición/consulta de los contadores |
| `AUTH_HASH_TIMEOUT_SECONDS` | 2 | Cola + cálculo del hash |
| `AUTH_REQUEST_TIMEOUT_SECONDS` | 7 | Admisión + operación de login/registro |

El servidor debe arrancar con `--no-proxy-headers`, incluido al usar comandos
alternativos al Dockerfile. La clave de conexión es el peer TCP de ASGI, sin
puerto; **no es la IP del navegador**. Railway puede agrupar muchos usuarios en
un mismo proxy/BFF. `X-Forwarded-For`, `X-Real-IP` y `Forwarded` no se usan.
Antes de desplegar se debe verificar la cadena real de proxies y calibrar los
presupuestos según tráfico legítimo y capacidad, sin habilitar confianza amplia
en cabeceras. Cambiar réplicas o workers multiplica la capacidad de hashing local,
pero no el presupuesto global en PostgreSQL.

Se comprueban los tres presupuestos antes de consumirlos, dentro de una sola
transacción serializada. Si cuenta, conexión o global rechazan, no se consume
ninguno ni se crean claves de cuenta/conexión. Las peticiones admitidas sí consumen
los tres antes de autenticar, incluidas credenciales incorrectas, cuentas
inexistentes y registros duplicados. No se reembolsa una admisión ya confirmada
por cancelación posterior: el trabajo puede haber empezado. Cancelación o error
antes del commit revierten todos los consumos. Las respuestas 429 son
genéricas y llevan `Retry-After` y `Cache-Control: no-store`; el BFF, Astro y los
formularios preservan la espera. No se agrega información sobre existencia de
cuentas al 429. Los errores 409 preexistentes de registro conservan su contrato.
Los límites por cuenta pueden afectar temporalmente a la víctima de intentos
dirigidos; el vencimiento no se extiende por cada rechazo y no hay bloqueo
permanente, aunque un ataque sostenido puede agotar cada ventana siguiente.

Cada proceso admite hasta 16 operaciones concurrentes de contadores sin cola;
la adquisición/consulta tiene un presupuesto predeterminado de 4 segundos, con timeout de lock de
200 ms y de sentencia de 500 ms. Un bloqueo o error de DB falla cerrado con 503.
Las transacciones serializan el presupuesto global, confirman todos los consumos
juntos solo al admitir y limpian hasta 32 claves vencidas por intento admitido. El
presupuesto global limita las claves nuevas; no se almacenan identificadores
en claro. Los hashes SHA-256 de email no deben considerarse anonimización y las
filas vencidas restantes se eliminan al reanudarse el tráfico.

La admisión usa tres ejecuciones SQL: configurar timeouts locales, adquirir el
bloqueo global y decidir/consumir/limpiar conjuntamente. La decisión se ejecuta
**después** del bloqueo en otra sentencia para ver el commit de la réplica anterior
bajo READ COMMITTED. No se unen estas dos sentencias en un único snapshot. La
limpieza excluye las tres claves actuales para no modificar una fila dos veces en
los CTE de escritura. El plazo incluye inicialización del driver, preparación de
sentencias y commit; tres ejecuciones no equivalen a solo tres viajes de red.

Las fallas de persistencia en login/registro registran `auth_failure` con etapa,
categoría (`timeout`, `sql`, `ssl`, `connection` o `persistence`) y duración. No se
registran mensajes de excepción, traceback, SQL, parámetros, cuentas, tokens ni
URLs. Los rechazos de cuota conservan 429 y las fallas de persistencia, 503.

Scrypt conserva sus parámetros y formatos. El trabajo corre fuera del event
loop; cancelar o agotar la espera no libera capacidad hasta que la tarea sale
realmente del ejecutor. Una tarea abandonada aún en cola se omite al extraerla.
No se mantiene una conexión DB mientras se verifica la contraseña. Las cuentas
inexistentes usan un verificador ficticio con el mismo costo actual.


### Plazos coordinados y límites de la protección

La API valida al arrancar que `AUTH_REQUEST_TIMEOUT_SECONDS` deje al menos 0.5 s
sobre la suma de admisión y cola/hash. Sus valores iniciales son 7 > 4 + 2 + 0.5 s;
el vencimiento del plazo de la operación devuelve 429 genérico con Retry-After.
Los errores o timeouts propios del almacén siguen devolviendo 503. La cancelación
no interrumpe un scrypt en ejecución ni libera su slot antes de finalizar.

El BFF usa un timeout exclusivo para login/registro: `AUTH_REQUEST_TIMEOUT_MS=9000`.
`AUTH_API_RESPONSE_BUDGET_MS=7000` debe coincidir con el plazo API en milisegundos.
El BFF exige al menos 1000 ms de margen; los defaults dejan 2000 ms para transporte
y entrega de respuesta. Límites superiores: API 10 s, BFF 15 s. No hay validación
automática entre servicios: los valores deben coordinarse al desplegar. El timeout
API general del BFF (`API_REQUEST_TIMEOUT_MS`, 5000 por defecto) se mantiene para
otras rutas. Un transporte que no entrega respuesta dentro del plazo BFF devuelve
503, sin inventar Retry-After. Estos márgenes no garantizan un SLA ante una red
arbitrariamente lenta, event loop saturado o cancelación lenta del driver.

Orden recomendado, sujeto a autorización de despliegue: BFF/UI compatibles con 429
y timeout de auth coordinado; migración aditiva; API con los presupuestos iguales
en todas sus réplicas. No bajar el plazo BFF ni retirar la tabla mientras haya
instancias que dependan de ellos. Una respuesta perdida cerca del commit no prueba
que el registro o la sesión no se hayan persistido; no se implementa reintento automático.

La corrección de latencia no agrega migraciones. Antes de desplegarla, revisar las
sobrescrituras explícitas de estos plazos: una API que conserve 4 s junto con la
nueva admisión predeterminada de 4 s rechazará su configuración al arrancar. El
BFF debe aceptar el nuevo presupuesto antes de ampliar el plazo de la API. El
bloqueo sigue siendo la misma fila global, compatible con las réplicas anteriores.
El upsert de bloqueo no cambia sus contadores, pero escribe una versión de fila
incluso al rechazar; conserva por tanto costo de WAL y contención.

El presupuesto global protege trabajo admitido, no es un control total de DoS.
Ataques distribuidos entre cuentas/conexiones todavía pueden agotarlo; todos los
usuarios detrás de un proxy comparten el límite de conexión. Los rechazos tampoco
son gratis para PostgreSQL: persisten los 16 slots locales y los timeouts acotados,
pero hace falta calibración con métricas y controles de entrada confiables. Las
ventanas fijas permiten ráfagas; la cola acotada puede rechazar antes del cupo/minuto.

Prueba HTTP entre ambos servicios, solo en entorno local y tras compilar el BFF:
`AUTH_TEST_NODE=/ruta/a/node PYTHONDONTWRITEBYTECODE=1 uv run pytest tests/api/v1/auth/test_bff_deadlines.py`.
Usa sockets loopback, un hash sintético bloqueado y transporte controlado; no
requiere credenciales ni consultas externas. Sin AUTH_TEST_NODE se omite explícitamente.

### TLS PostgreSQL de runtime y migraciones

`create_database_engine` aplica la misma política a runtime, Alembic, scripts de
demo y pruebas PostgreSQL. Por defecto crea un `SSLContext` con las raíces estándar
del runtime, `CERT_REQUIRED` y `check_hostname=True`. `require`, `verify-ca`, `true`
y `1` se refuerzan a verificación completa; declarar `sslmode=verify-full` expresa
la política prevista. No hay fallback a texto plano ni certificados sin verificar.
Solo se permite `sslmode=disable` (o `ssl=false`/`0`) explícito para las IP literales
`127.0.0.1` y `::1`; incluso `localhost` requiere TLS salvo que se use su IP literal.
Las pruebas aisladas PostgreSQL sin TLS deben especificar esa excepción.

La URL solo admite `sslmode`/`ssl`, `channel_binding` y
`prepared_statement_cache_size`. Rechaza parámetros desconocidos/duplicados,
modos incompatibles, sockets Unix, hosts vacíos, sobrescrituras `host`/`port`,
`dsn`, rutas de certificados y `direct_tls`; los argumentos explícitos de conexión
transportan el contexto TLS al controlador SQLAlchemy/asyncpg.

asyncpg 0.30 no implementa channel binding: `channel_binding=require` se rechaza
antes de conectar. `prefer` y `disable` se aceptan como binding opcional no
implementado, manteniendo siempre la verificación TLS. No se afirma que haya
SCRAM-SHA-256-PLUS. Node puede usarlo de forma opcional, pero tampoco exige binding.

**Configuración elegida para desplegar (plantilla sanitizada):**

```text
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@DB_HOST:5432/DB_NAME?sslmode=verify-full
```

`USER`, `PASSWORD`, `DB_HOST` y `DB_NAME` son marcadores. Conservar las credenciales,
el hostname DNS real, el puerto y la base de este servicio; sustituir la query
reportada `sslmode=require&channel_binding=require` por exactamente
`sslmode=verify-full`, sin parámetro de binding. No se cambia de controlador.
`channel_binding=require` sigue siendo un error explícito. Node usa
`sslmode=verify-full&channel_binding=prefer`, con binding únicamente opcional.

Antes de un despliegue autorizado por separado, confirmar hostname y raíces del
runtime y coordinar el cambio de variable con la publicación del código corregido.
La query por sí sola no acredita esta política TLS en la versión anterior.
Mantener los pasos de migración y timeouts de autenticación ya documentados. Este
parche no cambia variables de Railway/Neon ni despliega código.
Si se necesita una CA privada adicional, configurar `SSL_CERT_FILE` con un bundle
revisado que incluya las raíces necesarias; no desactivar verificación ni instalar
confianza global. No se ha probado una conexión real a Neon.

`tests/test_database_tls.py` requiere OpenSSL y usa certificados temporales y un
servidor exclusivamente local. Prueba aceptación válida y rechazo de CA desconocida,
caducidad, identidad incorrecta y rechazo de TLS antes de enviar usuario/contraseña.
