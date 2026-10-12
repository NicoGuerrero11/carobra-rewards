# Revisión local de productos — 2026-10-12

Sitio completo: http://127.0.0.1:4330/

- Cuenta ficticia del backend local: `ada@example.com` / `correct-horse-7`.
- Productos integrado: http://127.0.0.1:4330/cliente/productos
- Skandia sin iniciar sesión: http://127.0.0.1:4330/preview/skandia
- Quálitas sin iniciar sesión: http://127.0.0.1:4330/preview/qualitas

Las rutas `/preview/` funcionan únicamente en desarrollo y devuelven 404 en build. Las rutas `/cliente/productos/skandia` y `/cliente/productos/qualitas` requieren sesión. La landing y el catálogo enlazan las fichas; login/registro conservan exclusivamente destinos y planes de una lista cerrada, sin respuestas en las URLs.

## Checkout y alcance

Worktree recuperado: `/Users/nicolasguerrero/work/carobra-rewards/.tmp/carobra-products-preview`.
Rama: `codex/skandia-product-preview`. HEAD: `65d330f9ac39314204ae19d184004803041b70ab`, sobre base `522abab0585efb8371ad50cef5a7667a4606ca21`. Los cambios de Quálitas permanecen sin commit. La integración posterior con main queda pendiente; no hubo merge, rebase, push, PR ni despliegue. Se conservó el checkout principal y el worktree anterior dañado.

Quálitas incluye información libre y dos cuestionarios de cinco pasos: Cotizar mi auto y Mejorar mi seguro actual. Recogen contexto del vehículo, código postal, uso, conductor por rangos, cobertura e intención; mejorar incluye aseguradora actual (también otra aseguradora), cobertura, vencimiento y cambio buscado. Contacto fijo Alex Ejemplo / alex@example.test. Validaciones de formato y campos, resumen, atrás, cierre/reapertura, descarte y bloqueo de doble avance. Cerrar conserva el ejercicio en memoria; recargar o salir lo descarta.

El diálogo y su controlador son reutilizables entre los dos recorridos. Diseño de modal en escritorio y pantalla completa móvil. Skandia mantiene sus recorridos anteriores. No hay almacenamiento, envío, cotización automática, precio, folio real, asesor, agenda, WhatsApp, puntos ni cambio de nivel. La confirmación declara expresamente que no se envió ninguna solicitud. Se omitieron archivos adjuntos; los documentos aparecen solo como orientación para una futura contratación.

La ficha usa recursos existentes y diseño propio, basado en el alcance textual proporcionado. No se inspeccionaron gráficos de los decks ni se descargaron fuentes bloqueadas. Coberturas, condiciones, documentación final, operación comercial y autorización de publicación requieren validación posterior; no se prometen mejoras, aceptación ni plazos de respuesta.

## Servidor actual y reinicio

Frontend 4330 y doble de backend 3010 escuchan exclusivamente en `127.0.0.1`, sin bases de datos ni servicios de producción. Logs y fixture generado en `site-frontend/.tmp/local-preview/`. No se cargaron archivos `.env` de producción.

Para reiniciar de forma convencional desde `site-frontend`, con Node 24 y pnpm 10.33.4 y puertos libres:

```sh
# Terminal 1: fixture original, puerto 3002
node tests/support/mock-site-backend.mjs
# Terminal 2
SITE_BACKEND_BASE_URL=http://127.0.0.1:3002 pnpm dev --host 127.0.0.1 --port 4330
```

En esta Mac se usó Node 24 de `/tmp/carobra-skandia-tooling/node_modules/node/bin/node` y el CLI local de Astro directamente. El runtime temporal puede requerir reinstalación futura. No se modificó el lockfile.

## Verificaciones actuales

- Build completo equivalente al script `build`: verificación Node 24, Astro check (112 archivos, cero errores/warnings/hints), Astro build y runtime generado `nodejs24.x`: pasó.
- Contratos y runtime: 19 pruebas pasadas, cero fallidas.
- SSR del entrypoint generado: 8 pruebas pasadas (incluido contenedor), cero fallidas. Incluye protección de ambas fichas, preview 404 en build, continuidad de intención y contenido simulado.
- `git diff --check`: pasó.
- HTTP local: inicio, login, ambas previews y logo Quálitas respondieron 200. Productos sin sesión redirigió a login; login ficticio y catálogo/ambas fichas autenticadas respondieron 200.
- Se añadieron pruebas E2E de Quálitas y actualizaron expectativas del catálogo/landing. **No ejecutadas**: el control IAB del navegador integrado de la Mac no está disponible en esta sesión. Abrir una pestaña de Codex no acredita QA visual. No hay capturas nuevas ni verificación interactiva actual de escritorio/móvil, pasos, foco o navegación atrás/adelante. Las pruebas unitarias verifican el modelo y las validaciones, no la interacción DOM.
- No ejecutados: smoke live, servicios de producción y suites de backend/API sin cambios.

Antes de integrar: realizar QA interactiva en el navegador integrado disponible y revisar contenido/condiciones con el responsable del producto. Integrar main en una etapa posterior, tal como se solicitó.
