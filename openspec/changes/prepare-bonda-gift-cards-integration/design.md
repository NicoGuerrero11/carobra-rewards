# Alcance vigente autorizado

La sección Gift Cards se muestra en Carobra solo para journey ACTIVE desde Oro, con catálogo completo y conversión informativa 3 puntos = $1 MXN. Enlaza al micrositio confirmado https://carobrarewards.bonda.com sin identidad, credenciales ni autologin. La regla de nivel no restringe Bonda: al descender se oculta la sección y se conserva la afiliación externa. Un número faltante impide el enlace; no se exige un permiso externo específico de gift cards.

Número de socio Rewards usa rewards_id numérico existente, agrupado de tres en tres y copiado canónico en Inicio, Mi cuenta y sección Bonda. No se cambia UUID, CURP o ID.

El usuario autorizó flujo en dos etapas: alta base solo code desde cliente/journey ACTIVE Bronce+; enriquecimiento de email/nombre/apellido/curp al alcanzar Oro. Los datos permanecen en Carobra antes del umbral. El payload base se conserva; se corrige el disparador previo de registro para no afiliar Invitados. El nuevo worker exige afiliación ACTIVE coincidente, lee perfil/nivel canónicos y envía solo cambios. No crea afiliados, revoca acceso ni borra datos por descenso.

Persistencia PostgreSQL preparada con migración 027, cola generacional, captura transaccional deshabilitada, leases con fencing, checkpoints HMAC y conciliación auditada por operación. Composición y CLI acotada preparadas sin scheduler activo. Contrato pendiente, captura false y bandera false impiden envíos. PATCH requiere confirmar campos aceptados y CURP textual de 18 caracteres; opcionalidad en POST no prueba actualización. No se inventa lectura de campos desde GET ni se interpreta 404 como ausencia confirmada.

Las pruebas utilizan transportes sintéticos y PGlite aislado, incluyendo reinicio/leases/eventos/conciliación. No se ejecutan migraciones reales ni llamadas operativas. Activación posterior requiere contrato, secreto HMAC, migración y decisión de operación. No push, PR ni deploy. Evidencia detallada y comandos: docs/bonda-gift-card-access-local.md.

## Exclusión y recuperación

La intención se guarda antes de enviar; resultado ambiguo exige conciliación. APPLIED conserva digests confirmados; NOT_APPLIED autoriza reintento. Auditoría única y operation ID rechazan revisión contradictoria/obsoleta. Ambos reencolan para no perder cambios posteriores. El token del lease impide escrituras tardías y liberación de un sucesor. Eventos contienen solo identificador/generación, nunca perfil crudo. El worker confirma únicamente la generación observada.

## Separación de capacidades

La navegación pública no depende de permisos de cupones ni del enriquecimiento. El alta base sigue sus controles existentes. La aplicación de ficha conserva métodos HTTP aislados para pruebas; el runtime solo usa PATCH sobre afiliados confirmados. Envío adicional desde Oro es minimización de datos acordada por el usuario, no restricción de acceso externo.

## Primera afiliación desde Bronce

La condición canónica Bronce+ se aplica en registro, endpoint de estado, reintentos y backfill. Un afiliado ACTIVE existente se preserva al descenso sin recreación. Migración 028 agrega cola transaccional de cambios de nivel/estado con captura false y worker acotado, conectado a composición/CLI pero sin programación activa. Cualquier primer producto que produzca Bronce canónico puede disparar afiliación mínima; no depende exclusivamente de Afore. La captura y procesamiento de ficha Oro+ siguen separados. Pruebas sintéticas usan motor real, SQL aislado y transporte simulado. Las cuentas por nivel del usuario son productivas y se excluyen de pruebas.

## Puntos: outbox por premio, autoridad Bonda

Migration 029 captures positive ISSUANCE in its source transaction regardless of dispatch flags. One credit row per ledger entry, not accumulated account snapshots. Before POST, a fenced lease persists an operation and the exact microsite/source/destination/code/amount; unknown outcomes remain VERIFICATION_REQUIRED and are excluded from retries. Known documented rejections may retry. Confirmed partner movement IDs are unique per source wallet/site. Operator review is operation-scoped and audited, and APPLIED verifies exact remote movement. Historical catch-up requires explicit operator confirmation that remaining unexpired lots were not previously credited.

300 local points maps to each_amount 300. Canonical ACTIVE Gold+, existing affiliation, matching email and an intact unexpired source lot are checked before dispatch and after wallet lookup. Credit never debits local ledger. Remote spending never mutates local ledger based on balance difference. Local earnings/lot provenance and progression remain distinct from Bonda spendable balance.

The query composition adds optional points.bonda, returning exact strings, pending, verification-required, timestamp and freshness. Persistent identity-bound cache lasts 60s, stale data remains explicitly labeled, missing data is null, confirmed zero is zero. Reads coalesce in-process and cannot invoke credit processing. All flags default false and no scheduling, credentials or real migration is performed. External expiration/cashback/purchases remain specific integration dependencies; existing local notification windows 60/30 differ from master 30/15/1 and are documented without changing award rules here.
