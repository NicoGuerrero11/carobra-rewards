# Catálogo de beneficios Bonda

**Estado:** lectura habilitada para el catálogo aprobado

**Alcance:** catálogo, detalle, imágenes, información de marca y sucursales

**Sin escrituras:** afiliación, códigos, historial, puntos y gift cards

## Responsabilidades

- Carobra conserva autenticación, Rewards ID, nivel, elegibilidad, interfaz y puntos.
- Bonda es fuente de contenido actual para los identificadores aprobados.
- El backend de Carobra agrega las credenciales, normaliza la respuesta y aplica la política de nivel.
- El navegador nunca recibe secretos, payloads crudos, HTML de Bonda ni URLs internas sin validar.
- Listar, abrir o explorar sucursales no lee ni modifica el ledger de puntos.

## Configuración

El catálogo usa controles independientes de cualquier escritura:

```dotenv
BONDA_BASE_URL=https://host-aprobado-por-bonda.example
BONDA_ALLOWED_HOSTS=host-aprobado-por-bonda.example
BONDA_ALLOWED_IMAGE_HOSTS=host-de-imagenes-aprobado.example
BONDA_REQUEST_TIMEOUT_MS=5000
BONDA_MICROSITE_ID=
BONDA_COUPON_API_KEY=
BONDA_CATALOG_AFFILIATE_CODE=990910001
BONDA_CATALOG_ENABLED=true
BONDA_COURSES_ENABLED=true
BONDA_AFFILIATE_PROVISIONING_ENABLED=false
BONDA_COUPON_REQUESTS_ENABLED=false
```

La regla versionada `V2_BONDA_COUPONS` controla la disponibilidad del catálogo para clientes. Activarla no habilita afiliación, emisión de códigos, historial, gift cards ni puntos. Las dos banderas de escritura deben permanecer en `false` hasta que un cambio independiente defina pruebas, idempotencia, auditoría y despliegue.

## Política del catálogo

La presentación originó 25 candidatos entre Bronce y Titanio. La conciliación de sólo lectura del 2026-09-10 devolvió 1,272 ofertas: 7 marcas con una coincidencia exacta, 2 con varias ofertas y 16 ausentes. El catálogo aprobado contiene 12 identificadores Bonda exactos. Las ofertas distintas de una misma marca se muestran como cards independientes.

No hay cupones para Invitado. El acceso es acumulativo:

- Bronce ve sus identificadores aprobados.
- Plata agrega los de Plata y conserva Bronce.
- Oro, Platino y Titanio continúan la misma regla.

Los nombres sólo ayudan a conciliar. Una oferta se publica únicamente con su ID Bonda exacto, nivel mínimo, orden y versión aprobados. Si desaparece, vence o cambia, se omite hasta revisión; nunca se sustituye automáticamente.

## Identidad técnica de lectura

`990910001` es un afiliado técnico no asociado a un cliente. Se usa sólo para leer catálogo, detalle, imágenes, marca y sucursales. No se usa para representar al usuario, darlo de alta, emitir códigos ni consultar historial.

Para una conciliación controlada:

```bash
cd site-backend
npm run bonda:reconcile -- --affiliate-code 990910001
```

El comando produce un reporte de coincidencias, faltantes, duplicados, cambios y vencimientos; no publica por nombre ni modifica Bonda.

## Rendimiento y degradación

- El backend consulta únicamente los IDs aprobados con concurrencia acotada.
- Catálogo y detalle comparten trabajo en curso y contenido validado durante cinco minutos.
- El detalle principal no espera el directorio de sucursales.
- Sucursales se precargan después y el mapa sólo se descarga al abrir el modal.
- Si Bonda no responde y no hay caché válida, se muestra un estado reintentable sin inventar contenido.

## Verificación operativa

### Preflight de conexión antes de una demo o despliegue

Con las variables del entorno ya inyectadas por el gestor de secretos:

```bash
cd site-backend
npm run bonda:check
```

Para usar el `.env` local (Node 20.6 o posterior), sin copiar secretos a argumentos ni cargar el servidor:

```bash
cd site-backend
npm run build
node --env-file=.env dist/src/rewards/bonda/connection-check-cli.js
```

El archivo debe contener ambas banderas de lectura habilitadas. Si el arranque local inyecta `BONDA_COURSES_ENABLED=true` fuera del archivo, se debe pasar también esa misma variable al diagnóstico. El comando no habilita integraciones por su cuenta. No se debe versionar el `.env`.

El resultado es JSON: `ready: true` y salida `0` sólo cuando pasan los cuatro checks; cualquier fallo produce salida `1`. Comprueba la existencia del afiliado técnico, el cupón aprobado `9510`, un capítulo del manifiesto de cursos y uno del manifiesto de bienestar. Son cuatro peticiones GET concurrentes, sin base de datos, creación de afiliados, emisión de códigos, correos ni cambios de puntos o avances. Cada consulta tiene un máximo de 10 segundos (o el timeout configurado si es menor) y 1 MB de respuesta. No se siguen redirecciones ni se imprimen secretos, URLs autenticadas o respuestas crudas.

El endpoint de afiliados usa `BONDA_AFFILIATE_TOKEN` si está configurado; de lo contrario usa `BONDA_COUPON_API_KEY`, como en la configuración compartida actual de Carobra. Esto no implica que cualquier clave de contenido tenga permisos de nómina. Si sólo falla `affiliate` con 401/403 y los tres checks de contenido pasan, confirmar el token y su permiso de consulta con Bonda; no habilitar escrituras para resolverlo.

| Código | Interpretación y siguiente paso |
| --- | --- |
| `CONFIGURATION_REQUIRED` | Revisar host HTTPS permitido, clave, micrositio, afiliado técnico y banderas de lectura. No se hicieron peticiones. No usar vista previa ficticia. |
| `TECHNICAL_AFFILIATE_MISSING` | El endpoint de afiliados devolvió explícitamente `USER_NOT_FOUND`. Seguir la recuperación autorizada de abajo. |
| `AUTHORIZATION_REJECTED` | Credencial o permiso rechazado en ese endpoint. No demuestra por sí solo que la clave sea incorrecta ni que falte el afiliado. |
| `RESOURCE_UNAVAILABLE` / `INVALID_RESPONSE` | Revisar recurso aprobado, endpoint y contrato de respuesta; no sustituir contenido automáticamente. |
| `PARTNER_UNAVAILABLE` / `TIMEOUT` | Revisar conectividad, límites o disponibilidad de Bonda; reintentar después de investigar. |
| `REDIRECT_REJECTED` / `RESPONSE_TOO_LARGE` | Se detuvo una respuesta insegura o fuera de límites; revisar con el proveedor. |

Este comando es una comprobación puntual, no un monitor ni una recuperación automática. Debe ejecutarse como paso previo a la demo/despliegue; no se añade al arranque del servidor ni al CI por defecto. Un resultado correcto verifica muestras de la conexión externa, no todas las ofertas, políticas locales, permisos por nivel ni la reproducción en navegador. Continuar con la revisión del sitio:

Antes y después de un despliegue:

1. confirmar que `BONDA_AFFILIATE_PROVISIONING_ENABLED=false`;
2. confirmar que `BONDA_COUPON_REQUESTS_ENABLED=false`;
3. verificar que el afiliado técnico configurado sea `990910001`;
4. revisar conteos de políticas aprobadas y resultados omitidos, sin imprimir secretos ni datos de clientes;
5. probar un usuario por nivel y confirmar la acumulación;
6. probar Invitado, Inactive y Blocked sin catálogo disponible;
7. abrir detalle, imágenes, texto extenso y sucursales;
8. confirmar que los saldos disponibles y reservados no cambiaron.

## Incidentes y rollback

### Afiliado técnico ausente: incidente del 2026-09-25

Los endpoints de cupones y actividades devolvían `AuthorizationException` aunque la clave configurada coincidía con la proporcionada por Bonda. La consulta de nómina del afiliado técnico devolvió `404 USER_NOT_FOUND`. Tras recuperar exclusivamente esa identidad con autorización explícita, las lecturas volvieron a responder correctamente y se verificaron cupones, cursos y bienestar para Oro y Titanio. No se determinó por qué había desaparecido la identidad; no atribuirlo a caducidad o rotación de la clave sin evidencia.

Procedimiento si se repite:

1. Ejecutar el preflight con la configuración vigente. Un 404 genérico o un error de autorización de contenido no bastan para afirmar que falta el afiliado.
2. Si nómina confirma `USER_NOT_FOUND`, comprobar micrositio y código técnico aprobados. No usar identificadores de clientes ni cambiar niveles para sortear el error.
3. Obtener autorización explícita para recuperar **sólo** el afiliado técnico. No activar las banderas globales de afiliación ni emisión de cupones. Si falta permiso de consulta/alta, coordinar con Bonda en vez de cambiar claves por prueba y error.
4. Un operador autorizado puede usar la API de nómina aprobada (`POST /api/v2/microsite/{micrositeId}/affiliates`) con el token del gestor de secretos y el cuerpo mínimo `{ "code": "990910001", "send_welcome_email": false }`. No enviar datos personales, contraseñas ni correos. El diagnóstico no ejecuta este POST.
5. Verificar la existencia con GET. Si el POST tuvo un resultado ambiguo, consultar primero; no repetir altas a ciegas ni recrear una identidad que ya existe.
6. Repetir `bonda:check` y verificar los catálogos y un detalle reproducible con cuentas de revisión Oro y Titanio, sin canjear, marcar avances ni alterar puntos. Mantener las banderas de escritura apagadas.

Versionar este procedimiento y el diagnóstico ayuda a detectar y resolver la recurrencia, pero no evita que Bonda cambie o elimine una identidad externa.

- Una caída de Bonda no debe bloquear registro, login, nivel, puntos ni otras páginas.
- Para retirar la integración, apagar `V2_BONDA_COUPONS` y `BONDA_CATALOG_ENABLED`.
- Mantener apagadas las banderas de escritura; no borrar clientes, políticas ni registros locales.
- Rotar secretos en el gestor correspondiente y reiniciar el backend; nunca guardarlos en Git, navegador, logs o reportes.
- Tras un incidente, revisar latencia, errores del partner, antigüedad de caché y conteos del catálogo; no exponer IDs de clientes.

## Trabajo futuro separado

Afiliar clientes, solicitar códigos y consultar historial requiere otro OpenSpec con un ambiente de prueba aprobado, comportamiento idempotente, manejo de resultados ambiguos, auditoría, consentimiento operativo y rollout explícito. Este cierre de lectura no autoriza ninguna de esas acciones.
