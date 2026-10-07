# Alcance vigente autorizado

La sección Gift Cards se muestra en Carobra solo para journey ACTIVE desde Oro, con catálogo completo y conversión informativa 3 puntos = $1 MXN. Enlaza al micrositio confirmado https://carobrarewards.bonda.com sin identidad, credenciales ni autologin. La regla de nivel no restringe Bonda: al descender se oculta la sección y se conserva la afiliación externa. Un número faltante impide el enlace; no se exige un permiso externo específico de gift cards.

Número de socio Rewards usa rewards_id numérico existente, agrupado de tres en tres y copiado canónico en Inicio, Mi cuenta y sección Bonda. No se cambia UUID, CURP o ID.

El usuario autorizó flujo en dos etapas: alta base solo code desde cliente/journey ACTIVE Bronce+; enriquecimiento de email/nombre/apellido/curp al alcanzar Oro. Los datos permanecen en Carobra antes del umbral. El payload base se conserva; se corrige el disparador previo de registro para no afiliar Invitados. El nuevo worker exige afiliación ACTIVE coincidente, lee perfil/nivel canónicos y envía solo cambios. No crea afiliados, revoca acceso ni borra datos por descenso.

Persistencia PostgreSQL preparada con migración 027, cola generacional, captura transaccional deshabilitada, leases con fencing, checkpoints HMAC y conciliación auditada por operación. Composición y CLI acotada preparadas sin scheduler activo. Contrato pendiente, captura false y bandera false impiden envíos. PATCH requiere confirmar campos aceptados y CURP textual de 18 caracteres; opcionalidad en POST no prueba actualización. No se inventa lectura de campos desde GET ni se interpreta 404 como ausencia confirmada.

Las pruebas utilizan transportes sintéticos y PGlite aislado, incluyendo reinicio/leases/eventos/conciliación. No se ejecutan migraciones reales ni llamadas operativas. Activación posterior requiere contrato, secreto HMAC, migración y decisión de operación. No push, PR ni deploy. Evidencia detallada y comandos: docs/bonda-gift-card-access-local.md.

## Primera afiliación desde Bronce

La condición canónica Bronce+ se aplica en registro, endpoint de estado, reintentos y backfill. Un afiliado ACTIVE existente se preserva al descenso sin recreación. Migración 028 agrega cola transaccional de cambios de nivel/estado con captura false y worker acotado, conectado a composición/CLI pero sin programación activa. Cualquier primer producto que produzca Bronce canónico puede disparar afiliación mínima; no depende exclusivamente de Afore. La captura y procesamiento de ficha Oro+ siguen separados. Pruebas sintéticas usan motor real, SQL aislado y transporte simulado. Las cuentas por nivel del usuario son productivas y se excluyen de pruebas.
