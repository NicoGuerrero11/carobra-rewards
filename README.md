# Carobra Rewards

Base técnica inicial del backend de Carobra Rewards. En esta etapa el repositorio prepara un monolito modular en Python listo para comenzar el desarrollo real del backend, sin implementar todavía reglas de negocio ni el flujo de alta desde SISCA.

## Stack actual

- Python 3.13
- FastAPI
- Pydantic Settings
- SQLAlchemy 2
- Alembic
- PostgreSQL sobre Neon
- asyncpg
- uv
- pytest
- Ruff
- Pyright
- GitHub Actions

## Requisitos

- Tener `uv` instalado
- Usar Python 3.13
- Definir variables de entorno en un archivo `.env` local

Neon es la base PostgreSQL principal. Docker no es requisito para la base de datos. No uses la base de producción para desarrollo o pruebas iniciales, y no uses datos personales reales.

## Instalación con uv

```bash
uv python install 3.13
uv sync --dev
```

## Configuración local

Crear `.env` a partir de `.env.example` y ajustar los valores locales:

```bash
cp .env.example .env
```

Variables iniciales:

- `APP_NAME`
- `APP_ENV` (`development`, `test`, `production`)
- `APP_DEBUG`
- `LOG_LEVEL`
- `DATABASE_URL`

`DATABASE_URL` debe venir de Neon y usar el dialecto async de SQLAlchemy, por ejemplo:

```text
postgresql+asyncpg://user:password@host/database?sslmode=require
```

Cada ambiente debe usar su propia conexión o aislamiento en Neon. La estrategia exacta de proyectos o branches en Neon queda pendiente.

## API en desarrollo

```bash
uv run uvicorn carobra_rewards.main:app --reload
```

La aplicación expone:

- `GET /health`
- OpenAPI en `/docs` y `/redoc` en desarrollo

## Verificaciones

Pruebas:

```bash
uv run pytest
```

Formato:

```bash
uv run ruff format .
uv run ruff format --check .
```

Lint:

```bash
uv run ruff check .
uv run ruff check . --fix
```

Tipos:

```bash
uv run pyright
```

## Alembic

Crear una migración:

```bash
uv run alembic revision --autogenerate -m "descripcion"
```

Aplicar migraciones:

```bash
uv run alembic upgrade head
```

Consultar estado actual:

```bash
uv run alembic current
uv run alembic history
```

Revertir de forma controlada:

```bash
uv run alembic downgrade -1
```

Las migraciones son la fuente reproducible del esquema. No modifiques Neon manualmente como flujo principal.

## Modelo de persistencia inicial de clientes

El repositorio ya incluye el primer slice persistente para `customer_intake`
bajo PostgreSQL:

- `customer_intake_requests` guarda la solicitud original sin crear clientes por
  sí misma, con `processing_status`, `processing_details` y `original_payload`.
- `customers` separa UUID técnico, `rewards_id`, CURP normalizada y NSS sin
  mezclar identidad con datos operativos de AFORE.
- `services` y `customer_services` modelan el catálogo y la relación
  cliente-servicio por separado.
- La migración inicial siembra `AFORE` de forma determinística.

Invariantes cerradas en esta versión:

- CURP estructurada usa `strip + uppercase`.
- `original_payload` conserva la representación recibida.
- CURP y NSS se tratan como campos no editables en flujos administrados por
  Rewards.
- `customers.rewards_id` y `customers.curp` son únicos.
- `customer_intake_requests(source, external_request_id)` y
  `customer_services(customer_id, service_id)` son únicos.
- Las llaves foráneas usan `ON DELETE RESTRICT`.

Las pruebas de integración PostgreSQL viven bajo
`tests/modules/customer_intake/test_postgres_persistence.py` y se ejecutan solo
si `TEST_DATABASE_URL` está configurada.

## Verificación de conexión a Neon

La validación de conectividad no corre en el conjunto unitario. Ejecuta:

```bash
uv run carobra-rewards-verify-neon
```

Si `DATABASE_URL` no está configurada, el comando falla con un mensaje claro. La verificación abre una conexión, ejecuta `SELECT 1` y cierra la sesión.

## Funcionalidad pendiente

El endpoint provisional `/api/v1/customers/intake` ya está implementado, usa
persistencia PostgreSQL y representa un flujo técnico y simulado. No constituye
todavía la integración definitiva con SISCA.

Todavía no están implementados:

- reglas de elegibilidad
- autenticación
- onboarding, campañas, puntos o recompensas
