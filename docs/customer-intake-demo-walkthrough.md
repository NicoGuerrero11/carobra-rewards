# Customer Intake Demo Walkthrough

## 1. Estado de esta demo

Esta demo documenta el flujo HTTP simulado actualmente implementado. Debe
leerse como evidencia técnica histórica, no como contrato funcional vigente del
MVP Rewards / SISCA.

## 2. Qué ya no debe inferirse de esta demo

- que SISCA envía clientes válidos a Rewards;
- que SISCA envía datos personales obligatorios;
- que el flujo objetivo empieza en un alta SISCA -> Rewards;
- que el contrato simulado actual representa el criterio final del MVP.

## 3. Qué sí demuestra

- existe una base técnica de intake y persistencia;
- existe trazabilidad con `X-Request-ID`;
- existe separación entre intake, customer y relación AFORE;
- el repositorio puede sostener una siguiente implementación.

## 4. Referencia funcional vigente

Para reglas y contrato objetivo usar:

- [sisca-rewards-initial-integration-contract.md](/Users/nicolasguerrero/work/carobra-rewards/docs/sisca-rewards-initial-integration-contract.md)
- [customer-intake-business-rules.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-business-rules.md)

## 5. Nota operativa

No avanzar a implementación usando esta demo como fuente funcional. La fuente
funcional vigente es la documentación nueva del flujo donde Rewards registra y
SISCA solo valida.
