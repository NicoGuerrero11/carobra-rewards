## Alcance vigente — 2026-10-07

La nueva instrucción autoriza una sección local revisable y pruebas con datos sintéticos sobre esta rama. Sustituye la elección previa de CURP por `rewards_id`, presentado como «Número de socio Rewards»: nueve dígitos en grupos de tres, copia canónica sin espacios. No altera identidades ni ejecuta migraciones. La preparación histórica inferior documenta decisiones anteriores; donde difiera prevalece este alcance.

Gift cards desde Oro (también Platino y Titanio), catálogo completo sin techo por nivel, conversión informativa de 3 puntos = $1 MXN según el documento maestro revisado por el usuario. El nivel del portal sirve para explicar el requisito, no para autorizar acceso externo. El componente se renderiza en servidor, sin enlace externo ni handler que pueda activarlo por CSS. Cupones y saldo Carobra no prueban disponibilidad de gift cards o saldo Bonda.

El campo giftCardAccess conserva enabled=false, status=PENDING_BONDA_FEEDBACK, loginMethod=null y minimumLevel=GOLD. identifierField pasa a rewards_id. La URL confirmada por captura aportada por el usuario es `https://carobrarewards.bonda.com`, micrositio `913085`; no se visita ni configura en runtime. No se añade interruptor de activación: falta contrato de elegibilidad externa (incluido descenso de nivel), titularidad/primer acceso y recuperación. El flujo descrito es introducir el número y después crear contraseña en Bonda; no se afirma verificación externa ni SSO. La activación futura requiere contrato específico de backend y controles Bonda; ocultar un botón no impide acceso directo al micrositio.

Inicio muestra el número debajo del saludo; Mi cuenta lo muestra junto a los datos personales; Beneficios contiene la sección y la ruta existente /cliente/gift-cards reutiliza el mismo bloque. No se añade navegación principal. Identidad ausente o legado no numérico produce «No disponible», nunca un identificador nuevo. La copia usa Clipboard API, fallback local y selección manual si ambos fallan.

No conexiones a servicios reales, envíos de datos, canjes, puntos, cambios de credenciales, push, PR, merge ni deploy. No se modifica el trabajo Skandia ni los archivos ajenos.

---

La aclaración posterior del usuario mantiene CURP como parte de la ficha del afiliado al vincularlo con Bonda. Ya está almacenada como texto en customers.curp; se conserva íntegra y no se convierte a número. Su envío futuro requiere contrato HTTP de campo personalizado (ubicación JSON, clave exacta y tipo textual en alta/PATCH); Referencias del importador no lo prueba. El identificador permanece rewards_id/code. No se transmite información real ni se cambia la política de envío adicional desde Oro.

## Preparación histórica (2026-10-06)

## Context

El perfil actual ya contiene Rewards ID, correo y CURP. El micrositio observado anteriormente pide ID Rewards para ingresar y contraseña adicional para consultar saldo; no se confirmó el canje. El usuario decidió usar CURP para el acceso y conservar el correo como dato actualizable. Esta decisión de producto todavía requiere confirmar la configuración correspondiente con Bonda.

La instrucción del 2026-10-06 reemplaza el alcance previo de preparación amplia: solo dejar el campo listo, sin conexiones, hasta obtener feedback de Bonda y autorización posterior del usuario. No se inspeccionará de nuevo el micrositio ni se ejecutará el preflight de conexión.

## Goals / Non-Goals

**Goals:** reservar configuración tipada e inactiva y dejar preguntas claras para el proveedor, en una rama nueva.

**Non-Goals:** red, datos reales, cambios de afiliados, puntos, login, interfaz o servicios desplegados. Las integraciones existentes no se reconfiguran ni se ejecutan durante este trabajo.

## Decisions

### Configuración interna sin activación

Añadir `giftCardAccess` a `BondaConfig` con `status: "PENDING_BONDA_FEEDBACK"`, `enabled: false`, `loginMethod: null` e `identifierField: "curp"`. identifierField identifica el campo del perfil Carobra elegido para login, no un nombre confirmado del payload Bonda. loginMethod permanece pendiente porque aún falta acordar contraseña, activación y recuperación. Los valores de este contrato son literales; no se añade una variable de entorno que permita habilitarlo. El campo será opcional en configuraciones construidas manualmente para conservar compatibilidad; `loadConfig` lo devolverá siempre. Si falta, ningún futuro consumidor debe interpretar disponibilidad.

Mantener Rewards ID como vínculo de afiliación por la API de Nómina. El adaptador actual usa Rewards ID en `code`; la aclaración del usuario conserva ese vínculo y no autoriza reemplazarlo por CURP. Retirar la propuesta anterior de `code = CURP` como decisión cerrada. La API describe code como identificador de ingreso, por lo que todavía debe resolverse cómo Bonda permite CURP como acceso manteniendo Rewards ID como referencia estable, sin inventar campos ni duplicar afiliados. Prever correcciones excepcionales de CURP manteniendo la misma cuenta e historial; no implementar ese flujo en esta fase.

### Datos adicionales condicionados por nivel

El modelo de producto acordado distingue dos etapas futuras:

1. Vínculo base: Rewards ID por la API de Nómina; ese vínculo por sí solo no implica gift cards habilitadas ni requiere enviar CURP/correo para esta capacidad.
2. Activación de gift cards: cuando el nivel canónico Carobra cumpla el umbral aprobado, preparar la actualización del mismo afiliado con CURP y correo y el flujo de acceso que Bonda confirme.

No enviar los datos adicionales de todos los clientes ni interpretar registro, producto activo o saldo positivo como sustitutos del nivel requerido. El usuario confirmó Oro como umbral mínimo: configurar `minimumLevel: "GOLD"` y contemplar Oro, Platino y Titanio; Invitado, Bronce y Plata no habilitan ese envío. Este valor solo registra la política en configuración inactiva y no sustituye una futura validación de elegibilidad en backend. Evitar repetir activaciones al reevaluar el mismo nivel. Los cambios de correo posteriores corresponden solo a perfiles cuyo envío ya se habilitó. La política ante descenso de nivel sigue pendiente: no eliminar afiliados, saldo o historial automáticamente ni asumir que ocultar el botón impide un acceso directo a Bonda.

Estas son decisiones para el diseño futuro. El alcance actual sigue siendo solo configuración inactiva y documentación: no activar ni ejecutar siquiera el vínculo base de Nómina hasta la indicación del usuario.

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

## Documented API contract

Verificado de nuevo sobre la copia local de [API de Nómina](https://documenter.getpostman.com/view/1928874/TVetZjgf), sin conexiones nuevas:

- Alta: `POST /api/v2/microsite/{microsite_id}/affiliates`; `code` es obligatorio y representa el identificador de ingreso. `email` aparece como campo admitido en el ejemplo.
- Actualización: `PATCH /api/v2/microsite/{microsite_id}/affiliates/{affiliate}`; enviar únicamente los campos que cambian. La propia colección ejemplifica cambiar `email`.
- Los campos adicionales dependen del micrositio. La documentación dirige a Panel de administración → Usuarios → Administración Masiva → Agregar → Ver Referencias para consultar sus slugs.
- El correo de bienvenida es opcional mediante `send_welcome_email`; su existencia no documenta por sí misma la creación de contraseña.

No preguntar al proveedor por los endpoints o por si se puede actualizar email: ya están documentados. Preguntar solamente por configuración específica, efectos de verificación y flujos no descritos.

## Open Questions

Preguntas para enviar manualmente a Bonda; este cambio no las envía:

1. Mantendremos el vínculo por Rewards ID mediante Nómina y enviaremos CURP/correo únicamente al habilitar gift cards por nivel. Dado que la documentación describe `code` como identificador de ingreso, ¿cómo permite la configuración del micrositio acceder con CURP conservando ese vínculo y la misma cuenta? Se necesitan los campos configurados, no una segunda afiliación.
2. ¿Cómo es el primer acceso: invitación, creación de contraseña o activación? ¿Qué pasos debe realizar el cliente y qué comunicación envía Bonda?
3. ¿Para consultar saldo y canjear deberá ingresar otra vez su contraseña? ¿Cómo funciona la recuperación si la olvida?
4. Después de actualizar `email` mediante el PATCH documentado, ¿Bonda exige verificar el nuevo correo y cómo afecta la recuperación de contraseña? Si se necesita corregir una CURP usada como code, ¿cómo conservamos cuenta, saldo e historial?
5. ¿Cuál será la URL final de Puntos y cómo se retorna allí después del login?
6. Como opción adicional, ¿existe SSO o enlace temporal de acceso? Si existe, ¿habilita también saldo y canje, o solo entrada al catálogo?

Resultado esperado: un ejemplo completo del alta y del primer acceso con CURP, con los nombres de campos y el recorrido del cliente. La selección local de CURP no confirma su configuración externa ni permite prescindir de contraseña u otro factor de autenticación.

Decisión confirmada de Carobra: gift cards desde Oro. Sigue pendiente el tratamiento de un descenso posterior de nivel. No atribuir estas políticas a la API de Nómina ni inferirlas del catálogo de cupones.
