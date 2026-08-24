# Carobra Rewards V2 - Inventario de arquitectura reutilizable

## Componentes que se conservan

| Componente actual | Decisión V2 |
| --- | --- |
| `api` de registro, autenticación y sesiones | Se conserva como autoridad de identidad. |
| Lifecycle y auditoría SISCA del `api` | Se conserva; publica evidencia segura de producto validado. |
| `rewards_accounts` | Se reutiliza como cuenta del ledger; debe admitir la etapa Invitado sin confundirla con elegibilidad de canje. |
| `reward_events`, `ledger_entries`, `point_lots`, `point_allocations` | Se conservan como historial financiero inmutable. No se recalculan ni reescriben. |
| `behavior_rule_versions` | Se reutiliza para premios de puntos con códigos V2 nuevos y versiones independientes. |
| `product_contracts` | Se mantiene para contratos/cross-sell V1; V2 incorpora product facts para normalizar evidencia previa o posterior a un contrato. |
| Site backend Node | Pasa a ser autoridad de journey, niveles, product facts, actividad y modo de prueba. |
| Frontend Astro | Se conserva como experiencia web; elimina autoridad de negocio de `sessionStorage`. |

## Extensiones aditivas requeridas

- Configuración V2 efectiva y aprobable por versión.
- Proyección del journey por cliente y cuenta Rewards.
- Product facts y eventos de evidencia idempotentes, con SISCA como primer
  proveedor y soporte de otros productos de entrada.
- Actividades de perfilamiento calificables y auditables.
- Decisiones de nivel con entradas, versión de regla y razones conservadas.
- Escenarios de prueba aislados y feature flags administrados por servidor.

## Riesgos detectados en la base V1

- `REGISTRATION_ACTIVATION` otorga 2,000 puntos después de validar SISCA; no
  representa Registro→Invitado 45 ni AFORE activo→Bronce 105.
- Hay aniversarios, referidos y cross-sell V1 habilitados con valores que no son
  autoridad para V2.
- `rewards_accounts.activated_at` es obligatorio y el tipo TypeScript sólo
  reconoce cuentas activas/congeladas/cerradas; la etapa Invitado requiere una
  adaptación compatible.
- El catálogo y la expiración existentes no deben quedar disponibles por
  accidente mientras Bonda y la vigencia sigan abiertas.
- `product_contracts` comienza en Skandia/Qualitas y no representa por sí solo
  la evidencia inicial AFORE ni estados firmados todavía no aceptados.

## Restricciones de migración

- Todas las migraciones V2 serán aditivas.
- No se borran clientes, eventos, entradas, lotes ni decisiones históricas.
- Las nuevas reglas usan códigos V2; las reglas V1 incompatibles se cierran o
  se aíslan mediante configuración antes de producción.
- El rollback deshabilita V2 y elimina únicamente tablas/configuración V2 que no
  tengan uso productivo; nunca revierte el ledger histórico.
