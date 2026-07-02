# SISCA Excel Preliminary Classification

## 1. Objetivo

Este documento clasifica preliminarmente el Excel de SISCA para la reunión. No
define todavía el contrato técnico final. Su propósito es explicar qué campos
parecen describir:

- la identidad del cliente;
- la relación operativa con AFORE;
- contexto comercial;
- información financiera;
- trazabilidad temporal;
- rechazos y observaciones.

## 2. Mensaje principal para la reunión

El Excel actual funciona como diccionario preliminar de negocio, no como
contrato técnico final de integración.

Todavía falta confirmar con SISCA:

- nombres técnicos oficiales;
- tipos de datos;
- longitudes;
- campos obligatorios;
- catálogos;
- valores nulos;
- formato de fechas;
- reglas condicionales;
- autenticación;
- formato definitivo de transporte.

## 3. Agrupación funcional sugerida

### Grupo A. Identidad y contacto del cliente

Campos típicos:

- Cliente
- Teléfono
- Celular
- Email
- Código postal
- NSS
- CURP
- Edad

Uso preliminar:

- identificar a la persona;
- contactarla;
- soportar onboarding y comunicaciones.

Lectura recomendada:

- CURP y NSS vienen de SISCA y no deberían editarse desde Rewards;
- CURP sirve para detectar duplicados;
- correo y teléfono sirven para contacto y onboarding;
- edad no debería tratarse como identificador.

### Grupo B. Información del trámite o servicio AFORE

Campos típicos:

- Tipo Mov.
- Estatus SF
- Estatus Procesar
- Confirmación
- Movilidad
- Pplus
- Folio
- Número de oportunidad
- Afore
- Fechas de traspaso
- Transfer Out

Uso preliminar:

- describir el movimiento o trámite del servicio;
- no describir la identidad permanente de la persona.

Lectura recomendada:

- estos datos deberían asociarse a la relación `customer_services` o a futuras
  extensiones del servicio;
- no deberían vivir como atributos permanentes del `customer`.

### Grupo C. Información comercial y operativa

Campos típicos:

- Broker
- Gerencia
- Analista
- NAP
- Clave
- Número de empleado
- Comisionista
- Nivel
- Categoría
- Campaña
- Tipo de venta

Uso preliminar:

- seguimiento interno;
- atribución comercial;
- reportes y análisis operativo.

Lectura recomendada:

- no todos estos campos son necesarios para crear la identidad Rewards;
- varios podrían ser metadata de trazabilidad y no campos críticos del MVP.

### Grupo D. Información financiera

Campos típicos:

- Saldo estimado
- Saldo real
- Saldo pago
- Anticipo
- Seguimiento de anticipo
- Estatus de pago

Uso preliminar:

- análisis financiero;
- soporte de reportes o reglas futuras;
- no condición inmediata del alta técnica actual.

### Grupo E. Fechas operativas

Campos típicos:

- Fecha de captura
- Fecha de anticipo
- Fecha de traspaso
- Fecha de cierre
- Fecha de rechazo
- Fecha de pago
- Fecha de envío AV

Uso preliminar:

- trazabilidad;
- reconstrucción de eventos;
- soporte de auditoría.

Lectura recomendada:

- antes de modelarlas hay que confirmar qué evento real representa cada fecha;
- no todas deben asumirse obligatorias desde el MVP.

### Grupo F. Rechazo y observaciones

Campos típicos:

- Tipo de rechazo
- Rechazo
- Observaciones

Uso preliminar:

- explicar por qué un movimiento no avanzó;
- apoyar análisis operativo o auditoría.

Lectura recomendada:

- para el MVP puede bastar un resultado principal y motivos controlados;
- el detalle de catálogos de rechazo debe confirmarse con SISCA antes de cerrar
  el contrato.

## 4. Campos que conviene destacar en la reunión

| Campo | Uso preliminar |
| --- | --- |
| `CURP` | Detección de cliente existente |
| `Cliente` | Identificación de la persona |
| `Celular` | Contacto y onboarding |
| `Email` | Acceso y comunicaciones |
| `Tipo Mov.` | Identificar el movimiento |
| `Estatus SF` | Estado principal del trámite |
| `Confirmación` | Confirmar el resultado final |
| `Fecha de traspaso` | Trazabilidad operativa |
| `NAP` | Relación con asesor o seguimiento |
| `Folio` / `oportunidad` | Referencia cruzada con SISCA |
| `Afore` | Confirmación del servicio del MVP |

## 5. Mapeo preliminar al modelo actual

### Ya mapeado hoy

- `CURP` -> `customers.curp` / `customer_intake_requests.curp`
- `NSS` -> `customers.nss`
- `Cliente` -> `customers.name`
- `Email` -> `customers.email`
- `Celular` o teléfono -> `customers.phone`
- `Código postal` -> `customers.postal_code`
- `Afore` -> servicio `AFORE` en `services` y `customer_services`

### Todavía no mapeado de forma final

- `Tipo Mov.`
- `Estatus SF`
- `Confirmación`
- `Folio`
- `Número de oportunidad`
- `Movilidad`
- `Pplus`
- campos comerciales
- campos financieros
- fechas operativas
- observaciones y rechazos detallados

## 6. Qué decir si preguntan por qué no todo está en la base

Respuesta sugerida:

> No todas las columnas del Excel describen la identidad del cliente. Parte del
> trabajo fue separar qué pertenece a la persona, qué pertenece al servicio
> AFORE y qué pertenece a trazabilidad comercial u operativa. El modelo actual
> ya refleja esa decisión y evita mezclar datos permanentes de la persona con
> movimientos del servicio. Lo pendiente depende del contrato técnico oficial de
> SISCA y de la confirmación de catálogos.
