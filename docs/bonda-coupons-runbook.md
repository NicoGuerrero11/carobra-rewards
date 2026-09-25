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

- Una caída de Bonda no debe bloquear registro, login, nivel, puntos ni otras páginas.
- Para retirar la integración, apagar `V2_BONDA_COUPONS` y `BONDA_CATALOG_ENABLED`.
- Mantener apagadas las banderas de escritura; no borrar clientes, políticas ni registros locales.
- Rotar secretos en el gestor correspondiente y reiniciar el backend; nunca guardarlos en Git, navegador, logs o reportes.
- Tras un incidente, revisar latencia, errores del partner, antigüedad de caché y conteos del catálogo; no exponer IDs de clientes.

## Trabajo futuro separado

Afiliar clientes, solicitar códigos y consultar historial requiere otro OpenSpec con un ambiente de prueba aprobado, comportamiento idempotente, manejo de resultados ambiguos, auditoría, consentimiento operativo y rollout explícito. Este cierre de lectura no autoriza ninguna de esas acciones.
