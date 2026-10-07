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
