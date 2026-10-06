## Why

Carobra necesita reservar la configuración de acceso a gift cards mientras Bonda confirma cómo iniciará sesión el cliente. El usuario restringió expresamente el alcance el 2026-10-06: ninguna conexión a Bonda hasta recibir su feedback y una nueva indicación del usuario.

## What Changes

- Añadir un campo interno de configuración de acceso a gift cards, pendiente y deshabilitado.
- Registrar CURP como identificador de acceso elegido por el usuario. Mantener pendientes el mecanismo de autenticación y su mapeo en Bonda; correo será actualizable y Rewards ID conservará su función de identificador interno.
- Documentar dos etapas futuras: vínculo de afiliación mediante Rewards ID por Nómina y envío de CURP/correo solo desde Oro, incluyendo Platino y Titanio. Registrar GOLD como nivel mínimo sin implementar ni ejecutar ningún envío en esta fase.
- Documentar las preguntas que Bonda debe responder antes de retomar la integración.
- Trabajar en `codex/bonda-gift-cards-preparation`, creada desde la rama de trabajo actual `codex/frontend-node24`, sin modificar main.

## Capabilities

### New Capabilities

- `bonda-gift-card-readiness`: configuración interna inactiva que reserva el futuro contrato de acceso.

### Modified Capabilities

Ninguna. Este cambio no habilita ni altera las capacidades existentes del catálogo.

## Impact

- `site-backend/src/config.ts`: campo interno sin consumidor de red ni controles de activación.
- Documentación OpenSpec: alcance reducido y preguntas para Bonda.
- Sin cambios de base de datos, endpoints, pantallas, jobs o credenciales.

## Non-goals

No implementar altas, actualizaciones, exportaciones, transferencias, backfills, SSO ni pruebas conectadas. La propuesta anterior de sincronización y puntos queda diferida, fuera de las tareas de este cambio. Recibir feedback de Bonda no habilita automáticamente nada: también se necesita la indicación posterior del usuario.
