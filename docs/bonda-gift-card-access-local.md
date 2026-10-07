# Gift cards: sección local y revisión de afiliación

Fecha: 2026-10-07. Rama: `codex/bonda-gift-cards-preparation`, base `339f718`.

## Resultado local

- Número de socio Rewards usa exclusivamente `user.rewardsId` derivado de `rewards_id`. Nueve dígitos se muestran en grupos de tres y se copian sin espacios. Identidades ausentes/legadas no se transforman ni regeneran.
- Visible debajo del saludo de Inicio, en Mi cuenta y junto a Bonda dentro de Beneficios. La ruta existente `/cliente/gift-cards` reutiliza la misma sección; no hay nueva página ni ítem principal.
- Oro, Platino y Titanio cumplen el requisito de nivel; Invitado/Bronce/Plata, cuenta restringida, número faltante y portal no disponible tienen mensajes específicos. El requisito no equivale a autorización externa.
- Catálogo completo sin techo por nivel y equivalencia informativa 3 puntos = $1 MXN, según la regla confirmada por el usuario. No se muestra saldo Bonda ni se calcula capacidad de canje.
- Botón deshabilitado, sin URL ni handler externo. Quitar CSS o disabled no produce navegación, sincronización ni canje. El contrato `giftCardAccess` conserva estado pendiente, `enabled: false`, `loginMethod: null`, mínimo `GOLD`; la selección local cambia de `curp` a `rewards_id`.
- No se habilitó ninguna bandera, migración, envío de datos o integración. No se verificó aplicación de la migración numérica en producción. El runbook numérico conserva su advertencia sobre afiliaciones existentes.

## Evidencia aportada por el usuario

Micrositio autorizado: `https://carobrarewards.bonda.com`; identificador de micrositio: `913085`. Se registra como información del proveedor, sin visitar el sitio ni alterar configuración de ejecución.

El correo indica que `code` es obligatorio para alta API; `apellido`, `contrasena`, `email`, `nombre`, `segmentacion` son opcionales. No fue necesario inspeccionar o almacenar la clave de la captura. Los enlaces de APIs no visibles en la captura no se reconstruyeron.

El panel de Referencias describe un importador de archivos: `id-rewards` principal y campos `curp`, `email`, `nombre`, `apellido`. No prueba que esos nombres correspondan al payload HTTP. La indicación de CURP como entero es inconsistente; no se aplica. La instrucción posterior del usuario confirma que CURP debe conservarse en la ficha y contemplarse al vincular el afiliado. No se añade todavía a un payload HTTP sin contrato, ni se envían contraseñas.

## Sincronización existente (inspección de código)

- `site-backend/src/app.ts`: después de registro exitoso invoca `afterRegistration` si la aplicación está instalada. El login delega al servicio de autenticación; no sincroniza perfil. La ruta GET `coupons/affiliate-status` llama `ensureForBenefits`, por lo que tampoco es una consulta segura para pruebas reales.
- `rewards/bonda/catalog-application.ts`: catálogo de cupones verifica reglas efectivas y estado/nivel canónico; la consulta normal puede reparar afiliación. La vista previa de Inicio usa afiliado técnico y evita aprovisionar al cliente.
- `affiliate-provisioning.ts`: con bandera apagada no escribe; con bandera activa guarda pendiente, reclama trabajo, consulta existencia y crea si falta. Un registro local ACTIVE evita otra alta. Fallos de credenciales/respuesta inválida exigen acción; errores transitorios reintentan con backoff. Un fallo local después del alta se repara consultando existencia.
- `http-gateway.ts`: alta `POST /api/v2/microsite/{micrositeId}/affiliates` con `{code: rewardsId, send_welcome_email: false}`. Consulta por code. Reconoce el error documentado de code duplicado. No implementa PATCH de perfil ni contraseña, correo, CURP o segmentación.
- `persistence.ts`: unicidad por cliente, conflicto si cambia rewards_id, claims atómicos con reserva de cinco minutos y `FOR UPDATE SKIP LOCKED` para lotes. Eso controla altas/reintentos locales; no es evidencia de activación de gift cards ni confirmación de titularidad externa.

## CURP: conservación y contrato pendiente

Verificado por código, sin consultar clientes: `api/src/carobra_rewards/modules/customer_intake/infrastructure/persistence/models.py` define `customers.curp` como `String(18)`, obligatorio y único. El dominio, comandos, repositorios y registro BFF conservan CURP como string; la normalización existente solo elimina espacios externos y pasa a mayúsculas. No se modifica ese almacenamiento ni se elimina CURP de la ficha. UUID y Rewards ID siguen separados.

La ficha futura del afiliado debe contemplar CURP según la aclaración del usuario. Para implementarla hace falta un ejemplo o esquema de alta y PATCH de Nómina para este micrositio que defina **la ubicación del campo personalizado en JSON, su clave exacta y tipo textual**, más las reglas de actualización. El panel del importador no define esa estructura HTTP. No se propone `code=CURP`, `id-rewards` como propiedad API ni un contenedor inventado. La política vigente conserva envío adicional desde Oro, pendiente de controles efectivos y de confirmar ese contrato.

## Ampliación necesaria antes de conectar

La captura confirma URL y datos de alta, pero no hace falta mandar todos los campos opcionales al entrar. El alta base por code y la habilitación de gift cards son capacidades distintas. No debe dispararse una actualización en cada GET o clic.

1. Confirmar qué datos opcionales necesita este micrositio para primer acceso/recuperación usando Rewards ID, cómo se verifica al titular y si hay invitación. El flujo descrito por el usuario es introducir Número de socio y luego crear contraseña en Bonda; la verificación de titularidad sigue sin confirmar.
2. Confirmar el contrato para permitir gift cards solo desde Oro dentro de Bonda y qué ocurre al bajar de nivel. Ocultar el enlace Carobra no bloquea acceso directo al micrositio. No asumir que `segmentacion` resuelve esto sin valores/reglas acordados.
3. Implementar proyección de disponibilidad específica de backend y sincronización por cambio de identidad/nivel, sobre el mismo code; separar estado de afiliación, perfil actualizado y acceso a gift cards. Persistir revisión/idempotencia y errores sin datos crudos, reclamar una sola operación, consultar/reconciliar después de resultado ambiguo. No reutilizar `can_request_codes` de cupones como permiso de gift cards.
4. Acordar qué sucede con clientes existentes y Rewards IDs legados antes de cualquier ejecución de migración o afiliación. Evitar duplicar cuenta/historial.
5. La conversión está acordada, pero la sección no implementa transferencias/saldo compartido. Un flujo de puntos requiere su propio contrato transaccional y pruebas de recuperación, sin inferirlo de la API de Nómina.

## Vista previa reproducible

Usar Node 24. En `site-frontend`, iniciar en terminales separadas:

```sh
MOCK_SITE_BACKEND_PORT=3006 GIFT_CARD_PREVIEW=true node tests/support/mock-site-backend.mjs
SITE_BACKEND_BASE_URL=http://127.0.0.1:3006 node node_modules/astro/bin/astro.mjs dev --ignore-lock --host 127.0.0.1 --port 4326
```

Abrir `http://127.0.0.1:4326/login`. Cuenta **sintética**: `eligible@example.com`, contraseña de fixture `correct-horse-7`. Luego `http://127.0.0.1:4326/cliente/beneficios#gift-cards`. El modo de preview solo existe en el servidor de tests, muestra Oro y `123456789`; no es un bypass nuevo en la app. No usar credenciales reales. No tocar puerto 4325 del preview Skandia.

Suite aislada (requiere puertos 3006/4326 libres): `node node_modules/@playwright/test/cli.js test --config playwright.gift-cards.config.ts`. Los requests de navegador fuera de loopback se abortan durante la suite.

## Verificación realizada

- Backend TypeScript compilado; 20 pruebas de configuración, afiliación y gateway aprobadas, con transporte simulado. La primera ejecución del gateway desde la raíz no encontró fixtures; se corrigió el directorio de ejecución a site-backend y pasó completa.
- Frontend: ocho contratos aprobados; build completo con Node 24.21.0, Astro check sin errores ni warnings y función SSR verificada nodejs24.x. Astro muestra un hint por execCommand, usado únicamente como fallback de copia.
- Chromium instalado en la Mac, proyectos desktop y Pixel 5: ocho pruebas específicas aprobadas; matriz con Oro/Platino/Titanio, Bronce/Plata/Invitado, restringido, identidad ausente/legada/malformada y portal faltante. Prueba explícita de 320 px, copia canónica, rechazo del portapapeles, fallback y selección manual, clics repetidos, teclado y navegación autenticada/anónima. Sin escrituras durante copia/navegación específica.
- Regresión de Inicio, Mi cuenta, portal y Gift Cards: 58 aprobadas. Se precisaron selectores de feedback de preferencias porque ahora existe otro status accesible para copiar el número. La ejecución usa mock independiente en 3007 y frontend 4322; no se tocó el proceso ajeno de 3002. Los logs de Astro dev incluyen fallos del auditor al consultar recursos externos durante bloqueo de red; los casos y build terminaron correctamente.
- Brave nativo de la Mac, ventana privada: login sintético, Inicio, sección de Beneficios, confirmación de copia repetida y portapapeles real con 123456789. Chrome no estaba expuesto como navegador de automatización. No se abrió el micrositio ni endpoints reales.
- Capturas locales de QA en tmp/gift-card-access-qa: benefits-gift-cards desktop/móvil y gift-cards-320. Son datos sintéticos y no se incluyen en el commit.
- OpenSpec validado en modo estricto y git diff --check sin errores. Sin pruebas de servicios reales, migraciones, puntos, afiliados reales o verificación de producción.
