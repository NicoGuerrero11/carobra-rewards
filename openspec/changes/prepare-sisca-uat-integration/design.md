## Context

Rewards ya contiene el adaptador de validación SISCA y el flujo de alta de
clientes. Railway Pro fue aprobado para hospedar la API y Rewards ya recibió
100 CURPs identificadas para el piloto. SISCA confirmó que no requiere un
ambiente UAT separado: permitirá pruebas controladas contra su API operativa,
con una API Key exclusiva para Rewards y habilitación gradual del consumo.

La integración mantiene un único sentido: la API de Rewards consulta la API
de SISCA con el CURP del cliente. SISCA no consume una API de Rewards. El
mismo código se usará en UAT y producción, con runtimes, bases de datos,
secretos y registros separados. El endpoint de SISCA podrá ser el mismo cuando
sea el único ofrecido por el partner, pero UAT sólo lo usará con autorización,
credencial y CURPs de prueba controladas.

## Goals / Non-Goals

### Goals

- Definir junto con el equipo de Rewards la plataforma y el modelo de
  despliegue para UAT y producción antes de aprovisionar infraestructura.
- Dejar una API UAT aislada, desplegable, observable y capaz de realizar
  llamadas salientes a SISCA.
- Ejecutar las comprobaciones H24, D3 y D5 de forma acelerada y controlada
  únicamente sobre datos sintéticos en UAT.
- Obtener evidencia trazable, sin exponer CURP ni secretos, para los 100
  clientes de prueba.
- Entregar a SISCA una guía breve para preparar el acceso de pruebas controladas.

### Non-Goals

- Elegir unilateralmente un proveedor de hosting o desplegar en producción
  antes de la decisión conjunta.
- Conectar producción, usar datos reales o intercambiar credenciales
  productivas durante UAT.
- Cambiar el contrato canónico de consulta de SISCA ni invertir la dirección
  de la integración.
- Implementar funcionalidad comercial de Rewards fuera de este piloto.

## Decisions

### 1. Un código, dos entornos operativos aislados

UAT y producción usarán el mismo artefacto de API y el mismo adaptador SISCA.
Cada entorno tendrá su propio endpoint SISCA, base de datos, credenciales,
secretos, registros y configuración. Esto permite probar el camino que se
promoverá sin convertir los datos o incidentes de UAT en riesgo productivo.

### 2. Railway Pro alojará las APIs UAT y de producción

Rewards aprobó Railway Pro como plataforma para la API que consulta SISCA. Se
desplegarán servicios separados, `api-uat` y `api-production`, a partir del
mismo artefacto versionado. Cada servicio tendrá una configuración, dominio,
base de datos, credenciales, secretos y registros propios. La API UAT será el
entorno persistente de pruebas de integración y sólo usará datos sintéticos.

La especificación final de SISCA no exige allowlist de IP, VPN, red privada ni
certificado de cliente. No se activará una IPv4 estática sin un requisito
posterior por escrito; la API Key exclusiva es el mecanismo de autenticación. La región, propietario
operativo, presupuesto, mecanismo concreto de secretos, HTTPS, monitoreo,
respaldos y reversión se registrarán antes del aprovisionamiento; la selección
de Railway no autoriza todavía conexiones SISCA ni credenciales productivas.

### 3. UAT de Rewards prueba de forma controlada contra la API operativa de SISCA

SISCA no ofrecerá inicialmente un runtime UAT separado. `api-uat` permanecerá
aislada de la producción de Rewards, pero podrá consultar el host operativo de
SISCA únicamente después de configurar la API Key exclusiva, la allowlist
local del host, las 100 CURPs identificadas y la autorización escrita del
piloto. El adaptador permanecerá simulado mientras falte cualquiera de esos
elementos. La habilitación normal posterior ocurrirá sólo después de conciliar
los cinco casos de humo y el lote restante.

### 4. Las comprobaciones aceleradas conservan la semántica del ciclo de vida

En UAT existirá un mecanismo explícitamente autorizado para ejecutar H24,
D3 y D5 sobre casos sintéticos sin esperar 24, 72 y 120 horas reales. Este
mecanismo utilizará el mismo servicio de validación, gateway SISCA,
normalización de respuestas, reintentos y auditoría que el flujo regular. Sus
ejecuciones quedarán marcadas como controladas de UAT y estarán bloqueadas en
producción.

### 5. La evidencia se identifica por caso opaco, no por CURP

El seguimiento almacenará identificadores internos del caso, del cliente y de
la validación, checkpoint, hora, resultado esperado/observado, referencia
opaca de solicitud y error seguro cuando aplique. No registrará CURP completos
ni cabeceras de autenticación.

### 6. El lote se ejecuta con una puerta de humo

Primero se probarán cinco clientes sintéticos representativos. Sólo tras
conciliar los resultados entre Rewards y SISCA se habilitarán los 95 restantes
en lotes controlados. Así se detectan discrepancias de red, autenticación o
catálogo antes de multiplicarlas.

## Risks / Trade-offs

- La elección de hosting puede demorar el inicio; se mitiga convirtiéndola en
  el primer punto de decisión y usando criterios de aceptación concretos.
- SISCA puede agregar requisitos de red o cambiar el contrato confirmado; el
  adaptador real sólo se activa con configuración versionada y conectividad probada.
- Un atajo de tiempo mal protegido podría afectar producción; por ello el
  controlador acelerado será UAT-only, autorizado y auditado.
- El volumen o los límites de SISCA pueden producir errores transitorios; los
  lotes y la reconciliación permiten pausar y reintentar con evidencia.
- Los datos de prueba pueden ser sensibles si se registran sin control; los
  tableros y logs usarán referencias opacas y políticas de redacción.

## Migration Plan

1. Registrar la decisión conjunta de hosting y los responsables.
2. Aprovisionar UAT separado y el esqueleto de producción, sin activar SISCA
   productivo.
3. Configurar secretos, migraciones, salud, registros y salida de red de UAT.
4. Implementar y verificar el controlador de checkpoints acelerados y la
   evidencia de ejecución.
5. Desplegar la API UAT y validar su funcionamiento interno.
6. Entregar la guía a SISCA, intercambiar la API Key por canal seguro y realizar la prueba de
   humo con cinco casos.
7. Ejecutar y conciliar los 95 casos restantes.
8. Aplicar la puerta de salida UAT antes de habilitar la configuración y el
   despliegue productivos.

La reversión de UAT consiste en deshabilitar el controlador acelerado y las
llamadas salientes, conservando la evidencia. La reversión productiva deberá
desactivar la configuración SISCA de producción y restaurar el artefacto
previamente aprobado.

## Open Questions

- ¿Quiénes estarán autorizados para ejecutar checkpoints acelerados?
- ¿Qué canal seguro se usará para compartir endpoint, credenciales e IDs de
  los clientes sintéticos?
