# Operación del piloto controlado SISCA

Este directorio concentra los registros compartibles del piloto. No agregues
CURP completos, cabeceras, tokens, contraseñas ni cuerpos de respuesta SISCA.
Los valores sensibles viven exclusivamente en el gestor de secretos y en el
canal seguro acordado con SISCA.

SISCA confirmó que las pruebas se ejecutarán contra su API operativa, no contra
un ambiente UAT separado. Rewards usará un runtime `api-uat`, una base de datos
aislada, una API Key exclusiva y únicamente las 100 CURPs identificadas por el
equipo. El adaptador HTTP permanece deshabilitado hasta recibir la
especificación técnica y la credencial por un canal seguro.

## Contrato preliminar confirmado

- Respuesta JSON con `success`, `codigo`, `mensaje` y `data`.
- `SIN_INFORMACION` usa HTTP 200 y `data: null`; no es una falla técnica.
- `OK` devuelve un único registro con movimiento, estatus y fecha de traspaso.
- SISCA seleccionará de forma determinista el registro más actual cuando haya
  más de uno; el criterio exacto debe aparecer en la especificación final.
- Límite inicial de 60 solicitudes por minuto y reconsultas permitidas.
- Autenticación mediante API Key exclusiva; header y endpoint pendientes.

## Archivos

- `synthetic-case-manifest.csv`: registro de los 100 casos mediante IDs opacos.
- `expected-outcomes.csv`: matriz de resultados esperados por checkpoint.
- `execution-evidence.csv`: evidencia observada y referencias de correlación.
- `open-incidents.csv`: discrepancias que impiden continuar un lote.

## Puerta de humo

1. Cargar cinco casos representativos y marcar `smoke=true`.
2. Confirmar que el manifiesto, la matriz y el endpoint autorizado fueron revisados.
3. Ejecutar H24, D3 y D5 mediante el control UAT autorizado.
4. Registrar sólo `case_id`, resultado normalizado, estado y `request_id`.
5. Conciliar cada resultado con SISCA usando referencias opacas.
6. El coordinador autoriza el lote de 95 sólo si no quedan incidencias abiertas.

## Lotes y reintentos

- Ejecutar lotes de tamaño acordado con SISCA y respetar su límite de tasa.
- Ante una discrepancia, pausar los siguientes lotes y abrir una fila en
  `open-incidents.csv`.
- Reintentar únicamente fallos técnicos marcados como reintentables por la API;
  no repetir resultados de negocio ni estados terminales.
- Conservar el `request_id` original y el del reintento para conciliación.

## Reporte de cierre

El cierre compara las 300 expectativas (100 casos × H24/D3/D5) contra la
evidencia observada. Debe incluir: total esperado, total ejecutado,
coincidencias, discrepancias resueltas, incidencias abiertas, fecha UTC y
aprobación del coordinador. La salida UAT queda bloqueada si falta evidencia,
existe una incidencia abierta o no hay aceptación explícita.
