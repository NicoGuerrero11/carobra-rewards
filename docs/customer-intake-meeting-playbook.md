# Customer Intake Meeting Playbook

## 1. Objetivo de la reunión

La reunión debe explicar con claridad el cambio de criterio:

- antes se asumía que SISCA enviaba clientes completos;
- ahora Rewards registra al cliente y SISCA solo valida el trámite AFORE.

## 2. Apertura sugerida

> El flujo objetivo del MVP ya no parte de un alta enviada por SISCA. Ahora el
> cliente entra a Rewards, se registra, captura su información y su CURP, y
> Rewards consulta a SISCA únicamente para validar el estado operativo del
> trámite AFORE. SISCA ya no administra el alta, ni onboarding, ni puntos, ni
> recompensas.

## 3. Flujo funcional que conviene mostrar

1. Cliente entra a Rewards.
2. Cliente se registra.
3. Cliente captura data obligatoria y CURP.
4. Rewards guarda perfil y CURP sin hash.
5. Rewards crea validación SISCA pendiente.
6. Rewards consulta SISCA por CURP.
7. SISCA devuelve `tipo_movimiento`, `estatus_sf` y `fecha_traspaso`.
8. Rewards interpreta la respuesta en checkpoints a 24, 72 y 120 horas.
9. Rewards activa, cancela o escala el caso.

## 4. Mensajes clave

- Rewards es dueño del cliente.
- SISCA no envía clientes válidos.
- SISCA no envía beneficios, puntos ni recompensas.
- `ACEPTADA OPERACIONES` ya no es rechazo inmediato.
- en `H24` y `D3`, la falta de información o una falla técnica mantiene pendiente;
- en `D5`, la falta de información cancela y la incertidumbre técnica escala a
  atención requerida.

## 5. Material recomendado

- [sisca-rewards-initial-integration-contract.md](/Users/nicolasguerrero/work/carobra-rewards/docs/sisca-rewards-initial-integration-contract.md)
- [customer-intake-business-rules.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-business-rules.md)
- [customer-intake-module-structure.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-module-structure.md)

## 6. Qué sí mostrar del estado actual

- que ya existe una base técnica;
- que el repositorio ya separa cliente, Rewards ID y relación AFORE;
- que la documentación ya refleja el flujo nuevo antes de implementar.

## 7. Qué no afirmar

- que SISCA ya envía el alta completa;
- que la API simulada actual ya representa el contrato final;
- que `ACEPTADA OPERACIONES` implica rechazo;
- que la ausencia temprana de información cancela al cliente.
