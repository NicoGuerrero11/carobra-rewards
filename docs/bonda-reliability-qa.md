# Revisión local Bonda — 2026-10-08

Rama: `codex/bonda-reliability-bronze-ui`, worktree `/tmp/carobra-bonda-reliability`.
Preview: http://127.0.0.1:4327/cliente/recompensas, backend mock loopback 3042.
No push, PR, merge, migración, cambio de flags ni despliegue productivo.

## Pruebas

- Backend completo tras afiliación: 342 pruebas, 335 aprobadas, 7 omitidas, 0 fallos.
- Después del reconocimiento del mensaje de retirada: build TypeScript y 25 pruebas
  focalizadas del gateway/caché, todas aprobadas.
- Frontend: build completo con Node 24.21.0, Astro check sin errores ni advertencias
  (2 hints de execCommand en tests existentes), empaquetado Vercel nodejs24.x válido.
- Contratos frontend: 8 aprobados.
- Se actualizaron las expectativas E2E de textos, balance y equivalencia; no se
  ejecutó la suite Playwright por shell en esta sesión. La interacción de navegador
  se realizó con CUA en el navegador integrado de Codex en la Mac.

## Navegador integrado, datos sintéticos

Se inspeccionaron los píxeles de Inicio y Mi cuenta. Como el override de viewport
no cambiaba el panel real (790 px), un harness temporal DEV mostró la aplicación
sin modificar dentro de iframes de 1440 y 390 px. Se comprobó el ancho efectivo del
DOM y ausencia de desbordamiento: 1440/1440 y 390/390. El harness fue retirado del
árbol de rutas y no está incluido en el build ni en el commit.

- Copiar muestra confirmación accesible. Pegado real en textarea local confirma
  `123456789`; tres clicks no alteraron el valor. Enter en Mi cuenta también copia.
- Harness con rechazo sintético de Clipboard API: fallback confirmado. Rechazo
  de ambos mecanismos: input seleccionable `123456789` y explicación visible.
- Oro: tarjeta y enlace público; Bronce y BLOCKED: tarjeta ausente.
- Identidad faltante: botón deshabilitado y ningún enlace externo en el bloque.
- 900 puntos FRESH: equivalencia $300.00 MXN. STALE conserva cantidad con aviso,
  sin equivalencia; UNAVAILABLE y DISABLED no inventan importe ni cero.
- Navegación Inicio → Mi cuenta y Beneficios → Ayuda confirmada por UI.
- Destino verificado: `https://carobrarewards.bonda.com`, sin query ni identificador,
  `rel=noopener noreferrer`. No se abrió el destino real ni se ejecutaron canjes;
  no se afirma validación del login externo o de titularidad.

## Límites y pendientes

Las tres capturas originales indicadas en Library no estuvieron disponibles mediante
herramientas de lectura/materialización de este entorno. La comparación visual usó
la aplicación local existente y el diseño textual aprobado; no se afirma haber leído
esas capturas. Se requiere revisión humana de la propuesta.

Railway quedó autenticado por el usuario en IAB pestaña 3 y se verificó a las
16:46 UTC. El diagnóstico de cupón 9510 respondió HTTP 200 con
`Cupon no existente o desactivado`. El runbook de cupones contiene la evidencia y
el tratamiento específico. La falta de cupón vigente requiere confirmación del
proveedor, no restaurar un afiliado técnico que ya existe. Los HTTP 500 de cursos
no tienen causa confirmada.

La afiliación automática está preparada en código, no activada. Consultar
`bonda-bronze-activation.md` para publicar sólo backend, aplicar únicamente 028,
activar los dos flags no secretos y la captura futura, y autorizar la nueva fixture
sintética. No hay backfill histórico ni prueba de transición nueva en producción.
