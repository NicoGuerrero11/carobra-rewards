# Integración de cupones Bonda

**Estado:** implementada detrás de controles deshabilitados
**Alcance:** afiliados, cupones y descuentos gratuitos por nivel
**Fuera de alcance:** gift cards, API de puntos, micrositio, cursos y Despegar

## Responsabilidades

- Carobra conserva autenticación, Rewards ID, nivel, elegibilidad, experiencia web,
  comunicaciones y puntos.
- Bonda recibe únicamente el Rewards ID como código de afiliado. El alta envía
  `send_welcome_email=false`; no envía nombre, email, CURP, teléfono ni dirección.
- Bonda entrega catálogo, detalle, condiciones, vigencia y códigos de cupones.
- Los cupones son gratuitos. Listarlos, abrirlos o solicitar un código no lee ni
  modifica el ledger de puntos.
- Los gift cards y cualquier descuento de puntos se diseñarán en otro cambio.

## Controles de activación

Las capacidades están separadas y apagadas de forma predeterminada:

```dotenv
BONDA_BASE_URL=https://host-aprobado-por-bonda.example
BONDA_ALLOWED_HOSTS=host-aprobado-por-bonda.example
BONDA_ALLOWED_IMAGE_HOSTS=host-de-imagenes-aprobado.example
BONDA_REQUEST_TIMEOUT_MS=5000
BONDA_MICROSITE_ID=
BONDA_COUPON_API_KEY=
BONDA_AFFILIATE_TOKEN=
BONDA_CATALOG_ENABLED=false
BONDA_AFFILIATE_PROVISIONING_ENABLED=false
BONDA_COUPON_REQUESTS_ENABLED=false
```

También existe la regla versionada `V2_BONDA_COUPONS`. Debe permanecer
deshabilitada y sin aprobación productiva hasta completar el gate de pruebas. La
API de cupones y la API de afiliados mantienen variables y controles separados.
Bonda entregó a Carobra un único secreto que autenticó ambos contratos en una
prueba controlada; cuando corresponda puede configurarse el mismo valor en ambos
campos sin unir sus feature flags ni exponerlo al navegador.

## Catálogo Carobra

La presentación aprobada se cargó como 25 candidatos deshabilitados:

- Bronce: Cinépolis, Toks, Farmacias Benavides, Smart Fit y Laboratorio Chopo.
- Plata: Ópticas Devlyn, Harmon Hall, Martí, Chili's y Green Yoga.
- Oro: Sonora Prime, La Docena, Salomon, Lacoste y Sephora.
- Platino: Mochomos, Porfirio's, Michael Kors, Coach y Marriott.
- Titanio: Harry's, Hugo Boss, El Palacio de Hierro, Aeroméxico Premier y Live Aqua.

No existe ningún cupón de Invitado. Cada elemento publicado necesita el ID exacto
de Bonda, nivel mínimo, acceso acumulable y orden. Un nombre parecido no se publica
automáticamente.

Con configuración segura y un Rewards ID técnico de prueba:

```bash
cd site-backend
npm run bonda:reconcile -- --affiliate-code RWD-PRUEBA
```

El reporte clasifica coincidencias propuestas, faltantes, nombres duplicados,
contenido cambiado y vencidos. La persona responsable del catálogo debe revisar
y versionar los IDs aceptados.

## Hallazgos de conciliación inicial

Una consulta real de sólo lectura devolvió 1,272 beneficios con imagen. Al
compararlos contra las 25 marcas propuestas se encontraron 7 coincidencias
exactas, 2 marcas con varias ofertas y 16 marcas ausentes. Un afiliado técnico
numérico recibió el mismo catálogo, por lo que los faltantes no dependen del
código genérico de lectura.

El micrositio aceptó el afiliado técnico numérico, pero rechazó el formato
alfanumérico actual `RWD-...`. No se debe transformar el Rewards ID ni enviar
CURP u otro identificador como sustituto sin una decisión separada.

## Afiliación y recuperación

El registro en Carobra nunca se revierte por una caída de Bonda. La afiliación
queda `PENDING`, se reintenta con backoff limitado y pasa a `ACTIVE` cuando Bonda
confirma el Rewards ID. Credenciales inválidas o respuestas no interpretables pasan
a `ACTION_REQUIRED` sin reintentos infinitos.

El acceso autenticado a Beneficios repara registros locales faltantes. Para trabajo
operativo se usan lotes de máximo 100:

```bash
cd site-backend

# Vista previa: no escribe ni llama a Bonda
npm run bonda:affiliates -- --mode backfill --limit 25

# Alta controlada de clientes faltantes
npm run bonda:affiliates -- --mode backfill --limit 25 --apply

# Procesar reintentos vencidos
npm run bonda:affiliates -- --mode retry --limit 25 --apply
```

## Solicitud de códigos

Cada solicitud tiene un `external_id` local único y un registro de auditoría sin
credenciales ni datos personales. Antes de llamar a Bonda, Carobra vuelve a validar:

1. cuenta activa y nivel canónico V2;
2. afiliación Bonda activa;
3. política Carobra aprobada para el ID exacto;
4. presencia y vigencia actual del cupón en Bonda.

Un timeout posterior al envío queda `VERIFICATION_REQUIRED`. No se repite a ciegas:
se compara con el historial de cupones recibidos y sólo se resuelve automáticamente
cuando existe una coincidencia única y conservadora.

## Gate antes de habilitar clientes

Faltan tres dependencias externas y operativas:

1. resolver la compatibilidad entre el Rewards ID alfanumérico y la validación
   numérica actual del micrositio Bonda;
2. recibir y permitir explícitamente el host del ambiente de pruebas, su micrositio
   y el procedimiento de afiliado técnico;
3. aprobar los IDs exactos de las coincidencias, resolver las ofertas duplicadas
   y definir qué hacer con las marcas ausentes.

Después se ejecuta una prueba sin datos reales que cubra alta, duplicado, caída,
reintento, niveles Bronce–Titanio, código exitoso, límite, inventario, timeout
ambiguo e historial. Sólo con evidencia aprobada se habilitan, en orden:

1. afiliación en pruebas;
2. lectura de catálogo en pruebas;
3. solicitud de códigos en pruebas;
4. `V2_BONDA_COUPONS`;
5. backfill productivo en lotes pequeños.

## Incidentes y rollback

- Ante una caída de Bonda, no se bloquea registro, login, nivel, puntos ni el resto
  del portal. Se muestra un estado temporal y se conserva la auditoría segura.
- Si falla afiliación, se revisan conteos `PENDING` y `ACTION_REQUIRED`; no se crean
  clientes nuevos ni Rewards IDs nuevos.
- Si falla catálogo o códigos, se deshabilita sólo la capacidad correspondiente.
- El rollback inmediato consiste en apagar `V2_BONDA_COUPONS` y las tres variables
  de capacidad. No se borran afiliados ni auditorías.
- Las credenciales se rotan en el gestor de secretos y después se reinicia el BFF;
  nunca se guardan en Git, logs, navegador o reportes.
- Después de cualquier incidente se confirma que los saldos disponibles y reservados
  de puntos no cambiaron por actividad de cupones.
