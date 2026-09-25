## MODIFIED Requirements

### Requirement: Customer navigation must expose only the approved primary destinations
The customer shell SHALL expose Inicio, Beneficios, Cursos, Productos, and Actividad as its primary destinations. It SHALL omit Ganar puntos, present Cursos as an approved level-specific catalog when enabled or a truthful Próximamente page otherwise, and expose Ayuda and Notificaciones as accessible utility icons with visible hover and keyboard-focus labels.

#### Scenario: Customer scans the primary navigation
- **WHEN** the customer shell renders on desktop or mobile
- **THEN** Cursos replaces Ganar puntos, Ayuda appears as a question-mark utility beside Notificaciones, and both utility icons identify their destinations on hover and keyboard focus
