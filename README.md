# Carobra Rewards

Repositorio único del MVP de registro de clientes. Las tres aplicaciones viven
en carpetas independientes y FastAPI conserva la propiedad de autenticación,
clientes, consentimientos, sesiones y validaciones SISCA.

```text
carobra-rewards/
├── api/             # FastAPI, dominio, PostgreSQL, Alembic y pruebas Python
├── site-backend/    # BFF TypeScript/Node para el contrato web y las cookies
├── site-frontend/   # Sitio Astro para registro, login y estado del cliente
├── docs/            # Documentación compartida
└── openspec/        # Especificaciones y cambios
```

## Requisitos

- Python 3.13 y `uv`
- Node.js 20 y npm
- PostgreSQL/Neon para migraciones y pruebas de integración de la API

No uses la base de producción ni datos personales reales en desarrollo o
pruebas. `TEST_DATABASE_URL` debe apuntar a una base distinta de `DATABASE_URL`;
las pruebas de integración recrean su esquema.

## Configuración

Cada aplicación carga su propio archivo de entorno:

```bash
cp api/.env.example api/.env
cp site-backend/.env.example site-backend/.env
cp site-frontend/.env.example site-frontend/.env
```

El archivo raíz `.env.example` reúne las variables como referencia, pero los
comandos deben ejecutarse desde la carpeta de cada aplicación.

El nombre de cookie debe coincidir entre
`api/AUTH_SESSION_COOKIE_NAME` y
`site-backend/SESSION_COOKIE_NAME`. En HTTP local ambos servicios usan
`*_COOKIE_SECURE=false` y `SameSite=lax`. En producción HTTPS usa cookies
`Secure`; `SameSite=none` requiere `Secure=true` en el BFF.

FastAPI acepta credenciales CORS únicamente desde la lista explícita
`CORS_ALLOWED_ORIGINS`; el valor `*` está rechazado. El sitio normal no depende
de CORS porque el navegador llama rutas same-origin de Astro y Astro las
reenvía al BFF.

## Desarrollo local

Primero instala dependencias:

```bash
cd api
uv python install 3.13
uv sync --dev

cd ../site-backend
npm install

cd ../site-frontend
npm install
```

Después inicia cada servicio en una terminal distinta y en este orden:

```bash
cd api
uv run uvicorn carobra_rewards.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
cd site-backend
export REWARDS_V2_LIVE_FLOW_ENABLED=true
npm run build
npm start
```

```bash
cd site-frontend
npm run dev -- --host 127.0.0.1 --port 4321
```

URLs locales:

| Aplicación | URL | Uso |
| --- | --- | --- |
| Site frontend | `http://127.0.0.1:4321` | Registro, login y dashboard |
| Site backend | `http://127.0.0.1:3001` | BFF; no es una UI |
| API | `http://127.0.0.1:8000` | API de negocio |
| OpenAPI | `http://127.0.0.1:8000/docs` | Contrato HTTP en desarrollo |

El navegador llama rutas `/api/v1` del mismo origen del frontend. Una ruta SSR
de Astro las envía al BFF tanto en desarrollo como en producción, y el BFF
llama a FastAPI mediante `API_BASE_URL`.

## Migraciones y verificaciones

```bash
cd api
uv run alembic upgrade head
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest
```

```bash
cd site-backend
npm run check
npm test
npm run build
```

```bash
cd site-frontend
npm run check
npm run build
npm run test:e2e
```

Playwright levanta un BFF simulado y el frontend automáticamente. La suite corre
el flujo de registro/login/estado tanto en viewport de escritorio como móvil.
Con los tres servicios reales levantados contra una base segura también puedes
ejecutar `SITE_URL=http://127.0.0.1:4321 npm run test:smoke:live` desde
`site-frontend/`.

Consulta [api/README.md](api/README.md),
[site-backend/README.md](site-backend/README.md) y
[site-frontend/README.md](site-frontend/README.md) para el detalle de cada
aplicación.
