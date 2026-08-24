# Carobra Rewards V2 - Tabla maestra de puntos y activación

**Estado:** base de implementación. Los valores aprobados se pueden usar en
escenarios internos; ninguna regla se activa para clientes reales sólo por
aparecer en este documento.

## Criterios de control

- Cada regla tiene versión, vigencia, estado de aprobación y feature flag.
- `ENABLED_INTERNAL` permite pruebas aisladas y no habilita producción.
- `DISABLED_PENDING_DECISION` significa que el sistema conserva el espacio de
  configuración, pero no entrega puntos ni cambia niveles.
- Los puntos alimentan el ledger; nunca determinan el nivel del cliente.
- La vigencia de los lotes sigue pendiente (12 o 18 meses). Por eso los premios
  V2 se mantienen fuera de producción hasta aprobar esa política.
- Para cuentas y escenarios internos aislados se autoriza una vigencia técnica
  de **18 meses**. Esta excepción no constituye aprobación productiva.

## Versión V2.1 inicial

| Código | Evento | Puntos | Estado interno | Producción | Evidencia requerida |
| --- | --- | ---: | --- | --- | --- |
| `V2_INVITED_REGISTRATION` | Registro completo / entrada a Invitado | 45 | `ENABLED_INTERNAL`, vigencia técnica 18 meses | Deshabilitado | Alta confirmada por el API e idempotency key de registro |
| `V2_INITIAL_PRODUCT_ACTIVE` | Primer producto aceptado y activo; AFORE para el MVP | 105 | `ENABLED_INTERNAL`, vigencia técnica 18 meses | Deshabilitado | Product fact activo; SISCA para AFORE |
| `V2_PLATA_PROFILE_COMPLETION` | Permanencia y perfilamiento para Plata | Por definir | `DISABLED_PENDING_DECISION` | Deshabilitado | Seis meses desde registro y umbral de actividad aprobado |
| `V2_GOLD_PRODUCT_LEVEL` | Resultado asociado a nivel Oro | 600, candidato QA | `DISABLED_PENDING_DECISION` | Deshabilitado | Matriz de productos y regla de puntos aprobadas |
| `V2_PLATINUM_PRODUCT_LEVEL` | Resultado asociado a nivel Platino | 900, candidato QA | `DISABLED_PENDING_DECISION` | Deshabilitado | Matriz de productos y regla de puntos aprobadas |
| `V2_TITANIUM_PRODUCT_LEVEL` | Resultado asociado a nivel Titanio | 1,200, candidato QA | `DISABLED_PENDING_DECISION` | Deshabilitado | Matriz de productos y regla de puntos aprobadas |
| `V2_BIRTHDAY` | Cumpleaños | 900, candidato QA | `DISABLED_PENDING_DECISION` | Deshabilitado | Fuente de fecha verificada y política aprobada |
| `V2_REFERRAL_SALE_CLOSED` | Referido con ciclo completo y venta cerrada | 300, candidato QA | `DISABLED_PENDING_DECISION` | Deshabilitado | Atribución, prospección, cierre y gift card aprobados |
| `V2_AVE_CONFIRMED` | Aportación voluntaria AFORE confirmada | 500, valor histórico | `DISABLED_PENDING_DECISION` | Deshabilitado | Confirmar si AVE sigue en V2 y definir fuente autenticada |
| `V2_QUALITAS_RENEWAL` | Renovación anual Qualitas | Por definir | `DISABLED_PENDING_DECISION` | Deshabilitado | Política de renovación y aceptación aprobada |
| `V2_SKANDIA_NEW_TERM` | Nuevo proceso al concluir un plan Skandia | Por definir | `DISABLED_PENDING_DECISION` | Deshabilitado | Definir si es producto nuevo o sustitución |

## Feature flags iniciales

| Flag | Local/CI | Producción | Motivo |
| --- | --- | --- | --- |
| `rewardsV2Journey` | Encendido | Apagado | Permite construir y revisar el journey completo |
| `rewardsV2InvitedAward` | Encendido con cuentas de prueba | Apagado | Vigencia y rollout productivo pendientes |
| `rewardsV2InitialProductAward` | Encendido con evidencia de prueba | Apagado | Requiere contrato final de aceptación SISCA |
| `rewardsV2LevelTransitions` | Encendido con configuración explícita de escenario | Apagado | Matriz y Plata pendientes |
| `rewardsV2Redemption` | Apagado | Apagado | Bonda, catálogo y vigencia pendientes |
| `rewardsV2Expiry` | Apagado | Apagado | Falta decidir 12 o 18 meses |
| `rewardsV2Ave` | Apagado | Apagado | Alcance V2 no confirmado |
| `rewardsV2Referrals` | Apagado | Apagado | Canal, eventos y gift card pendientes |
| `rewardsV2Renewals` | Apagado | Apagado | Qualitas y Skandia pendientes |
| `rewardsV2TestMode` | Encendido sólo con allowlist | Apagado | Debe ser inaccesible para clientes reales |

## Reglas V1 que no deben interpretarse como V2

La migración V1 `005-rewards-baseline-configuration.ts` contiene premios y
valores del modelo anterior. Esos registros conservan valor histórico y no se
reescriben. La implementación V2 usa códigos nuevos y debe desactivar cualquier
ruta V1 incompatible antes de un rollout productivo.
