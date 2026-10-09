# Navegación: diagnóstico y corrección local

Fecha: 2026-10-08. Corrección preparada para revisión en PR borrador; sin merge ni despliegue manual.

## Base y alcance

`git ls-remote` y `git fetch origin main` confirmaron
`cc08015d1da6f0f376eee3c310fc99db02eb1e19`: PR #13 ya estaba fusionado,
aunque el encargo lo describía todavía en borrador. Incluye PR #12 y conserva
el diseño de `0b881cba4ee4df34799d3077e4f6a014d823f155`. Esto confirma la rama
remota, no el SHA realmente servido por Vercel en producción.

La rama original `codex/bonda-gift-cards-preparation` tenía cambios ajenos en
`docs/bonda-coupons-runbook.md` y archivos sin seguimiento en `output/` y `tmp/`.
Se conservaron. Los cambios de esta tarea están en la rama
`codex/navigation-performance`, worktree `/tmp/carobra-navigation-performance`.
La línea base es una copia de `git archive cc08015` en
`/tmp/carobra-navigation-baseline`, sin archivos de entorno ni credenciales.
No se cambió el preview Skandia de 4325 ni se reabrió el antiguo de 4327.

## Diagnóstico sustentado por código

1. **Saldo remoto en la ruta crítica común.** `src/middleware.ts` espera
   `/rewards/customer-context` antes de renderizar cualquier página protegida.
   El BFF autentica, sincroniza evidencia y carga el portal. Su resumen llama
   a `BondaPointsApplication.getBalance`; una observación de más de 60 segundos
   provoca un GET remoto de wallet. Hasta Cursos y Productos esperan ese saldo.
2. **Lecturas repetidas.** Actividad vuelve a solicitar `/rewards/portal` aunque
   el middleware ya lo cargó. Productos lo repite cuando el resultado es `null`,
   amplificando un fallo. El portal no es una lectura trivial: además del
   resumen, carga movimientos, actividades y siete conjuntos de datos locales.
3. **Caché de cinco minutos sobre datos sensibles al tiempo.** El BFF guarda el
   perfil, validación, evidencia y portal completos por cookie. El segundo
   request puede evitar revalidar una sesión revocada por otro proceso y puede
   seguir mostrando un saldo marcado `FRESH` después de su ventana de 60 s.
   Las invalidaciones por comandos locales no cubren cambios externos.
4. **Esperas adicionales de catálogo.** Inicio hace dos lecturas paralelas tras
   el contexto, con límite de 5 s. Beneficios espera catálogo y después historial,
   sin límite frontend. Cursos espera hasta 12 s. El listado de Cursos usa un
   catálogo local y DB; las llamadas remotas de contenido corresponden al detalle.
   No se atribuye su latencia de listado directamente a Bonda.
5. **DB y sesiones.** Perfil y validación ya se consultan en paralelo. La
   proyección vigente tiene un fast path, pero si la evidencia no está al día,
   su sincronización puede escribir y asignar puntos. El pool PostgreSQL tiene
   máximo cinco conexiones; las consultas paralelas del portal pueden hacer cola.
   No hubo EXPLAIN ni medición de DB productiva; no se cambiaron índices ni pool.
6. **Cliente.** Es navegación multipágina SSR con enlaces normales. No hay
   hidratación de React ni ClientRouter en el shell. Montserrat se empaqueta
   localmente. Leaflet (~148 KiB sin comprimir en el build) pertenece al detalle
   del beneficio/mapa, no demuestra un bloqueo común de las cinco rutas.
   La QA manual disponible no incluye ResourceTiming ni permite atribuir demoras
   a fuentes, descarga, pintura o ejecución de JS; no se modificaron esos recursos.

### Por qué no se midió navegando producción

`GET customer-context` y `GET portal` pueden sincronizar evidencia y otorgar
puntos idempotentes; catálogo sin `preview=true` puede afiliar al cliente;
historial puede conciliar canjes pendientes. Un GET no garantiza ausencia de
mutaciones. No se probó una cuenta real ni se hicieron llamadas nuevas a Bonda,
canjes, cambios de configuración o consultas con secretos. El incidente de
módulos bloqueados queda fuera de este cambio.

## Correcciones locales

- El resumen obtiene `getStoredBalance`, que consulta únicamente observaciones
  locales. Conserva `UNAVAILABLE` y `null` si no conoce el saldo; un cero real
  sigue siendo cero. Conserva la ventana existente de 60 s y marca observaciones
  más antiguas `STALE` con fecha. No dispara una consulta remota en segundo plano.
- El componente de saldo consulta posteriormente `/api/v1/rewards/bonda-balance`
  cuando la observación está vencida o ausente. Muestra estado de consulta,
  fallo y reintento; una actualización fallida no deja un saldo marcado actual.
  El endpoint vuelve a autenticar, deriva el cliente de su sesión e ignora IDs
  recibidos por query string. No afilia ni asigna puntos. El navegador usa el BFF
  del mismo origen; no recibe tokens de proveedor. Sin JS queda la observación
  local explícita, sin actualización automática.
- Se retiró la caché resuelta de cinco minutos. Las peticiones de contexto, el preview de beneficios y las lecturas de cursos
  solapadas de una misma sesión comparten sólo la promesa de identidad. Una vez
  completada se descarta. Los comandos y rutas que pueden afiliar, conciliar o sincronizar vuelven a
  verificar identidad aunque exista otra autorización en curso. No se cambió la
  validación de canjes, niveles ni reglas de puntos.
- El contexto admite `?include=home|benefits|courses`. Reutiliza una sola
  autenticación dentro de esa petición. Inicio y Cursos solapan sus lecturas
  con la proyección del portal, después de sincronizar evidencia. Beneficios
  conserva portal exitoso → catálogo → historial; no afilia después de un portal
  fallido. Los fallos parciales son explícitos y no disparan otra lectura.
  El frontend conserva compatibilidad con un BFF anterior sin esos módulos.
- Actividad y Productos reutilizan exactamente el portal de la petición actual,
  incluido `null`. Las páginas autenticadas renderizadas declaran
  `Cache-Control: private, no-store`.
- Se conservan las esperas anteriores de catálogo (Inicio 5 s, Cursos 12 s;
  Beneficios sin nuevo límite frontend). Las primeras pruebas con presupuestos
  menores entregaban fallback antes, pero no completaban el contenido y no
  cancelaban el trabajo del BFF. Esa variante fue retirada y no forma parte de
  los resultados finales. El fallo del historial se informa sin borrar un
  catálogo que sí llegó; 401 sigue redirigiendo.
- El gateway del saldo ya limita su petición a `min(configuración, 10 s)` y
  aborta la señal del transporte. El cliente espera hasta 12 s. La aplicación
  comparte una lectura remota en curso por cliente y proceso: tres olas de
  veinte peticiones simultáneas producen una lectura por ola incluso al fallar.
  La lectura local de portal no espera esa promesa. No hay nuevos retries,
  polling ni precarga de rutas con efectos laterales. `pagehide` cancela la
  espera del componente y el proxy reenvía su señal; esto no garantiza cancelar
  el transporte remoto compartido del BFF: la consulta en curso puede terminar, pero
  está acotada y las solicitudes solapadas de ese cliente no la multiplican en
  ese proceso. No hay coordinación entre réplicas; no afirmar cancelación global.

## Método reproducible

Script: `site-frontend/tests/performance/navigation.mjs`.

- Node 24.21.0; build real Astro/Vercel y `createSiteBackendServer` real.
- Se ejecutan el resumen real y `BondaPointsApplication` real. Identidad, DB,
  almacenamiento del saldo, portal complementario y aplicaciones de catálogos
  son fixtures. No hay persistencia real, pool, proveedor, internet ni CDN.
- Catálogos poblados: cuatro beneficios y doce cursos sintéticos, sin imágenes
  remotas. El historial válido está vacío y tarda 30 ms. Las aserciones comprueban
  tarjetas concretas en Inicio y Beneficios cuando el escenario es exitoso.
- Identidad: 25 ms por lectura, perfil/validación concurrentes. Cada consulta
  simulada del resumen: 10 ms. Almacenamiento de saldo: memoria, sin retardo.
- Escenario normal: wallet 150 ms y cada catálogo 80 ms. Lento: wallet 1.200 ms
  y cada catálogo 3.000 ms. Fallo: mismas latencias, wallet rechaza, beneficios
  responde indisponible y Cursos falla. Es una prueba de inyección de fallos,
  no una reconstrucción exacta del incidente de producción.
- Tres recorridos por combinación de escenario y temperatura, cinco páginas:
  Inicio → Beneficios → Cursos → Productos → Actividad. 90 respuestas por versión.
- Frío significa cookie nueva y observación de saldo vaciada **por página**.
  Caliente reutiliza ambas dentro del recorrido. No significa cold start de
  Vercel ni caché caliente de un navegador. La primera entrada caliente también
  establece el contexto; se conservan todas las muestras.
- Se mide hasta recibir cabeceras del adaptador SSR (`headersMs`) y hasta leer
  HTML completo (`totalMs`), además de `Server-Timing`. No es TTFB de internet ni
  click-to-paint. No se ejecuta JS del navegador. Después del HTML se simula aparte la consulta
  HTTP de saldo que haría el componente, cuando hace falta. Se registran
  `balanceRefreshMs`, `balanceReady` y `allDisplayedDataMs` (HTML + esa respuesta),
  separados de la navegación. `contentReady` exige los datos del contenido
  principal; `serverContentMs` es nulo cuando sólo llegó el fallback. Es tiempo
  de datos disponibles en servidor, no tiempo hasta contenido visible/interactivo. Las aserciones garantizan status 200 y
  que cada solicitud fría alcance el portal; las llamadas se cuentan.
- Las dos versiones se ejecutaron en procesos separados de la misma Mac; compilación e instalación no
  forman parte de las muestras. Tres muestras sirven para comparar este caso
  local, no para prometer percentiles productivos o porcentajes globales.

Comandos desde cada checkout, con Node 24 en PATH y dependencias instaladas:

```sh
npm --prefix site-backend run build
npm --prefix site-frontend run build
```

Desde el worktree de la corrección:

```sh
node site-frontend/tests/performance/navigation.mjs /tmp/carobra-navigation-baseline output/navigation-performance/before.json
node site-frontend/tests/performance/navigation.mjs /tmp/carobra-navigation-performance output/navigation-performance/after.json
```

Los JSON guardan cada muestra, bytes, contadores y Server-Timing. No contienen
cookies, credenciales ni clientes reales. El entorno requiere permiso para
escuchar únicamente en loopback; los servidores usan puertos efímeros y se cierran.

<!-- RESULTS -->
## Resultados finales (milisegundos, medianas de tres muestras)

Tiempo hasta HTML completo; el tiempo hasta cabeceras está en los JSON. No es pintura ni interacción de navegador.

| Escenario | Página | Frío antes → después | Caliente antes → después |
| --- | --- | ---: | ---: |
| Normal | Inicio | 315 → 114 | 113 → 112 |
| Normal | Beneficios | 319 → 165 | 118 → 165 |
| Normal | Cursos | 309 → 112 | 111 → 110 |
| Normal | Productos | 202 → 53 | 2 → 52 |
| Normal | Actividad | 255 → 53 | 51 → 53 |
| Lento | Inicio | 4284 → 3032 | 3033 → 3031 |
| Lento | Beneficios | 4286 → 3086 | 3036 → 3086 |
| Lento | Cursos | 4281 → 3031 | 3031 → 3032 |
| Lento | Productos | 1254 → 52 | 3 → 53 |
| Lento | Actividad | 1302 → 53 | 51 → 52 |
| Fallo | Inicio | 4282 → 3033 | 3031 → 3031 |
| Fallo | Beneficios | 4255 → 3054 | 3003 → 3053 |
| Fallo | Cursos | 4280 → 3031 | 3030 → 3030 |
| Fallo | Productos | 1253 → 53 | 3 → 51 |
| Fallo | Actividad | 2505 → 53 | 1253 → 51 |

Disponibilidad del contenido de la fixture (30 respuestas por escenario):

| Escenario | HTTP 200 antes / después | Contenido principal antes / después | Todos los datos mostrados, incluido saldo, antes / después |
| --- | ---: | ---: | ---: |
| Normal | 30/30 / 30/30 | 30/30 / 30/30 | 30/30 / 30/30 |
| Lento | 30/30 / 30/30 | 30/30 / 30/30 | 30/30 / 30/30 |
| Fallo | 30/30 / 30/30 | 12/30 / 12/30 | 6/30 / 6/30 |

Tiempo hasta todos los datos mostrados, en escenario lento y frío. En la versión nueva suma el HTML y la consulta de saldo posterior simulada por HTTP; no mide JS, pintura ni descarga de imágenes.

| Página | Antes | Después |
| --- | ---: | ---: |
| Inicio | 4284 | 4263 |
| Beneficios | 4286 | 4317 |
| Cursos | 4281 | 3031 |
| Productos | 1254 | 52 |
| Actividad | 1302 | 1284 |

Contadores sobre 90 navegaciones (las consultas SQL son sólo las del resumen simulado):

| Fase | Identidad | Portal | Wallet remoto | SQL simulado |
| --- | ---: | ---: | ---: | ---: |
| Antes SSR | 204 | 66 | 54 | 198 |
| Después SSR | 180 | 90 | 0 | 270 |
| Después saldo diferido | 76 | 0 | 38 | 0 |

**Interpretación:** la dependencia remota del saldo sale de SSR y Productos/Actividad pueden mostrar datos locales antes. El saldo completo puede llegar después; no se promete que toda la página termine antes. La versión final conserva el éxito de catálogos lentos y muestra fallos cuando realmente fallan. Agrupar módulos por petición reduce identidad SSR (204 → 180); al sumar el saldo diferido son 256 lecturas. Retirar la caché resuelta aumenta portales (66 → 90) y mantiene una regresión caliente en Beneficios y Productos. Se deja explícita para revisión, sin volver a reutilizar sesiones, permisos o balances antiguos. No extrapolar un porcentaje global ni tiempos productivos.
<!-- END RESULTS -->

## Revisión de la regresión caliente

La primera corrección necesitaba 348 lecturas de identidad SSR; compartir sólo
promesas pendientes la redujo a 312. La variante final agrupa los módulos de
Inicio, Beneficios y Cursos dentro de la misma petición autenticada al contexto
existente: baja a **180**, frente a **204** en la base. Son dos consultas API
concurrentes por navegación, perfil y validación. No se añadió un servicio nuevo,
TTL de autoridad, precarga ni caché de datos entre navegaciones.

En normal caliente, Inicio pasa de 113 a 112 ms y Cursos de 111 a 110 ms.
Beneficios pasa de 118 a 165 ms y Productos de 2 a 52 ms; Actividad queda cerca
(51 → 53 ms). El saldo diferido agrega 76 lecturas de identidad: **256 totales**
frente a 204 antes. La SQL contada pertenece sólo al resumen de la fixture;
no representa toda la carga del portal real.

| Página (18 muestras cada una) | Identidad SSR antes → después | Portal antes → después | Motivo de la lectura actual |
| --- | ---: | ---: | --- |
| Inicio | 60 → 36 | 12 → 18 | Resumen, timeline y notificaciones actuales; preview y cursos reutilizan autorización. |
| Beneficios | 18 → 36 | 9 → 18 | Journey/nivel y notificaciones; conserva sincronización previa al catálogo con posible afiliación. |
| Cursos | 54 → 36 | 9 → 18 | Shell con journey/nivel y notificaciones; cursos reutiliza autorización. |
| Productos | 18 → 36 | 9 → 18 | Productos/objetivos actuales y shell; antes la caché evitaba casi todo el trabajo caliente. |
| Actividad | 54 → 36 | 27 → 18 | Timeline/detalles actuales; se elimina la segunda lectura del portal. |

El total de portales crece 66 → 90 al retirar la caché de cinco minutos; Actividad
sí baja 27 → 18. **No se elimina la posibilidad de más sincronizaciones de
evidencia** en navegaciones calientes. Aunque el flujo existente es idempotente,
son lecturas/escrituras potenciales que requieren comprobar capacidad en staging.
Servir datos locales durante un TTL tampoco garantizaría balances, permisos,
productos o notificaciones actuales. No hay invalidación distribuida disponible.
Separar proyecciones mínimas por página podría reducir carga, pero requeriría
cambiar el contrato del shell y decidir qué datos pueden diferirse; queda fuera
de esta corrección acotada. La regresión restante se entrega como tradeoff para
revisión, no como una mejora uniforme ni una decisión de despliegue aprobada.

El intervalo mediano entre cabeceras SSR y HTML fue 0,13 ms antes y 0,22 ms
después (máximos 0,92 y 1,56 ms). El bloqueo medido estaba antes de entregar el
documento. `auth-context` ahora incluye los módulos agrupados: no interpretarlo
como tiempo puro de autenticación. No incluye red pública, fuentes ni pintura.

## Comprobaciones y límites pendientes

- Backend: build y suite de **350 aprobadas, 7 omitidas**, cero fallos. Se
  ejecutó después la omitida de progreso de cursos usando PGlite ya instalado:
  **1/1 aprobada**. Acumulado: **351 aprobadas, seis pendientes** que requieren
  PostgreSQL dedicado. Los casos de saldo también corren con PGlite.
- Frontend: `astro check` y build Node 24/Vercel correctos; contratos **10/10**,
  runtime **5/5**, SSR compilado **9/9**. `git diff --check` limpio.
- Ajuste de pruebas tras CI: las fixtures de Actividad ahora se conservan
  también en el contexto reutilizado; una regresión comprueba igualdad con la
  ruta de portal. El test móvil retira sólo la barra dev de Astro que interceptaba
  el click. No cambió código de aplicación ni las condiciones del benchmark.
- Regresiones nuevas: aislamiento por sesión concurrente, revalidación tras
  cambio/revocación, reintento tras fallo, independencia de autorización de
  comandos, endpoint de saldo atado a identidad, lectura local de saldo sin
  proveedor, distinción cero/desconocido, envejecimiento de observaciones,
  fallback sin repetir portal, fallo de módulos y espacios del HTML para una
  actualización posterior. Las pruebas existentes preservan canjes y niveles.
- Las tres pruebas automatizadas E2E de saldo diferido, recuperación y expiración
  de sesión se prepararon, pero no se ejecutaron localmente con Playwright: el
  usuario limitó el navegador local al integrado IAB. La configuración existente
  de CI ejecuta Playwright/Chromium; su resultado se informa en el PR.
- **QA manual IAB final completada**, posterior a la agrupación y `pagehide`, en
  desktop 1440×1000 y móvil 390×844, con datos sintéticos. Las cinco rutas
  respondieron durante demora de saldo de cuatro segundos, sin overflow; cambio
  de cuenta durante refresh, logout y guardas anónimas no mostraron datos de la
  cuenta anterior. Se verificaron STALE → UNAVAILABLE, dos fallos de transporte,
  reintento y recuperación a cero FRESH. Salir durante reintento y volver con
  Atrás no dejó controles bloqueados ni errores heredados. Sin regresiones
  reproducibles observadas. La revisión anterior también cubrió DISABLED.
- Las tarjetas agrupadas y los cursos se comprobaron en UI. Historial poblado,
  fallo de módulos y ausencia de nuevas lecturas tras auth401 están cubiertos
  por pruebas de servidor, no por tráfico capturado ni historial poblado en UI.
  IAB no expuso inspección de red: **no se verificó cancelación efectiva del
  transporte**, ni se afirma cancelación de Bonda. No se probaron dos perfiles
  simultáneos; concurrencia y aislamiento están cubiertos en backend.
- Los tiempos click→captura DOM de QA son indicativos, sin throttling ni base
  comparativa: **no son pintura, LCP, TTFB ni benchmark**. Las capturas sintéticas
  se inspeccionaron en la conversación, sin archivos de imagen persistidos.
  La QA cerró sesión/pestaña, restauró viewport y detuvo únicamente mock3031 y
  dev4331; Skandia4325 quedó intacto.
- Tampoco se midieron latencia/colas reales de DB, identidad, red, CDN ni carga
  concurrente productiva. No atribuir los resultados al sitio desplegado.
- El retiro de la caché incrementa las lecturas locales y el total de identidad
  cuando se suma el refresh diferido: conviene
  validar esa capacidad en un staging autorizado. La sincronización del portal
  y una dependencia de DB lenta todavía pueden bloquear navegación; no se
  cambió ese flujo de negocio. Reducir más carga requeriría proyecciones mínimas
  por página, sin volver a introducir caché de permisos.
- Corrección lista para revisión, con medición sintética y QA IAB final
  terminadas. Quedan las seis pruebas de PostgreSQL dedicado y la validación de
  capacidad/latencia en un staging representativo; el PR informa la ejecución
  E2E de CI. No se creó staging, infraestructura ni acceso persistente. No hubo
  merge, despliegue manual ni llamadas nuevas a Bonda durante la implementación.

## Evidencia y separación para revisión

Las 180 muestras comparables están versionadas en
[`before.json`](../site-frontend/tests/performance/results/before.json) y
[`after.json`](../site-frontend/tests/performance/results/after.json). Contienen
sólo tiempos, estados y contadores de fixtures; no cookies ni datos de clientes.
Los parches siguientes permanecen como artefactos locales de la revisión previa
a publicar el PR; no se incluyen archivos `output/` en Git.


`output/navigation-performance/review-01-wallet-decoupling.patch` aísla la
lectura local y el refresh de saldo; conserva la caché preexistente únicamente
para poder revisar ese cambio por separado. **No es la variante medida ni una
recomendación para desplegar sola:** conservaría el riesgo preexistente de datos
y autoridad obsoletos. `review-02-fresh-context-and-bundles.patch` muestra por
separado el retiro de esa caché, deduplicación y agrupación por petición, junto
con cambios de adquisición/fallback. `review-03-tests-and-evidence.patch`
contiene contratos, regresiones, fixtures, benchmark y documentación. Aplicados
en orden reconstruyen exactamente el cambio completo, `changes.patch`.
Sólo el conjunto final se compiló, probó y midió. Los parches son ayudas de
revisión; el PR mantiene el conjunto medido.
