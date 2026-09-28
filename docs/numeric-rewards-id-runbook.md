# Migración de Rewards ID numérico

## Contrato canónico

Todo Rewards ID nuevo tiene exactamente nueve dígitos ASCII, el primero distinto de cero (`^[1-9][0-9]{8}$`). Se genera con aleatoriedad criptográfica y no codifica datos personales, secuencias, fechas ni niveles. La restricción única existente sigue siendo la autoridad final y el registro conserva su reintento acotado ante una colisión.

## Alcance de la migración

La revisión `20260910_numeric_rewards_ids`:

1. crea `customer_rewards_id_migrations` para conservar el mapeo reversible;
2. bloquea la tabla de clientes durante el cambio;
3. asigna un valor numérico único a cada ID legado;
4. actualiza referencias locales de `bonda_affiliate_provisioning` cuando la tabla existe;
5. agrega `ck_customers_rewards_id_numeric`.

No cambia emails, contraseñas, datos de perfil, estados SISCA, niveles, puntos ni fechas del cliente. Tampoco llama a Bonda. El formato numérico no autoriza afiliación ni emisión de cupones.

## Orden de despliegue

1. Mantener `BONDA_AFFILIATE_PROVISIONING_ENABLED=false` y `BONDA_COUPON_REQUESTS_ENABLED=false`.
2. Obtener un inventario de sólo conteos: clientes totales, IDs legados, IDs numéricos, duplicados y estados locales de Bonda.
3. Confirmar que no existan afiliaciones Bonda activas antes de reemplazar IDs legados.
4. Desplegar el código compatible con IDs numéricos.
5. Ejecutar `alembic upgrade head` desde `api` con la conexión aprobada.
6. Validar sólo conteos y restricciones, sin imprimir Rewards IDs ni otros datos del cliente.
7. Reiniciar FastAPI para que todo registro nuevo use el generador numérico.

## Verificación segura

La comprobación posterior debe confirmar:

- total de clientes = total con nueve dígitos;
- cero IDs legados;
- cero duplicados;
- una fila de mapeo por ID legado migrado;
- cero referencias locales Bonda sin cliente correspondiente;
- mismo conteo de clientes, estados SISCA, niveles y cuentas antes y después;
- banderas de escritura Bonda todavía deshabilitadas.

No incluir valores de Rewards ID, email, CURP, password hash ni tokens en logs o reportes.

## Rollback

Si la aplicación presenta una incompatibilidad antes de que exista cualquier escritura externa Bonda:

1. mantener apagadas todas las escrituras Bonda;
2. detener altas nuevas para evitar perder IDs creados después de la migración;
3. ejecutar `alembic downgrade 20260814_sisca_uat_audit`;
4. verificar que clientes y referencias locales recuperaron el valor anterior mediante la tabla de mapeo;
5. desplegar la versión anterior de la aplicación.

El downgrade elimina la restricción numérica después de restaurar referencias y clientes. Si llegaran a existir afiliaciones externas creadas tras el cambio, este rollback ya no es suficiente y se requiere un plan de reconciliación aprobado antes de ejecutarlo.
