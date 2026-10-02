# Migración del frontend a Node 24

**Fecha:** 2 de octubre de 2026. **Estado:** implementada y validada localmente;
despliegue pendiente de autorización. Rama `codex/frontend-node24`, desde
`main` / `7e6ab33afb08a7b51b3fe1683300d0934e504694`. No se mezcló `uat`.

## Versiones y decisión

| Componente | Versión validada |
| --- | --- |
| Node.js | 24.21.0; política del proyecto `24.x` |
| pnpm | 10.33.4, fijado en `packageManager` y resuelto con Corepack |
| Astro | 7.3.5 |
| Adaptador Vercel | 11.0.11; peer `astro: ^7.0.0` |
| Tipos Node | 24.19.1 |
| Tailwind | 3.4.19, conservando configuración y CSS existentes |
| Autoprefixer / PostCSS | 10.5.2 / 8.5.28 |
| Playwright / TypeScript | 1.61.1 / 5.9.3; versiones ya resueltas antes de migrar |

El adaptador anterior 7.8.2 sólo reconocía Node 18/20. Se evaluó primero
Astro 5.18.2 con Vercel 9.0.5 por su menor cambio de versión, pero la revisión
de avisos oficiales descartó esa rama: hay correcciones posteriores, incluida
la de optimización AVIF en Astro 7.2.8. Se eligió un par estable con peers
compatibles y se verificó su lockfile mediante auditoría.
Fuentes: [retiro de Node 20](https://vercel.com/changelog/node-js-20-is-being-deprecated),
[aviso de seguridad de Astro](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2)
y [guía de Astro 7](https://docs.astro.build/en/guides/upgrade-to/v7/).

## Cambios realizados

- Node 24 queda fijado en `package.json` y `.nvmrc`; `.npmrc` activa
  `engine-strict`. El build comprueba además el Node real antes de compilar.
- Se actualizó el import del adaptador a `@astrojs/vercel` y se conservó SSR.
  Se retiró `@astrojs/node`, que no tenía usos en el frontend.
- La integración antigua de Tailwind no declara compatibilidad con Astro 7.
  Se sustituyó por los mismos plugins Tailwind 3 y Autoprefixer de PostCSS,
  conservando el CSS del sitio. `compressHTML: true` mantiene el tratamiento
  anterior de espacios. No cambió la lógica de negocio.
- Se eliminó `site-frontend/package-lock.json`; `pnpm-lock.yaml` es el lockfile
  canónico. `allowBuilds` permite únicamente `esbuild` y `sharp`.
- Se actualizaron dependencias transitivas vulnerables dentro de sus mismos
  major mediante overrides documentados: fast-uri 3.1.8, js-yaml 4.3.2,
  tar 7.5.21, browserslist 4.28.7, baseline-browser-mapping 2.11.0 y
  devalue 5.9.3. La auditoría final reportó cero vulnerabilidades.
- `scripts/verify-runtime.mjs` revisa todos los `.vc-config.json` del artefacto:
  requiere funciones Node 24, rechaza runtimes inesperados y salidas ausentes,
  y distingue Edge. El build invoca ese guard automáticamente.
- `scripts/install-clean.mjs` elimina sólo el `node_modules` del frontend y
  ejecuta `corepack pnpm install --frozen-lockfile`. Es necesario al cambiar
  desde npm: un árbol mixto conservaba `cookie@0.7.2` y provocaba un error al
  cargar el artefacto SSR, aunque el build terminaba. La instalación limpia
  corrigió el problema; la copia temporal del árbol anterior se conservó.
- `vercel.json` fija `node scripts/install-clean.mjs` como instalación y
  `corepack pnpm run build` como compilación. Corepack toma el pnpm exacto de
  `packageManager`; no depende del pnpm global del proveedor.
  Véase [gestores en Vercel](https://vercel.com/docs/package-managers).
- Se añadió un job de CI del frontend con Node 24, instalación congelada,
  contratos, pruebas del guard, build, pruebas SSR y Playwright con mocks.
  El job existente de la API permanece igual.

## Validación local

Se utilizó Node oficial 24.21.0 para macOS ARM64, con SHA-256 contrastado con
`SHASUMS256.txt`, y pnpm 10.33.4. La versión global de la Mac sigue siendo
Node 26: seleccionar Node 24 con `.nvmrc` antes de trabajar en el frontend.
No se cambiaron instalaciones globales.

| Comando o comprobación | Resultado final |
| --- | --- |
| `pnpm install --offline --frozen-lockfile` en copia vacía | `passed`; 424 paquetes instalados desde la caché, sin resolver otro lockfile |
| `node scripts/install-clean.mjs` en el checkout | `passed`; lockfile congelado y árbol limpio |
| `corepack pnpm run check` / check incluido en build | `passed`; build final: 92 archivos, 0 errores, 0 advertencias, 0 hints |
| `corepack pnpm run test:contracts` | `passed`; 6 pruebas |
| `corepack pnpm run test:runtime` | `passed`; 5 pruebas, incluyendo rechazo de Node 18/20/22/26 y metadatos incorrectos |
| `corepack pnpm run build` | `passed`; función `_render.func` con `runtime: nodejs24.x` |
| `corepack pnpm run test:ssr` | `passed`; 6 resultados sobre el artefacto final y un BFF local efímero |
| `pnpm exec playwright install chromium` | `passed`; navegador oficial preparado para la validación |
| `pnpm run test:e2e --reporter=line,json` | `passed`; 300 pruebas, escritorio y móvil, sin reintentos |
| `pnpm audit --json` | `passed`; 0 vulnerabilidades en el lockfile revisado |
| `git diff --check` | `passed` |
| CI remota, preview y producción | `not run`; pendientes de publicación autorizada |

Las pruebas SSR cargan el handler que declara `.vc-config.json`, sin suponer
que su ubicación interna sea igual en una copia aislada y en el monorepo.
Comprueban login SSR, redirección sin sesión, sesión autenticada, múltiples
`Set-Cookie`, cuerpo JSON, cookie y query string del proxy, errores, allowlist
y expiración de cookie al cerrar sesión. El BFF de esas pruebas usa sólo un
puerto local efímero y respuestas simuladas.

La primera corrida completa de navegador obtuvo 295/300. Cuatro fallos se
debían a que Astro coloca scripts entre secciones; otro selector `h1` encontraba
encabezados dentro de la barra de desarrollo. Se compararon las mismas tres
pruebas en ambos tamaños contra Astro 4 del commit base: 6/6 pasaron. Se
adaptaron únicamente los selectores para comprobar secciones y el encabezado
específico del contenido; la corrida final obtuvo 300/300. También se añadió
`--ignore-lock` al servidor de Playwright: Astro 7 puede iniciarlo en segundo
plano al detectar un agente, mientras Playwright necesita controlar su proceso.

Una primera prueba de contratos en la copia aislada carecía de dos catálogos
estáticos del BFF que el contrato lee; se copiaron para lectura y pasó. No fue
un cambio ni un fallo del backend. Los fallos intermedios descritos se
resolvieron; no quedan pruebas fallidas conocidas de esta validación.

Evidencia local: `.tmp/frontend-node24-2026-10-02/` contiene logs finales de
instalación, build y SSR, auditoría, corrida E2E, comparación con el commit base
y `summary.json` con el hash del lockfile y los runtimes encontrados.
Los artefactos y logs están ignorados por Git. El plan original se conserva en
`docs/frontend-node24-migration-plan.md` como registro previo a la ejecución.

## Antes de desplegar

1. Revisar el diff y autorizar PR, merge y despliegue. El commit y push de
   la rama fueron autorizados después de la validación local. No se han
   realizado PR, merge, ajustes remotos de Vercel ni despliegues.
2. Confirmar en la cuenta de Vercel el proyecto, `Root Directory: site-frontend`,
   rama de producción, disponibilidad de Corepack y comandos efectivos. No se
   consultó ni modificó la configuración de esa cuenta en esta sesión.
3. Crear una preview aislada autorizada; verificar instalación limpia con
   pnpm 10.33.4, Node 24 en build y runtime efectivo de las funciones. Comprobar
   sesiones, cookies, proxy y navegación con servicios y cuentas de prueba.
   Los tests locales no equivalen a una ejecución en la infraestructura Vercel.
4. Identificar el despliegue funcional que se conservará para revertir y
   confirmar que sigue disponible. Promover sólo tras revisar la preview.

La reversión de una publicación debe recuperar un despliegue funcional ya
existente, no reconstruir Node 20. Antes de publicarse estos cambios, la
producción permanece ajena al trabajo local. Para una reversión local futura,
revisar exclusivamente el diff de esta rama contra `7e6ab33`, preservando
cualquier trabajo posterior. No borrar `output/`, `tmp/` ni datos locales.

API, `site-backend`, Railway, bases, secretos y operaciones Bonda no se
modificaron. No se ejecutó `test:smoke:live` ni se crearon clientes en producción.
Las verificaciones reducen el riesgo de repetir el fallo de runtime; no
constituyen una garantía de que cualquier despliegue futuro funcionará.
