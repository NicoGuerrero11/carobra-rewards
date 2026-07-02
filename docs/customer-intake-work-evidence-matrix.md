# Customer Intake Work Evidence Matrix

## 1. Propósito

Esta matriz sirve para justificar trabajo de ingeniería con evidencia concreta.
No sustituye un reporte de horas oficial, pero sí ordena la conversación de la
reunión alrededor de entregables verificables.

## 2. Cómo usarla

Para cada bloque:

- indica horas invertidas;
- resume la actividad;
- enseña la evidencia;
- explica el resultado;
- marca el estado actual.

## 3. Matriz

| Bloque de trabajo | Actividad realizada | Evidencia en el repositorio | Resultado obtenido | Estado | Horas |
| --- | --- | --- | --- | --- | --- |
| Análisis del flujo | Levantamiento del ciclo de alta desde SISCA hasta Rewards | [customer-intake-business-rules.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-business-rules.md), [Flujo inicial de alta de clientes desde SISCA.pdf](/Users/nicolasguerrero/work/carobra-rewards/docs/Flujo%20inicial%20de%20alta%20de%20clientes%20desde%20SISCA.pdf) | Flujo funcional base acordado | Completado | `__` |
| Revisión del Excel SISCA | Clasificación conceptual de campos y detección de dependencias | [sisca-excel-preliminary-classification.md](/Users/nicolasguerrero/work/carobra-rewards/docs/sisca-excel-preliminary-classification.md) | Separación preliminar entre identidad, servicio, operación y trazabilidad | Completado parcialmente | `__` |
| Definición de reglas | Idempotencia, duplicados, conflicto CURP/NSS, Rewards ID y onboarding pendiente | [customer-intake-business-rules.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-business-rules.md) | Reglas base documentadas | Completado para el flujo provisional | `__` |
| Diseño de arquitectura | Separación entre intake, customer, service y customer-service | [customer-intake-module-structure.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-module-structure.md), [models.py](/Users/nicolasguerrero/work/carobra-rewards/src/carobra_rewards/modules/customer_intake/infrastructure/persistence/models.py) | Modelo persistente consistente con las invariantes del MVP | Completado | `__` |
| Diseño de integración | Definición del contrato provisional SISCA -> Rewards | [sisca-rewards-initial-integration-contract.md](/Users/nicolasguerrero/work/carobra-rewards/docs/sisca-rewards-initial-integration-contract.md) | Contrato técnico provisional disponible | Completado provisionalmente | `__` |
| Construcción del backend | Implementación del endpoint, caso de uso, validaciones y persistencia | [router.py](/Users/nicolasguerrero/work/carobra-rewards/src/carobra_rewards/api/v1/customer_intake/router.py), [service.py](/Users/nicolasguerrero/work/carobra-rewards/src/carobra_rewards/modules/customer_intake/application/service.py) | Flujo técnico funcional | Completado para el alcance actual | `__` |
| Construcción de base de datos | Modelado, migraciones, índices, relaciones y restricciones | [models.py](/Users/nicolasguerrero/work/carobra-rewards/src/carobra_rewards/modules/customer_intake/infrastructure/persistence/models.py), [20260624_implement_customer_persistence_model.py](/Users/nicolasguerrero/work/carobra-rewards/alembic/versions/20260624_implement_customer_persistence_model.py) | Persistencia reproducible y consistente | Completado | `__` |
| Pruebas y datos mock | Casos de prueba, demo técnica y demo API proof con evidencia en Neon | [customer-intake-api-proof-demo.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-api-proof-demo.md), [initial-customer-intake-test-evidence.md](/Users/nicolasguerrero/work/carobra-rewards/docs/initial-customer-intake-test-evidence.md), [demo_customer_intake.py](/Users/nicolasguerrero/work/carobra-rewards/scripts/demo_customer_intake.py) | Evidencia ejecutable y visible en base de prueba | Completado | `__` |
| Ajustes y correcciones | Cierre de inconsistencias, protección de errores y escenarios de conflicto | [test_router_http_integration.py](/Users/nicolasguerrero/work/carobra-rewards/tests/api/v1/customer_intake/test_router_http_integration.py), [error_mapping.py](/Users/nicolasguerrero/work/carobra-rewards/src/carobra_rewards/api/v1/customer_intake/error_mapping.py) | Flujo más estable y con errores públicos controlados | Completado para el alcance actual | `__` |
| Documentación y narrativa | Preparación de guía de reunión, demo y material explicativo | [customer-intake-meeting-playbook.md](/Users/nicolasguerrero/work/carobra-rewards/docs/customer-intake-meeting-playbook.md), [README.md](/Users/nicolasguerrero/work/carobra-rewards/README.md) | Material listo para presentación | Completado | `__` |

## 4. Mensaje recomendado si preguntan por las horas

No conviene decir solo “fue desarrollo”. La mejor respuesta es:

> El trabajo se distribuyó entre análisis funcional, revisión de datos SISCA,
> diseño de arquitectura, implementación backend, modelado de base, pruebas,
> corrección de escenarios y documentación. Todo eso es trabajo de ingeniería y
> cada bloque tiene evidencia concreta en el repositorio y en la base de prueba.

## 5. Cierre

La justificación más sólida no es el número aislado de horas, sino la relación:

`actividad realizada -> evidencia verificable -> resultado obtenido`
