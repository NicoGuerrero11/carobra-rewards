## Why

Carobra Rewards ya definió la estructura modular de `customer_intake`, pero todavía no tiene el primer modelo de persistencia que permita registrar solicitudes de alta, crear clientes solo cuando el alta queda aprobada y mantener separadas la identidad del cliente, el Rewards ID y el servicio Afore. El PDF [docs/Flujo inicial de alta de clientes desde SISCA.pdf](/Users/nicolasguerrero/work/carobra-rewards/docs/Flujo%20inicial%20de%20alta%20de%20clientes%20desde%20SISCA.pdf) confirma esas invariantes funcionales y permite cerrar decisiones técnicas necesarias para pasar a implementación sin inventar contrato definitivo de SISCA.

## What Changes

- Definir el modelo persistente inicial para `customer_intake_requests`, `customers`, `services` y `customer_services`.
- Fijar que una solicitud de intake puede existir sin cliente y que el cliente con Rewards ID se crea únicamente cuando el alta queda aprobada.
- Definir el tratamiento persistente de UUID técnico, Rewards ID, CURP, NSS, `processing_status`, `processing_details` y `original_payload`.
- Establecer restricciones mínimas de unicidad, llaves foráneas con borrado restrictivo, nulabilidad, tamaños de columna y los índices adicionales estrictamente justificados.
- Definir puertos separados para intake, clientes, servicios, relación cliente-servicio y unidad de trabajo compartida.
- Preparar la implementación de modelos SQLAlchemy, repositorios concretos, migración Alembic, seed determinístico de `AFORE` y pruebas PostgreSQL compatibles con Neon.
- Mantener fuera de alcance el contrato técnico definitivo de SISCA, los catálogos oficiales y la lógica funcional completa de elegibilidad, onboarding e invitaciones.

## Capabilities

### New Capabilities
- `customer-persistence-model`: Persistencia inicial de solicitudes de intake, clientes, catálogo de servicios y relaciones cliente-servicio con invariantes cerradas para el MVP.

### Modified Capabilities
- None.

## Impact

- La aplicación de este cambio introducirá modelos SQLAlchemy, repositorios concretos, una unidad de trabajo, migración Alembic, seed inicial de `AFORE` y pruebas de persistencia PostgreSQL en `src/carobra_rewards/modules/customer_intake/infrastructure/persistence/` y `src/carobra_rewards/modules/customer_intake/ports/`.
- El cambio no modifica routers productivos, contratos HTTP definitivos, reglas completas de elegibilidad, onboarding, invitaciones ni sincronización con SISCA.
- El diseño se basa en el PDF funcional disponible en `docs/` y en la arquitectura modular existente; cualquier documentación técnica oficial posterior de SISCA sobre formatos, catálogos, códigos o reglas detalladas de campos podrá originar cambios OpenSpec adicionales.
