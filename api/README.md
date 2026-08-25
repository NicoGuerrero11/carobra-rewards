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
uv run uvicorn carobra_rewards.main:app --reload --host 127.0.0.1 --port 8000
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
SISCA `PENDING` en una sola transacción. La integración SISCA real, puntos,
campañas, recompensas, redenciones y administración permanecen fuera de este
MVP. El intake anterior sigue deshabilitado y oculto de OpenAPI por defecto.
