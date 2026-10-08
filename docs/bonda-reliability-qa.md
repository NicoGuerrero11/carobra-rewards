# Revisión del diseño de Rewards y gift cards

Rama: `codex/bonda-ui-design`, basada en `main` `6f1f6a6`.
El cambio contiene sólo interfaz, contratos de lectura frontend y pruebas con mocks.

## Alcance

- Número de socio compacto; conserva formato de nueve dígitos en grupos de tres,
  copia sin espacios, confirmación accesible y fallback ya existentes.
- Inicio separa puntos registrados en Carobra Rewards del saldo para gift cards.
- Tarjeta simple desde Oro, con número de socio y CTA al micrositio autorizado.
  Se mantienen las reglas de estado, nivel e identidad. Sin fórmula de conversión
  ni equivalente MXN. El enlace no transmite identidad, sesión ni credenciales.
- FRESH y cero confirmado muestran puntos; STALE conserva el importe y advierte
  que puede haber cambiado. UNAVAILABLE y DISABLED no inventan importe ni cero.
- Catálogo y detalle avisan cuando el backend devuelve `freshness: STALE`.

## Validación

Las pruebas se ejecutan con backend mock local y datos sintéticos. La suite de
número de socio bloquea navegación externa e intercepta el enlace al micrositio;
no llama a Bonda ni efectúa canjes reales. Incluye clicks repetidos, copia,
fallback, identidad faltante y acceso por nivel/estado, en desktop y móvil.
La suite de saldo recorre FRESH, cero, STALE, UNAVAILABLE y DISABLED.
La prueba de catálogo verifica el aviso STALE y su desaparición al refrescar.

La propuesta anterior fue revisada manualmente en el navegador integrado de Codex
con anchos de 1440 y 390 px, navegación y copia real. El diseño publicado conserva
esos archivos de interfaz. La validación automatizada se repite sobre esta rama.

Resultados sobre esta rama: build Node 24.21.0 correcto; Astro check sin errores
ni warnings (dos hints de `execCommand` existente); runtime 5/5, contratos 8/8,
SSR 6/6 y E2E focalizado 44/44 en desktop/móvil. La suite completa y los checks
del SHA publicado quedan registrados en el PR.

## Límites

Este PR no recupera el catálogo productivo, activa afiliación ni modifica reglas,
backend, migraciones o configuración de producción. No verifica el login externo
ni la titularidad en Bonda. La URL de preview depende del despliegue automático
normal del PR; no debe confundirse con producción.
