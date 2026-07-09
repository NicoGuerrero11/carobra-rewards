## Why

La documentación actual todavía asume un intake SISCA -> Rewards donde SISCA
envía clientes completos y Rewards solo los recibe. Ese criterio ya no aplica.
Antes de cambiar código, hace falta corregir la documentación para que el flujo
objetivo del MVP quede cerrado con estas reglas:

- Rewards registra al cliente directamente desde su propio sitio.
- Rewards administra login, registro, perfil, onboarding, Rewards ID, puntos,
  recompensas, redenciones e historial.
- Rewards captura la CURP directamente y la conserva sin hash.
- SISCA no envía clientes completos, no administra onboarding y no envía
  beneficios, puntos, recompensas ni datos personales obligatorios.
- SISCA solo devuelve la data mínima de validación AFORE:
  `tipo_movimiento`, `estatus_sf` y `fecha_traspaso`.
- Rewards interpreta esa data en checkpoints a 24, 72 y 120 horas transcurridas
  antes de decidir activar, cancelar o escalar el caso.

## What Changes

- Redefinir el flujo general de integración para que Rewards sea el origen del
  registro del cliente y SISCA sea solo una fuente de validación AFORE.
- Reemplazar el contrato conceptual “SISCA envía el alta” por un contrato
  “Rewards consulta validación SISCA por CURP”.
- Mover la data personal obligatoria y opcional al registro y perfil de
  Rewards.
- Eliminar de la documentación cualquier referencia a `SISCA ID`,
  `curp_hash`, rechazo inmediato por falta de información y tratamiento de
  `ACEPTADA OPERACIONES` como descarte terminal.
- Documentar los checkpoints `H24`, `D3` y `D5` y sus reglas de salida.
- Definir casos que Rewards procesa, cancela y escala al equipo.
- Aclarar el modelo de datos objetivo y los estados del cliente y de la
  validación SISCA bajo el nuevo criterio.
- Marcar el flujo HTTP simulado actual como histórico y no representativo del
  contrato objetivo.

## Capabilities

### Modified Capabilities
- `sisca-customer-intake-contract`: ya no describe un intake SISCA -> Rewards;
  ahora documenta el registro administrado por Rewards y la validación AFORE
  consultada a SISCA.
- `simulated-customer-intake-flow`: queda explícitamente como capacidad
  histórica o técnica, no como fuente de verdad funcional del MVP.
- `customer-persistence-model`: debe interpretarse como persistencia actual
  provisional hasta que se implemente el flujo documentado nuevo.

## Impact

- Afecta toda la documentación funcional de Rewards / SISCA.
- Afecta los criterios futuros para API, estados, persistencia y validaciones.
- No implementa todavía cambios en endpoint, modelos, migraciones ni
  integraciones.
- Bloquea implementación posterior hasta que esta documentación sea aprobada.
