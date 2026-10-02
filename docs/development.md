# Desarrollo local

Esta guía prepara las tres aplicaciones de [Carobra Rewards](../README.md)
contra una base de desarrollo. Ejecuta los comandos desde la raíz del
repositorio, salvo que el bloque indique entrar a una carpeta.

## Requisitos

- Python 3.13 y `uv`.
- Node.js 24 y pnpm 10.33.4 para el frontend; npm y el runtime habitual del BFF
  para `site-backend`, cuya configuración no cambia.
- Una base PostgreSQL de desarrollo, local o en Neon.
- Otra base PostgreSQL, independiente y destructible, si ejecutarás pruebas
  de integración.

No uses la base de producción ni datos personales reales. Las pruebas de
integración de la API bajan y recrean el esquema de `TEST_DATABASE_URL`.

## Instalar dependencias

```bash
cd api
uv python install 3.13
uv sync --dev --frozen
cd ..

cd site-backend
npm ci
cd ..

cd site-frontend
nvm install
nvm use
node scripts/install-clean.mjs
cd ..
```

El frontend fija Node 24 en `.nvmrc` y pnpm en `packageManager`; `.npmrc`
rechaza un runtime incompatible. Si usas otro gestor de Node, selecciona 24.x
y usa pnpm 10.33.4. Corepack debe estar disponible; no uses el pnpm global de
otra versión. El único lockfile del frontend es `pnpm-lock.yaml`. La instalación limpia
elimina sólo `site-frontend/node_modules` y usa Corepack con el lockfile
congelado; evita que paquetes npm antiguos interfieran con el empaquetado.

## Configurar el entorno

Si todavía no tienes archivos de entorno locales, copia las plantillas:

```bash
cp api/.env.example api/.env
cp site-backend/.env.example site-backend/.env
cp site-frontend/.env.example site-frontend/.env
```

Si ya existen, actualízalos sin sobrescribir su configuración. El archivo raíz
[`.env.example`](../.env.example) es sólo una referencia compartida.

Edita las variables antes de iniciar los servicios:

| Archivo | Configuración necesaria |
| --- | --- |
| `api/.env` | `DATABASE_URL` con formato `postgresql+asyncpg://…`; deja `SISCA_ADAPTER=simulated` para desarrollo |
| `site-backend/.env` | Descomenta `DATABASE_URL` y apunta a la **misma base** con formato `postgresql://…`; `API_BASE_URL=http://127.0.0.1:8000` |
| `site-frontend/.env` | `SITE_BACKEND_BASE_URL=http://127.0.0.1:3001` |

Sustituye las credenciales de ejemplo por las de tu base de desarrollo. Si no
usarás pruebas de integración, elimina o comenta `TEST_DATABASE_URL` en la
plantilla de la API. Si las usarás, configura una base distinta de
`DATABASE_URL` en ambos servicios, con el formato de URL correspondiente.

FastAPI y Astro leen su propio `.env`. El backend Node recibe las variables
del proceso: los comandos de esta guía las exportan desde `site-backend/.env`
usando una shell compatible con Bash o Zsh. Mantén ese archivo en formato de
asignaciones de shell y entrecomilla valores con caracteres especiales.

### Sesiones y conexiones

- `AUTH_SESSION_COOKIE_NAME` en API y `SESSION_COOKIE_NAME` en el backend deben
  coincidir; el valor predeterminado es `carobra_session`.
- En HTTP local usa `AUTH_SESSION_COOKIE_SECURE=false`,
  `SESSION_COOKIE_SECURE=false` y `SameSite=lax` en ambos servicios.
- Usa `127.0.0.1` de forma consistente para las URLs locales.
- La API acepta credenciales CORS sólo desde `CORS_ALLOWED_ORIGINS`, sin `*`.
  El navegador usa el proxy de Astro y no necesita llamar directamente a la API.

Deja las variables `BONDA_*_ENABLED=false` de la plantilla para trabajar sin
Bonda. Para consultar sus catálogos, sigue la
[guía de cupones](bonda-coupons-runbook.md) y el
[catálogo de cursos](bonda-courses-reconciliation.md). Sus credenciales
pertenecen al backend, nunca al frontend. La captura de enlaces de referido
requiere además `REFERRAL_IDENTITY_HMAC_SECRET` con al menos 32 bytes.

## Aplicar migraciones

Aplica primero las migraciones de identidad y después las de Rewards sobre la
misma base **de desarrollo**:

```bash
cd api
uv run alembic upgrade head
cd ..

cd site-backend
set -a
source .env
set +a
npm run db:migrate
cd ..
```

`db:migrate` compila el backend y aplica todas sus migraciones pendientes.
Para una base existente de producción, usa el procedimiento de
[publicación](production-site-release.md).

## Iniciar los servicios

Abre tres terminales en la raíz del repositorio e inicia los servicios en este
orden. Cada bloque corresponde a una terminal distinta.

**1. API**

```bash
cd api
uv run uvicorn carobra_rewards.main:app --reload --host 127.0.0.1 --port 8000
```

**2. Backend de Rewards**

```bash
cd site-backend
set -a
source .env
set +a
npm run build
npm start
```

**3. Frontend**

```bash
cd site-frontend
corepack pnpm run dev --host 127.0.0.1 --port 4321
```

| Servicio | URL | Uso |
| --- | --- | --- |
| Frontend | <http://127.0.0.1:4321> | Sitio público y portal |
| Backend de Rewards | <http://127.0.0.1:3001> | Servicio HTTP, sin página de inicio |
| API | <http://127.0.0.1:8000> | API de identidad y SISCA |
| OpenAPI | <http://127.0.0.1:8000/docs> | Contrato de la API en desarrollo |

Para comprobar que la API responde:

```bash
curl --fail http://127.0.0.1:8000/health
```

El navegador llama a `/api/v1` del frontend. Astro reenvía la solicitud al
backend, que delega identidad y SISCA a FastAPI y atiende los recursos de
Rewards. Ambos servicios acceden a PostgreSQL para sus respectivos dominios.

## Verificaciones

Cada bloque parte de la raíz y regresa a ella al terminar.

**API: formato, análisis estático y pruebas**

```bash
cd api
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest
cd ..
```

**Backend: tipos, pruebas y compilación**

```bash
cd site-backend
set -a
source .env
set +a
npm run check
npm test
cd ..
```

`npm test` compila antes de ejecutar las pruebas. Las pruebas que necesitan
PostgreSQL se omiten si no hay `TEST_DATABASE_URL`. Las del backend crean y
eliminan un esquema aislado; las de la API recrean el esquema de la base de
pruebas. Nunca apuntes esta variable a la base de uso normal.

**Frontend: tipos, contratos, compilación y navegador**

```bash
cd site-frontend
nvm use
corepack pnpm run check
corepack pnpm run test:contracts
corepack pnpm run test:runtime
corepack pnpm run build
corepack pnpm run test:ssr
corepack pnpm exec playwright install chromium
corepack pnpm run test:e2e
cd ..
```

La instalación de Chromium es necesaria la primera vez o después de actualizar
Playwright. La suite levanta un backend simulado en el puerto `3002` y Astro
en `4322`; deja ambos puertos libres. Ejecuta los flujos en escritorio y móvil.

Con los tres servicios reales iniciados contra una base segura, también puedes
ejecutar esta prueba del flujo completo:

```bash
cd site-frontend
SITE_URL=http://127.0.0.1:4321 corepack pnpm run test:smoke:live
cd ..
```

Este comando crea dos clientes de prueba y comprueba registro, login, estado y
cierre de sesión. El workflow actual de [CI](../.github/workflows/ci.yml) ejecuta
las verificaciones de la API y un job independiente del frontend con Node 24,
instalación congelada, contratos, guard del runtime, build y Playwright con mocks.
El build falla si Node real no es 24 o si alguna función Node generada no declara
`nodejs24.x`. Véase el [registro de migración](frontend-node24-migration.md).
