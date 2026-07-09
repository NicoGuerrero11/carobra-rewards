## Context

La documentación vigente mezcla dos cosas que ahora deben separarse con
claridad:

- el flujo técnico simulado hoy implementado en `POST /api/v1/customers/intake`;
  y
- el flujo objetivo del MVP, donde Rewards registra al cliente y SISCA solo
  valida el estado operativo del trámite AFORE.

El criterio de integración cambió. SISCA ya no debe ser descrito como origen
de clientes válidos, ni como dueño de onboarding, ni como proveedor de datos
personales completos. Rewards pasa a ser dueño del alta del cliente y SISCA
queda acotado a responder tres campos de validación: `tipo_movimiento`,
`estatus_sf` y `fecha_traspaso`.

## Goals / Non-Goals

**Goals:**

- Dejar documentado que el cliente se registra dentro de Rewards.
- Definir que Rewards captura y almacena CURP sin hash.
- Definir que SISCA solo valida operación AFORE por CURP y devuelve tres
  campos.
- Documentar checkpoints a 24, 72 y 120 horas transcurridas.
- Definir interpretación normativa para `ACEPTADA PROCESAR`,
  `ACEPTADA OPERACIONES`, `CANCELADA` y “sin información”.
- Documentar estados del cliente, estados de validación SISCA, modelo de data
  objetivo y reglas del MVP.
- Identificar casos que terminan en activación, cancelación o aviso al equipo.

**Non-Goals:**

- Implementar aún el nuevo registro, login o consulta real a SISCA.
- Congelar aún el shape técnico definitivo de endpoints internos de Rewards.
- Modificar código, migraciones o contratos runtime del flujo simulado actual.

## Decisions

### 1. Rewards es el sistema de registro y SISCA no envía clientes completos

La documentación debe asumir que el cliente entra al sitio Rewards, se registra
y captura directamente toda la data obligatoria y opcional requerida por
negocio.

Consecuencias:

- SISCA deja de ser origen del alta del cliente.
- SISCA deja de ser fuente de datos personales obligatorios.
- No existe `SISCA ID` como identificador funcional dentro del nuevo flujo.
- Cualquier dato que Rewards necesite para registro, login, perfil u
  onboarding debe provenir del propio cliente en Rewards.

### 2. CURP es capturada por Rewards y se conserva sin hash

La CURP es necesaria para consultar validación AFORE en SISCA. Por lo tanto:

- Rewards la captura directamente.
- Rewards la almacena sin hash.
- Se eliminan referencias a `curp_hash` del flujo objetivo.

Rationale:

- Rewards necesita usar CURP como dato operativo para consulta.
- Un hash impediría el comportamiento documental esperado sin un mecanismo
  adicional no definido.

### 3. SISCA queda reducido a un contrato mínimo de validación AFORE

La respuesta conceptual de SISCA al flujo objetivo se limita a:

- `tipo_movimiento`
- `estatus_sf`
- `fecha_traspaso`

Rewards interpreta esa respuesta y no delega a SISCA:

- activación final del cliente;
- onboarding;
- administración de puntos o recompensas;
- cancelación comercial del caso;
- historial del cliente.

### 4. `ACEPTADA OPERACIONES` deja de ser descarte terminal

El flujo anterior trataba `ACEPTADA OPERACIONES` como no procesable. El nuevo
criterio obliga a tratarlo como estado temporal pendiente dentro de la ventana
de validación.

Regla normativa:

- en `H24` y `D3`: sigue pendiente;
- en `D5`: requiere atención y aviso al equipo.

### 5. La ausencia de información en H24 y D3 no cancela el caso

Si Rewards consulta SISCA antes de que expire la ventana y no encuentra
información, no hay rechazo ni cancelación. El cliente sigue pendiente.

Rationale:

- el objetivo es esperar a que la operación llegue a `ACEPTADA PROCESAR`;
- la ausencia temprana de datos no implica fallo del trámite.

### 6. El MVP usa checkpoints exactos desde el registro completo

Cuando el cliente termina su registro en Rewards y ya existe la validación
SISCA pendiente, se programan checkpoints a 24, 72 y 120 horas.

Durante esa ventana:

- Rewards puede consultar SISCA una o varias veces;
- `ACEPTADA PROCESAR` habilita activación si también se cumplen las reglas MVP
  de movimiento y fecha;
- `ACEPTADA OPERACIONES` mantiene el caso pendiente;
- “sin información” mantiene el caso pendiente.

Después de esa ventana:

- `ACEPTADA PROCESAR` permite activar;
- `CANCELADA` cancela y avisa al equipo;
- sin información cancela y avisa al equipo;
- `ACEPTADA OPERACIONES` exige atención requerida y aviso al equipo.

### 7. Rewards interpreta la respuesta SISCA con estados propios

La documentación debe separar:

- valores crudos devueltos por SISCA; y
- estados internos con los que Rewards gestiona el caso.

Estados internos documentales mínimos para la validación:

- `PENDING`
- `VALIDATED`
- `TEMPORARY_PENDING`
- `CANCELLED`
- `REQUIRES_ATTENTION`

Esto evita reusar literalmente el catálogo SISCA como estado de negocio
interno.

### 8. El flujo simulado actual queda como histórico

La documentación del endpoint provisional y las demos actuales debe conservarse
solo como evidencia técnica del slice implementado. Ya no debe presentarse como
contrato objetivo de integración.

## Risks / Trade-offs

- El repositorio seguirá conteniendo un flujo técnico vigente que no coincide
  todavía con la documentación objetivo. Eso es aceptable porque este cambio es
  explícitamente documental.
- Algunos documentos históricos o binarios pueden permanecer como evidencia del
  flujo previo. Deben dejar de ser referencia canónica.
- El detalle técnico del endpoint real hacia SISCA aún puede cambiar, pero el
  reparto de responsabilidades y reglas de interpretación ya debe considerarse
  cerrado.

## Migration Plan

1. Actualizar documentación y OpenSpec para que el criterio nuevo sea la única
   narrativa funcional vigente.
2. Revisar aprobación del flujo documental.
3. Solo después de esa aprobación, planear cambios de implementación, modelo y
   contratos runtime.

## Open Questions

- ¿Qué campos exactos del registro Rewards serán obligatorios en MVP además de
  CURP y credenciales?
- ¿Qué frecuencia o estrategia de reintento usará Rewards para consultar SISCA
  en los checkpoints `H24`, `D3` y `D5`?
- ¿Qué canal operativo se usará para “avisar al equipo”?
