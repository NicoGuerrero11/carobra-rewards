# Skandia: primera vista funcional

Implementación local para revisar contenido, diseño y navegación. No es una cotización ni un flujo de solicitud comercial.

## Rama y referencia

- Rama: `codex/skandia-product-preview`.
- Base exacta: `origin/main` después de fetch, `522abab0585efb8371ad50cef5a7667a4606ca21`.
- Worktree: `/tmp/carobra-skandia-preview`; checkout original conservado en `codex/bonda-gift-cards-preparation`.
- Alcance basado en el contenido previamente verificado de `CAROBRA_Rewards_Modulo_Producto_Skandia.pptx` (23 láminas), no en inspección visual del archivo. No había copia local del nuevo deck. La copia Library no se consultó tras el bloqueo de permisos reportado por la tarea de origen.
- Diseño propio usando navegación, tipografía y recursos existentes de Carobra. La marca Skandia en la ficha es texto provisional. No se importaron materiales del deck.

## Revisar localmente

URL aislada: `http://127.0.0.1:4325/preview/skandia`.

Esta ruta reutiliza la ficha y el shell de cliente, sin sesión ni lecturas al backend. Devuelve 404 en un build de producción. Los enlaces del shell permiten navegar al sitio local; para probar todo el catálogo y autenticación, iniciar también el doble de backend.

Desde `site-frontend`, usando Node 24 y pnpm 10.33.4:

```sh
# Terminal 1: doble de backend, exclusivamente local; no usa base de datos.
node tests/support/mock-site-backend.mjs

# Terminal 2: frontend con el backend local explícito.
SITE_BACKEND_BASE_URL=http://127.0.0.1:3002 pnpm run dev --host 127.0.0.1 --port 4325
```

Para este entorno se instalaron herramientas solo en `/tmp/carobra-skandia-tooling`; pueden seleccionarse con `export PATH=/tmp/carobra-skandia-tooling/node_modules/.bin:$PATH`. Las dependencias del frontend se copiaron al worktree, sin modificar el lockfile.

Ruta integrada: `/cliente/productos/skandia`, accesible desde el botón de Skandia en Productos. El doble local acepta `ada@example.com` / `correct-horse-7`. No son credenciales reales. No iniciar servicios reales ni smoke live para esta revisión.

Las entradas `?plan=ahorro` y `?plan=retiro` conservan solo esa intención durante login/registro. No pasan respuestas, contactos o montos en URLs. La redirección usa una lista cerrada de tres destinos internos para evitar redirects abiertos.

## Comportamiento

- Información libre: metas, Crea Futuro, retiro/AFORE, condiciones pendientes, respaldo, Rewards y preguntas frecuentes.
- Ahorro: 4 pasos; objetivo, meta opcional, horizonte, aportación/frecuencia, expectativa, declaración, momento para comenzar y contacto/consentimiento de prueba.
- Retiro: 3 pasos; edad deseada, aportación/frecuencia, declaración, expectativa, momento y contacto/consentimiento de prueba.
- Ingresos y bonos opcionales omitidos intencionalmente para minimizar información financiera. No se usa la identidad de la cuenta; el contacto es fijo: Alex Ejemplo, alex@example.test. No se solicita teléfono ni fecha de nacimiento.
- Resumen: ahorro suma aportación × frecuencia anual × años; retiro muestra solo aportaciones anuales porque no se recoge la edad actual. No calcula rendimientos, inflación, impuestos ni comisiones. No evalúa idoneidad o elegibilidad.
- Validación: requeridos, positivos, centavos, enteros para años/edad y protección frente a desbordamiento numérico. No establece mínimos/máximos comerciales aún no confirmados.
- Modal accesible nativo, pantalla completa móvil, foco dentro del diálogo y retorno al botón al cerrar, Escape, atrás, descarte, protección de doble clic.
- Cerrar conserva el ejercicio únicamente en memoria de esta página. Recargar, navegar, descartar o salir de la confirmación lo elimina. Sin localStorage, sessionStorage, bases de datos ni llamadas de envío.
- Confirmación explícita: “Simulación completada / No se ha enviado ninguna solicitud”. Sin solicitud real, folio, asesor, agenda, WhatsApp, documentos, puntos ni cambio de nivel.
- Se conserva el importe visual de Rewards ya existente en el catálogo anterior; la ficha y sus formularios no anuncian puntos ganados.

## Pendiente para una versión real

Conciliar plazos 5–25 vs. 10–25 y excepción por edad; Estratégico vs. Crea Futuro; periodicidad del monto fiscal 30,000; pausa de aportaciones desde mes 25. Faltan documentos oficiales/checklist definitivo, contenido visual del deck y confirmación escrita de uso de marca para publicación.

La persistencia comercial, identidad de cuenta, consentimiento real, privacidad/acceso, folios, asignación, canales y puntos requieren una etapa independiente; no están conectados aquí. No hubo cambios de negocio o backend, push, PR, merge ni despliegue.

## Verificación (Mac, 2026-10-07)

- `pnpm run build`: pasó, incluyendo Astro check (0 errores, 0 warnings) y runtime Node 24; función generada `nodejs24.x`.
- `pnpm run test:contracts`: 8 pasados.
- `pnpm run test:runtime`: 5 pasados.
- `pnpm run test:ssr`: 7 pasados (incluido el contenedor), con ruta preview 404 en build y ruta integrada protegida.
- Playwright: 48 pasados, Chromium en escritorio y Pixel 5, para Skandia, catálogo, registro/login y deshabilitación de Google/email demo. Skandia verifica pasos, errores, importes, consentimiento, cerrar/retomar, Escape, descarte, doble clic, recarga, login con intención, atrás/adelante, ancho desde 320px, ausencia de llamadas API en preview y de envíos en cuestionario.
- Repetición de las 10 pruebas de Skandia para capturas limpias, sin la barra de herramientas de Astro.
- La primera ejecución tuvo 2 fallos por un selector del test que esperaba “Iniciar sesión” en lugar de “Entrar”; corregidos y repetidos. También se corrigió la fuente bloqueada por Vite al reemplazar un enlace de node_modules por una copia aislada. No quedan fallos de tests.
- La barra de desarrollo de Astro emitió un aviso de auditoría `Failed to fetch` durante navegación; no proviene del código Skandia. No aparece en el build.
- No ejecutados: suites completas de API/backend, smoke live ni pruebas contra servicios reales/producción. No hubo cambios en esas capas. No se probó Safari ni un dispositivo móvil físico.

Las capturas de escritorio/móvil, resumen y confirmación se encuentran en `.tmp/skandia-qa/` del worktree. Son resultados locales, fuera del commit.
