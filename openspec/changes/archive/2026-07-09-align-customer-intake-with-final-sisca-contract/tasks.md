## 0. Actualizar documentación canónica antes de tocar código

- [x] 0.1 Reescribir la propuesta para reflejar que Rewards registra clientes y
  SISCA solo valida operación AFORE
- [x] 0.2 Reescribir el diseño con checkpoints a 24, 72 y 120 horas
  y las reglas de interpretación de `estatus_sf`
- [x] 0.3 Reescribir la spec del contrato conceptual para eliminar `SISCA ID`,
  `curp_hash`, intake completo desde SISCA y rechazo inmediato

## 1. Actualizar documentos funcionales de Rewards / SISCA

- [x] 1.1 Actualizar el flujo general de integración en la documentación del
  repositorio
- [x] 1.2 Actualizar o agregar un flujograma del flujo objetivo
- [x] 1.3 Actualizar el contrato conceptual de validación SISCA
- [x] 1.4 Actualizar la documentación de modelo de datos objetivo
- [x] 1.5 Actualizar la definición de estados del cliente y de validación SISCA
- [x] 1.6 Actualizar reglas de negocio del MVP, incluidos casos a procesar,
  cancelar y escalar

## 2. Alinear material de soporte e histórico

- [x] 2.1 Marcar el flujo HTTP simulado actual como histórico y no canónico
- [x] 2.2 Actualizar playbooks, matrices y documentos de reunión para evitar la
  narrativa “SISCA envía clientes válidos”
- [x] 2.3 Quitar referencias canónicas a documentación o presentaciones que
  describan el flujo anterior como vigente

## 3. Mantener implementación bloqueada hasta aprobación documental

- [ ] 3.1 Revisar y aprobar con negocio el flujo objetivo documentado
- [ ] 3.2 Definir el endpoint técnico real con el que Rewards consultará SISCA
- [ ] 3.3 Planear implementación del registro Rewards y de la validación SISCA
  después de la aprobación documental
