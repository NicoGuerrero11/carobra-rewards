## Alcance vigente — 2026-10-07

La nueva instrucción autoriza una sección local revisable y pruebas con datos sintéticos sobre esta rama. Sustituye la elección previa de CURP por `rewards_id`, presentado como «Número de socio Rewards»: nueve dígitos en grupos de tres, copia canónica sin espacios. No altera identidades ni ejecuta migraciones. La preparación histórica inferior documenta decisiones anteriores; donde difiera prevalece este alcance.

Gift cards desde Oro (también Platino y Titanio), catálogo completo sin techo por nivel, conversión informativa de 3 puntos = $1 MXN según el documento maestro revisado por el usuario. El nivel del portal sirve para explicar el requisito, no para autorizar acceso externo. El componente se renderiza en servidor, sin enlace externo ni handler que pueda activarlo por CSS. Cupones y saldo Carobra no prueban disponibilidad de gift cards o saldo Bonda.

El campo giftCardAccess conserva enabled=false, status=PENDING_BONDA_FEEDBACK, loginMethod=null y minimumLevel=GOLD. identifierField pasa a rewards_id. La URL confirmada por captura aportada por el usuario es `https://carobrarewards.bonda.com`, micrositio `913085`; no se visita ni configura en runtime. No se añade interruptor de activación: falta contrato de elegibilidad externa (incluido descenso de nivel), titularidad/primer acceso y recuperación. El flujo descrito es introducir el número y después crear contraseña en Bonda; no se afirma verificación externa ni SSO. La activación futura requiere contrato específico de backend y controles Bonda; ocultar un botón no impide acceso directo al micrositio.

Inicio muestra el número debajo del saludo; Mi cuenta lo muestra junto a los datos personales; Beneficios contiene la sección y la ruta existente /cliente/gift-cards reutiliza el mismo bloque. No se añade navegación principal. Identidad ausente o legado no numérico produce «No disponible», nunca un identificador nuevo. La copia usa Clipboard API, fallback local y selección manual si ambos fallan.

No conexiones a servicios reales, envíos de datos, canjes, puntos, cambios de credenciales, push, PR, merge ni deploy. No se modifica el trabajo Skandia ni los archivos ajenos.

---

La aclaración posterior del usuario mantiene CURP como parte de la ficha del afiliado al vincularlo con Bonda. Ya está almacenada como texto en customers.curp; se conserva íntegra y no se convierte a número. Su envío futuro requiere contrato HTTP de campo personalizado (ubicación JSON, clave exacta y tipo textual en alta/PATCH); Referencias del importador no lo prueba. El identificador permanece rewards_id/code. No se transmite información real ni se cambia la política de envío adicional desde Oro.

## Preparación histórica (2026-10-06)

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
