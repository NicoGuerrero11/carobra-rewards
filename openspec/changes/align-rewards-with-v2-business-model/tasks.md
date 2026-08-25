## 1. Preparación y decisiones activables

- [x] 1.1 Revisar y mantener actualizado `docs/rewards-v2-decision-backlog.md` como registro de decisiones de negocio pendientes.
- [x] 1.2 Consolidar una tabla maestra versionada de puntos V2 y marcar explícitamente cada regla no aprobada como deshabilitada.
- [ ] 1.3 Acordar la matriz de precedencia de niveles, el umbral de Plata y el criterio de producto aceptado/activo antes de activar transiciones productivas.
- [x] 1.4 Definir los valores y límites de configuración iniciales para ambientes internos sin activar Bonda, expiración, AVE, referidos ni renovaciones pendientes.

## 2. Contratos y persistencia V2

- [x] 2.1 Inventariar las migraciones y módulos actuales de Rewards para reutilizar el ledger sin alterar historiales existentes.
- [x] 2.2 Crear migraciones aditivas para configuraciones versionadas, product facts, actividades de perfilamiento, proyección de journey, decisiones de nivel e historial de auditoría.
- [x] 2.3 Implementar repositorios, tipos de dominio y validaciones para product facts y evidencia idempotente de proveedores.
- [x] 2.4 Implementar repositorios, tipos de dominio y agregados para actividades calificables y progreso de perfilamiento.
- [x] 2.5 Implementar persistencia de configuración efectiva, versiones de regla e idempotencia de decisiones V2.
- [x] 2.6 Añadir índices, restricciones de unicidad y claves foráneas que preserven evidencia e historial de decisiones.
- [x] 2.7 Crear pruebas de migración, restricciones y retrocompatibilidad del ledger actual.

## 3. Journey, puntos y motor de niveles

- [x] 3.1 Implementar el caso de uso idempotente que crea el journey Invitado y el premio de registro configurado al completar alta.
- [x] 3.2 Implementar la elegibilidad de redención separada del saldo y bloquearla mientras no exista un producto activo validado.
- [x] 3.3 Implementar el evaluador determinista de niveles a partir de productos, permanencia y actividad calificable, sin consultar el saldo de puntos.
- [x] 3.4 Registrar cada evaluación y transición con entradas, versión de regla, razón y fecha para auditoría.
- [x] 3.5 Implementar el cálculo y comunicación de progreso hacia el siguiente nivel cuando la configuración esté aprobada.
- [x] 3.6 Implementar recálculo idempotente ante activación, cancelación, finalización o reactivación de un producto.
- [x] 3.7 Añadir pruebas unitarias y de integración para Invitado, Bronce, Plata, niveles por productos, canje, cancelación y reactivación.

## 4. Integración con identidad y SISCA

- [x] 4.1 Extender el contrato API–site backend para publicar evidencia segura de una validación AFORE positiva, sin exponer payloads crudos ni credenciales.
- [x] 4.2 Conectar la validación SISCA idempotente al alta o activación del product fact AFORE y a la evaluación V2 correspondiente.
- [x] 4.3 Conservar el comportamiento existente de validación pendiente, negativa y de atención hasta que el equipo apruebe la política V2 de inactividad.
- [x] 4.4 Verificar que registro, autenticación, sesión e identidad siguen siendo autoridad del API y que el site backend no duplica esos datos.
- [x] 4.5 Añadir pruebas de contrato y regresión para registro, invitación, validación SISCA repetida y activación AFORE.

## 5. APIs Rewards y modo de prueba

- [x] 5.1 Definir e implementar el contrato autenticado `RewardsJourneySummary` para estado, nivel, elegibilidad, progreso, productos y puntos.
- [x] 5.2 Implementar endpoints de detalle para actividades y movimientos necesarios por el frontend sin filtrar información sensible.
- [x] 5.3 Crear escenarios de prueba administrados por backend para Invitado, pendiente SISCA, Bronce, Plata, niveles por productos, cancelación y reactivación.
- [x] 5.4 Proteger escenarios y mutaciones de prueba con aislamiento de datos, autorización y allowlist de ambiente no productivo.
- [x] 5.5 Implementar feature flags server-owned para funciones pendientes y comprobar que se inicializan desactivadas.
- [x] 5.6 Añadir pruebas de autorización, aislamiento de datos e igualdad de contrato entre escenarios y journey real.

## 6. Frontend V2 para revisión y pruebas

- [x] 6.1 Definir el sistema visual y los estados de contenido para Invitado, validación pendiente, producto activo, niveles, progreso y módulos aún no habilitados.
- [x] 6.2 Reemplazar el estado demo de Rewards en navegador por las llamadas autenticadas al resumen y detalle del site backend.
- [x] 6.3 Construir la experiencia de Invitado con espera de validación, saldo visible y explicación de por qué no puede redimir todavía.
- [x] 6.4 Construir el resumen de Rewards con nivel actual, avance, productos activos y movimientos de puntos.
- [x] 6.5 Construir las vistas de actividades de perfilamiento, cancelación/reactivación y estados sin regla aprobada con mensajes claros.
- [x] 6.6 Incorporar el selector o acceso interno a escenarios de prueba sólo en el ambiente autorizado.
- [x] 6.7 Validar accesibilidad, diseño responsive y estados de carga/error/vacío en desktop y móvil.

## 7. Validación, activación y evolución

- [x] 7.1 Ejecutar pruebas unitarias, de integración, contratos, migraciones y flujos end-to-end para todos los escenarios V2 habilitados.
- [ ] 7.2 Realizar una revisión interna navegando los escenarios reales de prueba con producto, diseño y operaciones.
- [ ] 7.3 Ejecutar evaluación en sombra y conciliación de decisiones antes de habilitar reglas V2 a clientes reales.
- [ ] 7.4 Activar gradualmente registro–Invitado y validación SISCA–Bronce únicamente con configuraciones aprobadas.
- [ ] 7.5 Incorporar Bonda, expiración, AVE, referidos y renovaciones en cambios OpenSpec posteriores cuando cada decisión de negocio se cierre.
