## 1. Alcance y rama

- [x] 1.1 Crear una rama nueva desde el estado actual y preservar el trabajo ajeno sin modificar main.
- [x] 1.2 Sustituir el alcance anterior por configuración inactiva y documentar las preguntas de acceso para Bonda.

## 2. Campo de preparación

- [x] 2.1 Añadir giftCardAccess pendiente y deshabilitado, con loginMethod null e identifierField curp según la decisión del usuario, sin variables de activación ni consumidores de red.
- [x] 2.2 Comprobar tipos y pruebas de configuración existentes de forma local y revisar el diff; no ejecutar conexiones, servidores o jobs Bonda.

Verificación: compilación TypeScript correcta; cinco pruebas existentes de configuración Bonda aprobadas; validación OpenSpec estricta y diff sin errores de espacios. No se ejecutaron conexiones a Bonda.

Aclaración posterior: vínculo por Rewards ID mediante Nómina; CURP/correo solo desde Oro, incluyendo Platino y Titanio. Se registró minimumLevel GOLD en la configuración inactiva y se retiró la suposición de reemplazar `code` por CURP. No se implementó sincronización ni ejecución de elegibilidad.

## 3. Sección local autorizada el 2026-10-07

- [x] 3.1 Actualizar la selección local a rewards_id conservando el contrato deshabilitado.
- [x] 3.2 Mostrar Número de socio Rewards en Inicio, Mi cuenta y sección de Bonda; copiar sin espacios con confirmación accesible y fallback.
- [x] 3.3 Sustituir el estado genérico de gift cards por sección desde Oro, catálogo completo y conversión informativa 3 puntos = $1 MXN; mantener acceso externo deshabilitado.
- [x] 3.4 Verificar tipos, contratos y navegación/copia/estados en Chromium de Mac, desktop y móvil, con mocks.
