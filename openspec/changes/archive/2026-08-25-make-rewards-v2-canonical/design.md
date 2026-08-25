## Context

El merge de Rewards V2 dejó coexistiendo dos caminos de ejecución: V2 protegido por `REWARDS_V2_LIVE_FLOW_ENABLED` y V1 como fallback del portal. En Railway la bandera permanece apagada, por lo que registros reales no crean journey V2 y el frontend termina mostrando el saldo V1 de 2,000 puntos. Las tablas de cuenta y ledger son reutilizadas por V2 y contienen historial que no debe eliminarse.

## Goals / Non-Goals

**Goals:**

- Un solo modelo ejecutable y visible: Rewards V2.
- Registro `INVITED` y sincronización SISCA V2 obligatorios e idempotentes.
- Misma lógica en `uat` y `main`, con bases Neon separadas.
- Migración segura de clientes existentes y trazabilidad de cualquier anomalía.
- Reglas V2 versionadas y aprobadas como reglas vigentes; reglas V1 deshabilitadas para nuevas emisiones.

**Non-Goals:**

- Borrar cuentas, ledger o movimientos históricos V1.
- Reescribir retroactivamente saldos ya emitidos sin una política financiera explícita de ajuste.
- Unificar datos entre Neon Testing y Neon Production.
- Cambiar los intervalos SISCA de producción o los tiempos acelerados de UAT.

## Decisions

1. **V2 obligatorio, no bandera de producto.** Se elimina `REWARDS_V2_LIVE_FLOW_ENABLED` y las ramas condicionales. El registro intenta crear la proyección V2 y las lecturas autenticadas/backfill la reparan idempotentemente si hubo una falla temporal; nunca se degrada a V1.

2. **Contratos HTTP V2 exclusivos.** El portal utilizará journey y portal V2. Las rutas V1 de cuenta/elegibilidad se retirarán de la lista pública del BFF; las clases de ledger compartidas pueden permanecer como infraestructura interna mientras V2 las use.

3. **Historia inmutable, reglas antiguas inactivas.** La migración deshabilitará `REGISTRATION_ACTIVATION` y aprobará/activará las reglas V2 vigentes. Los movimientos V1 existentes permanecen en el ledger para auditoría; ya no generan nuevos premios ni sirven como fallback visual.

4. **Backfill idempotente por evidencia.** Una herramienta recorrerá clientes sin journey, creará `INVITED` con referencia estable y, si existe evidencia SISCA validada, sincronizará el producto/nivel V2. Reejecutarla no duplicará premios. El reporte separará migrados, ya existentes y errores.

   Para evidencia histórica, la regla V2 se selecciona con la fecha de procesamiento del backfill (cuando V2 ya está vigente), mientras `registered_at`, `occurred_at` y `validated_at` conservan sus fechas reales. Así no se aplica retroactivamente una regla antes de su vigencia ni se pierde la cronología original.

5. **Promoción de ramas, separación de ambientes.** Se valida primero en `uat`; después el mismo commit funcional se promueve a `main`. Las URLs y `DATABASE_URL` continúan siendo configuración de Railway/Vercel, no lógica de negocio.

## Risks / Trade-offs

- [Clientes históricos pueden conservar más puntos que las reglas V2 actuales] → conservar el ledger inmutable y reportar saldos heredados; cualquier compensación futura requerirá una regla/movimiento explícito y auditable.
- [Un cliente sin proyección V2 verá un estado no disponible durante la migración] → ejecutar el backfill antes de validar el despliegue y exponer un error claro, sin fallback V1.
- [Una falla V2 puede dejar temporalmente una proyección pendiente] → reparar idempotentemente en la lectura V2 y el backfill, registrar errores y probar UAT antes de promover a `main`.
- [Consumidores internos todavía llaman rutas V1] → retirar allowlists y cubrir con pruebas de contrato que V1 responda 404.

## Migration Plan

1. Desplegar migración y código V2-only en `uat` conectado a Neon Testing.
2. Ejecutar backfill dry-run, revisar conteos y luego aplicar; reconciliar journeys, niveles, premios y errores.
3. Probar registro invitado, validación SISCA y portal sin rutas V1.
4. Promover el mismo cambio a `main`, migrar Neon Production y ejecutar el mismo backfill/reconciliación.
5. Mantener rollback de código disponible; no revertir ni borrar movimientos emitidos. Si se revierte temporalmente, V1 seguirá deshabilitado y se atenderá el incidente sin reintroducirlo como fallback.

## Open Questions

- Los saldos históricos V1 se conservarán tal cual. Una eventual conversión financiera de esos saldos queda fuera de este cambio y debe definir monto, fecha de corte y movimiento compensatorio.
