# Carobra Rewards V2 - Backlog de decisiones y preparación

**Propósito:** mantener visibles los pendientes que bloquean reglas productivas o
la activación de integraciones. Este documento no reemplaza el playbook: sirve
para cerrar decisiones una a una y después reflejarlas en OpenSpec.

**Implementación relacionada:**

- Cambio OpenSpec: `align-rewards-with-v2-business-model`.
- Tabla maestra de puntos: `docs/rewards-v2-points-master.md`.
- Inventario técnico de reutilización: `docs/rewards-v2-architecture-inventory.md`.
- Una decisión sólo se considera activable cuando se refleja en la tabla
  maestra, una configuración versionada y sus pruebas.

## Decisiones ya alineadas

- [x] El registro crea al cliente como **Invitado** y entrega 45 puntos.
- [x] La validación positiva del AFORE recibida desde SISCA entrega 105 puntos
  y cambia al cliente a **Bronce**.
- [x] La permanencia para el nivel comienza desde el día del registro.
- [x] Invitado es una excepción única: recibe los 45 puntos, pero no puede
  redimir beneficios antes de tener un producto activo.
- [x] El nivel se calcula a partir de productos activos, no de que AFORE sea
  permanentemente el producto base. Esto permite iniciar con otro negocio en
  el futuro.
- [x] Si se cancela todo, no se recupera automáticamente el nivel anterior al
  contratar de nuevo.
- [x] La regla vigente de referidos es la nueva: recompensa al cierre de venta,
  no al registro ni a hitos de permanencia.

## Pendientes de negocio

### Nivel Plata y perfilamiento

- [ ] Definir el umbral exacto de actividad para pasar de Bronce a Plata.
  Debe indicar cuáles actividades califican, cuántas son necesarias y el
  período en que se cuentan.
  - **Impacto:** el sistema debe poder responder si el cliente cumple Plata y
    cuánto le falta, sin usar el saldo disponible de puntos como criterio.

- [ ] Confirmar si el criterio de Plata usa un mínimo binario de actividades o
  si la actividad crea categorías adicionales dentro de Plata.
  - **Propuesta técnica:** usar un mínimo binario y conservar la diferencia de
    actividad en el historial/puntos; no crear subniveles sin una decisión
    expresa.

### Productos, niveles y cancelaciones

- [ ] Aprobar que un producto cruzado otorgue puntos y cambie el nivel sólo
  cuando esté **aceptado, activo y validado en SISCA**, no únicamente firmado.
  - **Impacto:** evita niveles y puntos por contratos que después no se
    activan o se rechazan.

- [ ] Definir la tabla de degradación de nivel para cada combinación de
  productos activos. Incluir, como mínimo, cancelación de AFORE, de un
  cross-sell y de todos los productos.
  - **Impacto:** “bajar al nivel correspondiente” debe traducirse en una regla
    determinista que el sistema pueda calcular.

- [ ] Definir qué ocurre si un producto se firma, pero nunca se activa, se
  rechaza o se cancela antes de validarse.
  - **Impacto:** determina si se ignoran, revierten o retienen los puntos y el
    cambio de nivel asociado.

### Renovaciones

- [ ] Definir la regla de renovación de Qualitas: puntos otorgados, momento de
  confirmación y si abre acceso temporal a beneficios superiores.

- [ ] Confirmar que renovar el mismo contrato no cuenta como un cross-sell
  adicional ni aumenta el nivel. Definir por separado cuándo un nuevo plan de
  Skandia al término del anterior se considera producto nuevo o sustitución.

### Invitados inactivos

- [ ] Definir el plazo final sin validación AFORE antes de marcar Invitado como
  inactivo y si existe un margen cuando SISCA responde cerca del límite.

- [ ] Definir el tratamiento de una cuenta Invitado inactiva: conservar sin
  acceso, eliminar, permitir reactivación automática o requerir un nuevo
  registro. Precisar qué sucede con los 45 puntos cuando llega una validación
  tardía.

### Reglas aún incompletas

- [ ] Confirmar la vigencia de puntos: 12 meses o 18 meses, después de la
  reunión con Bonda.
  - **Impacto:** bloquea la política productiva de expiración, notificaciones y
    saldo disponible; no bloquea el diseño de niveles ni el entorno de pruebas.
  - **Excepción autorizada:** usar 18 meses únicamente en cuentas y escenarios
    internos aislados; producción permanece deshabilitada.

- [ ] Confirmar si AVE continúa en el programa. En el MVP anterior AVE se
  modeló como aportación voluntaria AFORE con 500 puntos por contribución
  confirmada. Si sigue vigente, definir fuente del evento y validación; si no,
  retirarlo del alcance V2.

- [ ] Completar referidos: definir el canal oficial de atribución (link, código,
  asesor o combinación), el evento fuente para “prospección” y “cierre de
  venta”, y la política aprobada de gift card.

### Bonda y beneficios

- [ ] Con Maritza, definir el modelo comercial de beneficios Bonda: qué cubre
  Carobra, qué recibe el cliente, qué beneficios consumen puntos y qué datos
  deben llegar al sitio.
  - **Impacto:** bloquea catálogo y redenciones reales, pero no la arquitectura
    de niveles, puntos ni el frontend de pruebas.

- [ ] Consolidar una tabla maestra de valores de puntos y actualizar el
  playbook/QA para que no existan importes contradictorios entre documentos.

## Preparación del sitio para pruebas y revisión interna

- [ ] Construir el sitio Rewards con contratos reales de backend, estados,
  niveles, progreso y diseño finalizable. El objetivo es que el equipo pueda
  recorrer el sistema, revisar su formato y probar flujos controlados.

- [ ] Habilitar un entorno de prueba con cuentas de prueba administradas por el
  backend y estados reproducibles (Invitado, Bronce, Plata, Oro, Platino,
  Titanio, cancelación y reactivación). No debe depender de `sessionStorage` ni
  mezclar datos de prueba con clientes reales.

- [ ] Mantener Bonda, expiración y reglas no aprobadas como módulos
  deshabilitados o estados visibles de “pendiente de habilitación”; nunca como
  beneficios disponibles simulados para clientes reales.

## Siguiente cierre documental

- [ ] Cuando se resuelvan los pendientes anteriores, actualizar el playbook y
  el QA como fuente única de negocio.
- [ ] Convertir las decisiones cerradas y el alcance de pruebas en una nueva
  propuesta OpenSpec antes de implementar la V2.
