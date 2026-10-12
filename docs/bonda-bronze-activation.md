# Activación acotada de afiliación desde Bronce

Estado: preparada localmente; NO activada en producción.

## Evidencia actual

El 8 de octubre de 2026 se verificó `site-backend` producción en Railway,
commit `5761c9f052d153f3ee8385c91b48aca32c5ccabd`. La afiliación está apagada,
no hay token específico de afiliación y el esquema aplicado llega a `026`.
Las cinco altas sintéticas previas confirmaron el permiso de la clave compartida
para el micrositio `913085`; esto no garantiza permisos de cualquier otra clave.

## Cambio a publicar y alcance

- El servidor ejecuta un lote de hasta 25 eventos al arrancar y espera 60 segundos
  después de terminar para el siguiente. No solapa lotes; usa las reclamaciones
  exclusivas de la tabla de afiliación y se detiene al cerrar el servidor.
- Sólo procesa eventos futuros capturados por `028`. No ejecuta backfill.
- La aplicación vuelve a comprobar cliente y journey ACTIVE, nivel Bronce o
  superior y el Rewards ID canónico. Registro solo no basta. No requiere visitar
  Beneficios para que el procesador atienda una transición registrada.
- Antes del POST escribe intención durable ACTION_REQUIRED. Después valida con
  GET la identidad y micrositio. Una respuesta ambigua no autoriza otro POST,
  aunque GET no encuentre el afiliado; queda pendiente de revisión. Una consulta
  posterior puede confirmar la existencia, sin reenviar el alta.
- Envía únicamente `code` y `send_welcome_email:false`. No envía ficha personal,
  crea contraseñas, acredita puntos, canjea ni activa sincronización de perfil.

## Secuencia operativa propuesta

1. Publicar sólo el backend revisado; la propuesta visual requiere revisión aparte.
2. Con las variables existentes del runtime, ejecutar
   `node dist/src/rewards/bonda/affiliate-schema-cli.js` (sólo plan).
   Con autorización de activación, añadir `--apply`.
   Instala **únicamente 028**, verifica dependencias 021/022 y usa el lock del
   migrador. No ejecutar `db:migrate`, que también aplicaría 027 y 029.
3. Verificar que `capture_enabled=false` y la cola está vacía. 028 no rellena
   clientes históricos ni depende de 027. Conservar las otras banderas apagadas.
4. Configurar únicamente los valores no secretos
   `BONDA_AFFILIATE_USE_SHARED_KEY=true` y
   `BONDA_AFFILIATE_PROVISIONING_ENABLED=true` en el servicio existente. El primer
   valor habilita explícitamente el uso interno de la clave compartida existente;
   no copiar, exportar ni reemplazar secretos. Si hay token específico, tiene
   precedencia. El opt-in solo no activa ninguna escritura.
5. Tras verificar despliegue y procesador, activar la captura:
   `UPDATE bonda_affiliation_event_controls SET capture_enabled=true WHERE singleton;`
6. Ejecutar la fixture nueva autorizada con el CLI dedicado:
   `node dist/src/rewards/bonda/affiliate-fixture-cli.js --plan` muestra todos los
   campos antes de escribir. `--prepare` crea únicamente la identidad sintética,
   cuenta cero y journey INVITED. Esperar un ciclo del worker y comprobar con
   `--verify` que no hay afiliado. Luego `--activate` registra el hecho sintético
   y aplica la decisión con el evaluador y store canónicos. Esperar el worker,
   ejecutar `--verify` y comprobar ACTIVE, generaciones consumidas, un intento,
   GET externo exacto y cero ledger/reward_events. Repetir `--activate` demuestra
   replay sin nueva decisión ni alta. El CLI jamás invoca createAffiliate.

### Fixture exacta, sin producto financiero real

- Email: `revision.bonda.bronce.20261008@carobra.test`.
- Nombre/apellido: `Prueba` / `Bonda Automatica`.
- CURP marcador deliberadamente inválido: `BOND000000HDFXXX00`.
- Teléfono `0000000000`, CP `00000`, estado/ciudad `PRUEBA`.
- UUID nuevo y Rewards ID aleatorio criptográfico de nueve dígitos en el mismo
  rango del generador canónico; nunca reemplaza identificadores existentes.
- Sin auth_user, contraseña, sesión, consentimiento inventado ni correos.
- Hecho de producto: provider `SYNTHETIC_QA`, tipo
  `SYNTHETIC_AFFILIATION_TEST`, source `BONDA_AFFILIATION_QA`, evidencia marcada
  `synthetic:true,notFinancialProduct:true`. No se presenta como SISCA o Skandia.
- Usa `V2_FIRST_ACTIVE_PRODUCT_LEVEL`, habilitada en producción. No habilita
  `V2_LEVEL_PRECEDENCE`, actualmente apagada. Se calcula con evaluateRewardsLevel
  y persiste mediante PostgresJourneyLevelStore; la migración 028 captura el cambio.
- No usa registro/portal, que pueden acreditar puntos. No crea reward_events,
  ledger_entries ni jobs financieros. Rechaza una fixture con saldo o movimientos.
- `--prepare` es idempotente y `--activate` conserva una sola decisión. Si encuentra
  identidad diferente, productos ajenos o reglas incompatibles, se detiene.
- La prueba verifica el paso decisión canónica → evento → worker → afiliación.
  No pretende validar el intake de un proveedor financiero ni el login del cliente.

El runner permanece fuera del servidor HTTP y del scheduler. Sólo se ejecuta
explícitamente después de autorizar esta fixture. Los tests locales con PGlite,
gateways sintéticos y DDL real comprueban Invited sin alta, Bronce por regla
canónica, un alta por worker, replay y cero puntos. Producción sigue pendiente.

El procesador vive en el servicio actual: no requiere nuevo servicio, cron
externo, credencial persistente adicional ni contratación. Su consumo es
acotado, aunque continúa utilizando los recursos del servicio existente.

## Fallos y pausa

Errores anteriores al envío se reintentan con backoff. Un POST incierto permanece
ACTION_REQUIRED; nunca se convierte en PENDING para intentar a ciegas. Consultar
los contadores sanitizados `bonda_affiliation_events` y estados de la cola.

Para pausar nuevas capturas, poner `capture_enabled=false`; para detener también
altas por otros caminos, apagar `BONDA_AFFILIATE_PROVISIONING_ENABLED` y esperar
el cierre/despliegue del proceso. No borrar la cola ni afiliados. No deshacer
migraciones con información pendiente. No se promete disponibilidad total de un
proveedor externo.
