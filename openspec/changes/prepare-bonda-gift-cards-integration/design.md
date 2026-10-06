## Context

El perfil actual ya contiene Rewards ID, correo y CURP. El micrositio observado anteriormente pide ID Rewards para ingresar y contraseña adicional para consultar saldo; no se confirmó el canje. El usuario decidió usar CURP para el acceso y conservar el correo como dato actualizable. Esta decisión de producto todavía requiere confirmar la configuración correspondiente con Bonda.

La instrucción del 2026-10-06 reemplaza el alcance previo de preparación amplia: solo dejar el campo listo, sin conexiones, hasta obtener feedback de Bonda y autorización posterior del usuario. No se inspeccionará de nuevo el micrositio ni se ejecutará el preflight de conexión.

## Goals / Non-Goals

**Goals:** reservar configuración tipada e inactiva y dejar preguntas claras para el proveedor, en una rama nueva.

**Non-Goals:** red, datos reales, cambios de afiliados, puntos, login, interfaz o servicios desplegados. Las integraciones existentes no se reconfiguran ni se ejecutan durante este trabajo.

## Decisions

### Configuración interna sin activación

Añadir `giftCardAccess` a `BondaConfig` con `status: "PENDING_BONDA_FEEDBACK"`, `enabled: false`, `loginMethod: null` e `identifierField: "curp"`. identifierField identifica el campo del perfil Carobra elegido para login, no un nombre confirmado del payload Bonda. loginMethod permanece pendiente porque aún falta acordar contraseña, activación y recuperación. Los valores de este contrato son literales; no se añade una variable de entorno que permita habilitarlo. El campo será opcional en configuraciones construidas manualmente para conservar compatibilidad; `loadConfig` lo devolverá siempre. Si falta, ningún futuro consumidor debe interpretar disponibilidad.

Mantener Rewards ID como vínculo interno estable. No asumir que el `code` de Bonda seguirá siendo Rewards ID si su configuración exige CURP como code: confirmar cómo representar ambos y cómo actualizar afiliados existentes sin duplicarlos. Prever correcciones excepcionales de CURP manteniendo la misma cuenta e historial; no implementar ese flujo en esta fase.

No incluir URL de login, payload, credenciales ni campos con datos del cliente. No consumir la configuración desde rutas, workers o frontend en este cambio. El nombre del campo solo reserva un lugar para el acuerdo futuro, sin afirmar soporte del proveedor.

### Trabajo aislado

Rama: `codex/bonda-gift-cards-preparation`, creada desde `codex/frontend-node24`. Conservar archivos ajenos existentes y verificar solamente el diff de este trabajo. No mezclar ni publicar en main.

### Condición para retomar

Requerir ambas condiciones: respuesta de Bonda sobre acceso y nueva indicación del usuario. En ese momento actualizar esta configuración y diseñar el trabajo futuro explícitamente; no ejecutar las tareas de sincronización o puntos de la propuesta anterior.

## Risks / Trade-offs

- Confundir campo preparado con integración lista → nombrar el estado pendiente y mantener enabled literalmente false.
- Confundir la elección local de CURP con soporte confirmado por Bonda → mantener loginMethod null, estado pendiente y mapeo externo sin configurar.
- Verificación que conecte al proveedor → usar únicamente compilación y pruebas de configuración locales; no iniciar servidor, jobs o comandos de conexión.

## Migration Plan

Cambio aditivo sin migración ni despliegue. Comprobar TypeScript y las pruebas locales existentes de configuración. El rollback consiste en retirar el campo; no hay datos ni operaciones externas que revertir.

## Open Questions

Preguntas para enviar manualmente a Bonda; este cambio no las envía:

1. Elegimos CURP como usuario de acceso. ¿Cómo configuramos ese acceso manteniendo Rewards ID como referencia interna? ¿CURP debe ir en `code` o en otro campo? ¿Cómo se actualizan cuentas existentes sin crear duplicados?
2. ¿Cómo es el primer acceso: invitación, creación de contraseña o activación? ¿Qué pasos debe realizar el cliente y qué comunicación envía Bonda?
3. ¿Para consultar saldo y canjear deberá ingresar otra vez su contraseña? ¿Cómo funciona la recuperación si la olvida?
4. ¿Qué campos exactos debemos enviar para CURP, Rewards ID y correo? ¿Cómo actualizamos el correo y verificamos su nuevo valor para comunicaciones y recuperación? Si se necesita corregir una CURP, ¿cómo conservamos cuenta, saldo e historial?
5. ¿Cuál será la URL final de Puntos y cómo se retorna allí después del login?
6. Como opción adicional, ¿existe SSO o enlace temporal de acceso? Si existe, ¿habilita también saldo y canje, o solo entrada al catálogo?

Resultado esperado: un ejemplo completo del alta y del primer acceso con CURP, con los nombres de campos y el recorrido del cliente. La selección local de CURP no confirma su configuración externa ni permite prescindir de contraseña u otro factor de autenticación.
