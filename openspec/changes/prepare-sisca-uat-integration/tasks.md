## 1. Decisión conjunta de hosting y operación

- [x] 1.1 Definir con el equipo de Rewards dónde se alojarán la API UAT y la API de producción, comparando las opciones disponibles con los criterios del diseño.
- [x] 1.2 Registrar la decisión de hosting con plataforma, región, responsables, presupuesto/propietario, base de datos, secretos, HTTPS, monitoreo, respaldos y reversión.
- [x] 1.3 Confirmar si SISCA exige allowlist de IP, VPN o red privada y, sólo en ese caso, definir la identidad de salida de UAT y producción que deberá autorizar.
- [ ] 1.4 Aprobar los responsables autorizados para operar UAT, ejecutar checkpoints acelerados y aprobar el paso a producción.

## 2. Preparación de entornos y despliegue

- [x] 2.1 Crear la infraestructura aislada de UAT conforme a la decisión de hosting, incluyendo base de datos, dominio HTTPS y acceso operativo.
- [x] 2.2 Preparar el entorno de producción separado, sin habilitar aún credenciales ni llamadas SISCA productivas.
- [x] 2.3 Configurar endpoint, autenticación, timeout, reintentos y catálogo SISCA de UAT mediante el mecanismo aprobado de secretos.
- [x] 2.4 Implementar validaciones que impidan usar un endpoint SISCA productivo o secretos productivos desde UAT.
- [x] 2.5 Automatizar el despliegue de la API y las migraciones para que UAT y producción usen el mismo artefacto versionado.
- [x] 2.6 Verificar salud, migraciones, HTTPS, registros seguros y conectividad saliente desde UAT antes de solicitar acceso a SISCA.

## 3. Ejecución controlada de validaciones UAT

- [x] 3.1 Diseñar el control UAT-only para representar H24, D3 y D5 como 24, 72 y 120 horas de ciclo de vida simulado.
- [x] 3.2 Implementar la autorización y el bloqueo en producción para el control de checkpoints acelerados.
- [x] 3.3 Enrutar los checkpoints controlados por el mismo servicio, gateway SISCA, normalización, reintentos y transiciones del flujo normal.
- [x] 3.4 Registrar en auditoría el operador, caso, checkpoint, hora, resultado y referencia opaca de cada ejecución controlada.
- [x] 3.5 Añadir pruebas automatizadas de H24, D3, D5, estados terminales, rechazo en producción y redacción de datos sensibles.
- [x] 3.6 Disparar una consulta SISCA inicial después del registro confirmado, conservar el alta ante fallos externos y devolver al sitio el estado resultante.

## 4. Orquestación y evidencia del piloto de 100 clientes

- [x] 4.1 Definir el formato de carga o registro para los 100 clientes sintéticos y sus identificadores internos opacos.
- [ ] 4.2 Crear la matriz de casos que asocie cada cliente sintético con resultados esperados de SISCA en H24, D3 y D5.
- [x] 4.3 Crear el registro de evidencia por caso y checkpoint, sin CURP completos, cabeceras ni secretos.
- [x] 4.4 Preparar el procedimiento para los cinco casos de humo y el criterio explícito para autorizar los 95 restantes.
- [x] 4.5 Preparar la ejecución en lotes, pausa ante discrepancias, reintentos seguros y conciliación Rewards-SISCA.
- [x] 4.6 Definir el reporte de cierre que compare los 100 resultados esperados contra los observados y liste incidencias abiertas.

## 5. Habilitación de SISCA para UAT

- [ ] 5.1 Revisar y completar la guía de preparación UAT para SISCA con el contrato vigente, datos de conexión requeridos y canal de soporte.
- [x] 5.2 Solicitar a SISCA endpoint, método de autenticación, requisitos de red, límites de tasa, contacto técnico y contrato de respuestas para pruebas controladas.
- [ ] 5.3 Acordar un canal seguro para el intercambio de credenciales, referencias de clientes sintéticos y resultados de conciliación.
- [x] 5.4 Ejecutar un smoke test con un CURP sintético aprobado y conciliar la referencia de solicitud y el resultado con SISCA.
- [x] 5.5 Ejecutar los cinco casos de humo, documentar su conciliación y autorizar o pausar el lote de 95 casos restantes.

## 6. Cierre UAT y preparación de producción

- [x] 6.1 Verificar la puerta de salida UAT: conectividad, contrato, 100 casos conciliados, evidencia completa, errores resueltos y aceptación de responsables.
- [ ] 6.2 Configurar de forma separada los secretos, endpoint y red de SISCA para producción después de aprobar la salida UAT.
- [ ] 6.3 Ejecutar el despliegue productivo con el mismo artefacto aprobado y verificar salud sin usar el controlador acelerado.
- [ ] 6.4 Documentar el plan de reversión productiva, la operación regular de validaciones y el monitoreo posterior a la habilitación.
