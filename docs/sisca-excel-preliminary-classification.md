# SISCA Excel Preliminary Classification

## 1. Objetivo

Este documento sigue sirviendo como apoyo para entender vocabulario operativo
de SISCA, pero ya no debe interpretarse como borrador de payload completo hacia
Rewards.

## 2. Lectura correcta bajo el criterio nuevo

- Rewards registra al cliente por su cuenta.
- La data personal que Rewards necesite debe capturarse en Rewards.
- El Excel de SISCA solo orienta la interpretación de la validación AFORE.

## 3. Campos SISCA que sí importan directamente al flujo objetivo

- `Tipo Mov.`
- `Estatus SF`
- `Fecha de traspaso`

## 4. Campos que ya no deben asumirse como payload obligatorio SISCA -> Rewards

- nombre del cliente;
- teléfono o celular;
- email;
- código postal;
- cualquier otra data personal de registro.

Si Rewards necesita esos datos, pertenecen al formulario Rewards.

## 5. Nota de uso

Este archivo es un diccionario preliminar de negocio. El contrato funcional
vigente está en:

- [sisca-rewards-initial-integration-contract.md](/Users/nicolasguerrero/work/carobra-rewards/docs/sisca-rewards-initial-integration-contract.md)
