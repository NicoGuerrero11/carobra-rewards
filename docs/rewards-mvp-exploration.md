# Carobra Rewards MVP - Exploracion de producto y diseno

**Estado:** exploracion activa, no aprobado para implementacion  
**Fecha:** 2026-07-14  
**Fuente principal:** `Carobra_Rewards_Entregable_MVP_Comportamientos_Productos FINAL.pdf`

## Objetivo

Definir el MVP completo de Carobra Rewards tomando el documento del equipo como
alcance objetivo. El programa se habilita solamente para clientes cuyo servicio
AFORE haya sido validado por SISCA. Los clientes aun no validados conservan una
experiencia autenticada separada, sin saldo, catalogo ni redenciones.

El alcance incluye comportamientos primarios, cross-selling, referidos,
beneficios, redenciones, compensacion al asesor y controles financieros. Que una
capacidad dependa de una integracion o decision externa no la elimina del MVP:
debe quedar modelada, trazable y con su dependencia explicita.

## Decisiones confirmadas

1. Los 2,000 puntos de alta se acreditan despues de que SISCA valida el servicio
   AFORE, no durante el pre-registro.
2. El servicio que habilita Rewards en el MVP es AFORE.
3. El catalogo final de recompensas se documentara con un segundo documento del
   equipo. Hasta recibirlo, el modelo debe soportar los tipos de beneficio e
   inventario descritos en el documento actual.
4. El limite mensual de canje queda como decision abierta que debe discutirse
   con el equipo.
5. La regla de interaccion mensual parte de "iniciar sesion y realizar una
   accion en el sitio", pero la accion calificable y las condiciones de
   unicidad deben definirse con precision.
6. Los saltos de numeracion de comportamientos en el documento fuente se
   ignoran.
7. Todo el documento forma parte del alcance objetivo del MVP. Las fases de
   entrega expresan dependencias y orden de construccion, no recortes de alcance.

## Segmentacion de la experiencia

### Cliente pendiente o no elegible

- Estados esperados: `PENDING_VALIDATION`, `REQUIRES_ATTENTION`, `INACTIVE` o
  una relacion AFORE distinta de `ACTIVE`.
- Ve el estado de su validacion y mensajes operativos.
- No ve saldo, movimientos de puntos, catalogo ni acciones de canje.
- No puede invocar operaciones de Rewards aunque intente acceder a las rutas
  directamente.

### Cliente elegible

- Requiere cliente `ACTIVE`, validacion SISCA `VALIDATED` y relacion de servicio
  AFORE `ACTIVE`.
- Al habilitarse crea una cuenta Rewards unica y acredita de forma idempotente
  el bono de alta acordado.
- Ve saldo disponible, proximas expiraciones, movimientos, formas de ganar,
  beneficios y redenciones.

## Comportamientos y fuentes de evidencia

| Comportamiento | Premio | Evidencia propuesta | Dependencia o decision |
| --- | ---: | --- | --- |
| Alta en Rewards | 2,000 puntos | Transicion SISCA a `VALIDATED` y AFORE `ACTIVE` | Confirmado: se acredita al validar |
| Complemento de alta | 5,000 puntos | Confirmacion de traspaso, video completado y encuesta enviada | Definir si los tres son obligatorios y como se registran |
| Interaccion mensual | 1,000 puntos | Sesion autenticada mas una accion calificable | Definir catalogo de acciones, zona horaria y una emision por mes |
| Cumpleanos | 5,000 puntos | Fecha de nacimiento verificada | El modelo actual no persiste fecha de nacimiento |
| Aniversario 6 meses | 5,000 puntos | `customer_services.started_at + 6 meses` | Programacion idempotente |
| Aniversario 12 meses | 15,000 puntos | `customer_services.started_at + 12 meses` | Programacion idempotente |
| Aniversario 18 meses | 35,000 puntos | `customer_services.started_at + 18 meses` | Programacion idempotente |
| Aportacion voluntaria AFORE | 500 puntos | Evento confirmado de AVE | Definir sistema fuente y reglas contra duplicados |
| Referido registrado | 3,000 puntos | Registro atribuido a un cliente elegible | Crear modelo de referido y candados antiabuso |
| Referido activo 6 meses | 3,000 puntos | Servicio del referido permanece activo | Programacion y reglas de perdida de elegibilidad |
| Referido activo 12 meses | 5,000 puntos | Servicio del referido permanece activo | Programacion y reglas de perdida de elegibilidad |
| Contratacion Skandia PPR o Vida | 5,000 puntos | Producto contratado y confirmado | Integracion de producto y atribucion comercial |
| Poliza Skandia o Qualitas activa 12 meses | 5,000 puntos | Permanencia confirmada por producto | Integracion, cancelaciones y clawback |
| Uso de beneficio Qualitas | Por definir | Beneficio aplicado a poliza | Elegir regla A/B y porcentaje o puntos |

Todos los eventos deben tener una llave de idempotencia estable. Un reintento,
webhook duplicado o ejecucion concurrente no puede emitir puntos dos veces.

## Recompensas, beneficios e instrumentos

El sistema debe distinguir tres conceptos que no comparten las mismas reglas:

1. **Puntos universales:** saldo canjeable; vigencia normal de 18 meses y
   vigencia de 90 dias para campanas temporales.
2. **Beneficios o derechos automaticos:** por ejemplo, bienvenida, Cinepolis al
   completar encuesta o acceso al diagnostico. Pueden no consumir puntos, pero
   requieren elegibilidad, inventario y trazabilidad de uso.
3. **Monederos de producto:** el abono PPR o descuento Qualitas no debe tratarse
   como puntos universales ni como efectivo. Debe conservar moneda, producto,
   condicion de liberacion y posibles reglas de clawback.

Tipos iniciales de catalogo:

- Automatico o gratuito.
- Canje por puntos.
- Inventario ilimitado.
- Inventario limitado con reserva atomica.
- A demanda.
- Cupo por campana.
- Lista de espera.
- Beneficio deshabilitado hasta que exista convenio firmado.

## Compensacion y atribucion al asesor

La compensacion al asesor permanece dentro del alcance objetivo, pero necesita
un limite de dominio propio porque no modifica el saldo del cliente de la misma
forma que una recompensa.

Debe modelarse:

- Identidad del asesor y atribucion del registro.
- Registro iniciado por asesor frente a autorregistro del cliente.
- Permanencia del cliente a 6 meses.
- Producto cross-sell contratado por plataforma.
- Comision base, porcentaje para asesor y porcentaje trasladado al cliente.
- Condicion de actividad en plataforma para el pago del 100%.
- Limites de registros por asesor y deteccion de patrones sospechosos.
- Regla de que un referido originado por el cliente no produce comision de
  referido para el asesor.

La matriz integral de bonos y la viabilidad de condicionar el 100% de la
comision siguen pendientes de validacion con el equipo responsable.

## Modelo conceptual

| Entidad | Responsabilidad |
| --- | --- |
| `RewardAccount` | Cuenta unica del cliente elegible y estado de acceso |
| `RewardBehaviorRule` | Definicion versionada de comportamientos, puntos y vigencia |
| `RewardEvent` | Evidencia normalizada e idempotente de un comportamiento |
| `PointLot` | Credito emitido, fecha de expiracion y remanente disponible |
| `PointLedgerEntry` | Historial inmutable de emision, consumo, expiracion y ajuste |
| `BenefitCatalogItem` | Oferta, costo, elegibilidad, vigencia y modo de cumplimiento |
| `BenefitInventory` | Cupo total, reservado, consumido y disponible |
| `Redemption` | Solicitud y ciclo de vida de una redencion |
| `RedemptionAllocation` | Lotes de puntos consumidos por una redencion |
| `ProductWallet` | Beneficio monetario restringido a PPR, poliza o producto |
| `Referral` | Relacion entre referente y referido con hitos de permanencia |
| `AdvisorAttribution` | Origen comercial del cliente o producto |
| `AdvisorCompensation` | Calculo auditable de comision y traslado de beneficio |

## Experiencia del cliente validado

La arquitectura de informacion propuesta es:

1. **Resumen:** saldo, puntos proximos a vencer, estado AFORE, meta seleccionada
   y actividad reciente.
2. **Como ganar:** comportamientos agrupados en disponibles, en progreso y
   completados. Debe explicar condiciones y puntos sin prometer eventos que aun
   no tengan integracion activa.
3. **Beneficios:** catalogo con costo, inventario, elegibilidad y detalle.
4. **Movimientos:** emisiones, canjes, expiraciones y ajustes, con fecha y
   origen comprensible.
5. **Mis redenciones:** estado de cumplimiento, referencias y cancelaciones.

La interfaz no debe introducir niveles ficticios porque el documento no define
un sistema de niveles. La jerarquia principal debe ser saldo, vigencia, formas
de ganar y proximas recompensas.

## Reglas operativas y financieras

- Escala referencial: 100 puntos = 1 MXN. No implica convertibilidad a efectivo.
- Vigencia normal: 18 meses desde la emision.
- Vigencia de campana temporal: 90 dias.
- Alertas de expiracion: 60 y 30 dias antes.
- Los puntos expirados no se reponen automaticamente.
- El canje consume puntos y conserva el saldo restante.
- El consumo debe priorizar los lotes que expiran primero.
- La reserva de inventario y el consumo de puntos deben ser atomicos.
- El limite mensual debe ser configurable, aunque su valor inicial quede
  pendiente.
- El inventario de alto valor debe cerrarse al agotarse y puede usar lista de
  espera.
- Los ajustes manuales, devoluciones y cancelaciones requieren motivo, actor y
  auditoria.
- Reporteria debe separar emitidos, disponibles, reservados, consumidos,
  expirados y pasivo estimado.

## Secuencia de construccion del alcance completo

1. Elegibilidad SISCA, separacion de experiencia y cuenta Rewards.
2. Ledger, vigencias, saldo e idempotencia.
3. Comportamientos automaticos con evidencia disponible.
4. Catalogo, inventario, redenciones y cumplimiento.
5. Referidos y permanencia.
6. Integracion AVE y eventos AFORE.
7. Skandia, Qualitas y monederos de producto.
8. Atribucion y compensacion al asesor.
9. Campanas, alertas, reporteria financiera y controles avanzados.

Esta secuencia no elimina ninguna capacidad del MVP; permite construir una base
que no tenga que reescribirse cuando lleguen las integraciones y acuerdos.

## Decisiones abiertas para el equipo

1. Valor del limite mensual de canje y si cambia por tipo de recompensa.
2. Acciones que califican para la interaccion mensual, momento de corte y zona
   horaria.
3. Fuente autorizada de fecha de nacimiento para el premio de cumpleanos.
4. Definicion exacta del complemento de alta y entrega de Cinepolis.
5. Fuente y contrato de eventos de AVE.
6. Opcion A o B para activar Qualitas y puntos o porcentaje aplicable.
7. Reglas de cancelacion, clawback y reembolso para productos cross-sell.
8. Sistema fuente para altas, permanencia y cancelaciones de Skandia/Qualitas.
9. Matriz final de comisiones y responsabilidad del cumplimiento al asesor.
10. Responsable operativo de inventario, entrega y soporte de redenciones.
11. Tratamiento de puntos si el cliente pierde posteriormente el servicio AFORE.
12. Catalogo final, convenios, costos y cantidades de inventario.

## Criterio para formalizar el cambio

Antes de iniciar implementacion, esta exploracion debe convertirse en un cambio
OpenSpec con propuesta, diseno, especificaciones por capacidad y tareas. El
segundo documento de catalogo podra incorporarse como una ampliacion de los
artefactos antes de cerrar el alcance de implementacion.
