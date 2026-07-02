# Customer Intake Meeting Playbook

## 1. Objetivo de la reunión

La reunión debe demostrar trabajo verificable, no solo una base de datos con
registros. La narrativa recomendada conecta:

`documentación -> decisiones funcionales -> construcción técnica -> pruebas -> resultados visibles`

## 2. Estructura recomendada

Duración objetivo: `15-20 minutos`

1. Contexto y alcance del sprint
2. Flujo de alta construido
3. Estructura de datos en Neon
4. Pruebas con clientes mock
5. Excel de SISCA, horas y pendientes

No conviene recorrer archivos uno por uno. El foco debe ser el flujo, las
decisiones y la evidencia.

## 3. Apertura sugerida

Puedes abrir así:

> El objetivo de este trabajo fue definir y construir la base del flujo mediante
> el cual SISCA enviará clientes a Carobra Rewards. Recibir un cliente no
> significa aprobarlo automáticamente: Rewards registra la solicitud, valida los
> datos, revisa duplicados, determina si la identidad puede reutilizarse y decide
> si el alta puede aprobarse, detenerse o rechazarse.

## 4. Flujo funcional que conviene mostrar

Explica el flujo en este orden:

1. SISCA envía información.
2. Rewards registra la recepción.
3. Se valida que exista una CURP utilizable.
4. Se revisa idempotencia.
5. Se busca si la persona ya existe.
6. Se compara NSS cuando la CURP ya existe.
7. Se determina si se aprueba, reutiliza, detiene o rechaza.
8. Si se aprueba, se genera el Rewards ID.
9. El cliente queda pendiente de onboarding.
10. El Rewards ID solo se comunicaría a SISCA después de completar onboarding.

Mensaje clave:

- El Rewards ID se genera al aprobar el alta.
- El Rewards ID no se comunica todavía a SISCA en esta etapa.
- La aprobación actual sigue siendo técnica y simulada; no representa todavía
  elegibilidad real.

## 5. Qué está funcional hoy

### Construido y verificable en el repositorio

- Endpoint provisional `POST /api/v1/customers/intake`
- Validación estructural del payload
- Idempotencia por `(source, external_request_id)`
- Detección de identidad por CURP
- Conflicto controlado CURP/NSS
- Reutilización de cliente existente con `ALREADY_ACTIVE`
- Alta aprobada simulada con creación de Rewards ID
- Persistencia en Neon o PostgreSQL real
- Relación `customer -> AFORE` en `customer_services`
- Evidencia automatizada de pruebas y demo

### Diseñado o documentado, pero no cerrado aún

- Reglas reales de elegibilidad
- Rechazos funcionales definitivos del negocio
- Onboarding completo
- Comunicación del Rewards ID de vuelta a SISCA
- Contrato técnico oficial de SISCA
- Catálogos finales de estados SISCA
- Autenticación productiva

## 6. Casos mock recomendados para contar la historia

### Casos que ya puedes demostrar hoy

1. `Cliente aprobado`
   Resultado visible: `201 APPROVED`, customer nuevo, Rewards ID nuevo, relación `AFORE ACTIVE`.

2. `Cliente aprobado con replay`
   Resultado visible: segundo request `200`, `replayed=true`, sin duplicados.

3. `CURP duplicada activa`
   Resultado visible: `200 ALREADY_ACTIVE`, se reutiliza customer y Rewards ID.

4. `CURP duplicada con NSS diferente`
   Resultado visible: `409 curp_nss_conflict`, intake en `IDENTITY_CONFLICT`.

5. `Payload inválido`
   Resultado visible: `422 validation_error`, sin persistencia.

### Casos que conviene presentar como siguientes pasos del MVP

6. `Validación incompleta`
   Estado esperado futuro: detener el proceso sin invitación.

7. `CURP inválida por regla funcional`
   Estado esperado futuro: rechazo funcional, no solo validación estructural.

8. `Estado SISCA pendiente`
   Estado esperado futuro: intake retenido sin aprobar.

9. `Cliente no elegible`
   Estado esperado futuro: rechazo funcional por regla de negocio.

10. `Nuevo movimiento del mismo cliente`
    Estado esperado futuro: actualizar relación cliente-servicio sin duplicar identidad.

## 7. Recorrido recomendado en vivo

### Parte 1. Problema y alcance

Muestra:

- [customer-intake-business-rules.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-business-rules.md)
- [sisca-rewards-initial-integration-contract.md](/Users/nicolasguerrero/work/carobra-rewards/docs/sisca-rewards-initial-integration-contract.md)

Qué decir:

- ya está definido el flujo base;
- todavía no se cierra el contrato definitivo de SISCA;
- no se está presentando elegibilidad real como si ya existiera.

### Parte 2. Flujo construido

Muestra:

- [customer-intake-business-rules.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-business-rules.md:60)

Qué decir:

- la API recibe, valida, registra, resuelve identidad y persiste;
- cliente e identidad no se mezclan con la relación operativa del servicio.

### Parte 3. Pruebas mock

Ejecuta o resume:

- `approved_new_customer`
- `already_active_existing_customer`
- `identity_conflict_same_curp_different_nss`

Apóyate en:

- [customer-intake-api-proof-demo.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-api-proof-demo.md)
- [initial-customer-intake-test-evidence.md](/Users/nicolasguerrero/work/carobra-rewards/docs/initial-customer-intake-test-evidence.md)

### Parte 4. Neon

Conecta cada request con:

- la fila en `customer_intake_requests`
- el customer creado o reutilizado
- la fila en `customer_services`
- el Rewards ID generado o reutilizado
- la razón del conflicto o ausencia de persistencia

## 8. Qué explicar de Neon

### `customer_intake_requests`

Debe responder:

- qué llegó desde SISCA;
- cuándo llegó;
- qué referencia externa tiene;
- si terminó en `APPROVED`, `ALREADY_ACTIVE` o `IDENTITY_CONFLICT`;
- qué razón bloqueó el flujo cuando no hubo alta nueva.

### `customers`

Debe responder:

- cuál es el customer interno;
- cuál es el Rewards ID;
- qué CURP representa la identidad;
- qué estado general tiene;
- en qué estado de onboarding quedó.

### `customer_services`

Debe responder:

- qué customer está relacionado con `AFORE`;
- qué estado tiene esa relación;
- por qué la identidad del cliente se modela separada del servicio.

Explicación corta sugerida:

> `customers` representa a la persona en Rewards. `customer_services` representa
> la relación de esa persona con un servicio como `AFORE`. Eso evita duplicar la
> identidad cuando cambian los movimientos del servicio.

## 9. Cierre sugerido

Puedes cerrar así:

> Lo que se construyó hasta ahora establece la base funcional y técnica del alta
> de clientes. Ya se definió cómo recibir una solicitud, cómo validar la
> identidad, cómo evitar duplicados, cómo separar al cliente de sus servicios y
> cuándo generar el Rewards ID. Los casos mock permiten demostrar estas reglas
> directamente en la base de datos. El siguiente paso es sustituir los supuestos
> provisionales por el contrato oficial de SISCA, sin cambiar las invariantes
> principales del sistema.
