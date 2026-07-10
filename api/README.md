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
