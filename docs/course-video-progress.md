# Avance de videos de cursos y bienestar

- El cliente ve únicamente **Sin completar** o **✓ Completado**, igual para ambos métodos y también después de recargar. No ve porcentajes, el origen del marcado ni mensajes del umbral automático. La presentación no modifica los datos reales del reporte.
- El control está al pie de la descripción, en un área separada. Los guardados de reproducción no desactivan ni cambian de color el botón; las actualizaciones finales pendientes se envían al terminar la petición anterior.
- **Marcar como completado** registra la declaración del cliente. No inventa minutos reproducidos.
- Vimeo registra los tramos de reproducción continua. Al cubrir el 80% de la duración informada por el proveedor, se marca automáticamente.
- Saltos al final, pausas y repeticiones no suman cobertura ficticia. La unión de tramos permite continuar en otra sesión sin duplicarlos.
- Un curso se completa cuando todos sus capítulos están marcados. Se guardan por separado las fechas de marcado manual y de reproducción detectada.
- El estado cambia a «Completado» únicamente tras la confirmación del servidor. Ante un fallo se conserva lo pendiente en la página y aparece **Reintentar**. Cerrar el navegador puede perder los últimos segundos no guardados; se intenta guardar cada 15 segundos, en pausa y al salir.
- La reproducción es telemetría del navegador, no evidencia de atención ni de aprendizaje. No otorga puntos, nivel o certificados.
- Sin una duración válida del proveedor, permanece disponible el marcado manual; no se calcula la finalización automática.

## Seguridad y operación

La sesión determina el cliente; no se acepta su ID en el cuerpo. Cada lectura/escritura comprueba el acceso actual por nivel. Los POST requieren JSON y cabecera de acción; el proxy exige mismo origen. Una falla de almacenamiento del avance no bloquea el catálogo ni el reproductor.

Se agrega solamente `rewards_course_video_progress` e índice mediante `026_course_video_progress`. No cambia clientes, saldos, niveles ni tablas de progreso anteriores. El propietario autorizó esta migración de forma separada. No ejecutar migraciones pendientes ajenas como parte de esta activación. Para revertir la funcionalidad, revertir el código y conservar la tabla con su historial; no ejecutar el `down` en producción.

## Consulta para el equipo

No hay un panel administrativo nuevo. Un operador autorizado con acceso a la base puede obtener CSV mediante el comando de solo lectura. Compilar primero con `npm run build` en `site-backend` y cargar `DATABASE_URL` mediante el mecanismo seguro habitual (no escribir la contraseña en la línea de comandos).

```sh
npm run --silent courses:progress:report -- --course-id 1256 --limit 100 --offset 0
npm run --silent courses:progress:report -- --customer-id UUID_DEL_CLIENTE --limit 100
```

Límite máximo: 1000 registros por página. Para la siguiente página, aumentar `--offset`. Incluye ID de cliente, curso, capítulo, porcentaje registrado y las dos fechas de completado; no incluye email, credenciales ni enlaces privados. Los clientes que no han registrado nada no generan filas. Tratar el archivo como datos personales internos y no publicarlo. El acceso requiere credenciales de base, nunca una cuenta común del portal.

## Pruebas

`npm test` en el backend. La prueba SQL aislada se activa con `PGLITE_MODULE_PATH` apuntando al módulo instalado temporalmente de `@electric-sql/pglite`; nunca usa `DATABASE_URL`. Es PostgreSQL embebido de una sola conexión: comprueba SQL, persistencia y rollback, pero no sustituye una prueba de contención multi-conexión en PostgreSQL remoto.

En frontend: `pnpm exec playwright test courses.spec.ts course-progress.spec.ts playback-coverage.spec.ts` (fixture local, escritorio y móvil), `pnpm check`, `pnpm build` y pruebas de contratos.

### Verificación de esta entrega — 23 de septiembre de 2026

- Revisión posterior: 18 pruebas de navegador aprobadas, incluyendo guardado lento concurrente con el final/umbral, conservación al recargar y posición bajo la descripción. Chequeo Astro sin errores. Una observación breve del Vimeo real confirmó recepción de reproducción continua; sus escrituras se bloquearon durante el diagnóstico para no alterar el historial. No se verificó una reproducción real completa de todos los cursos.
- Backend: 232 pruebas aprobadas, 6 pruebas previas omitidas por no configurar su base remota de pruebas. Incluye la migración y persistencia en PGlite aislado.
- Navegador: 16 pruebas aprobadas entre escritorio y móvil, con eventos Vimeo simulados; marcado manual, recarga, capítulos, salto al final, umbral del 90%, reintento y rechazo de otro origen.
- Frontend: compilación y chequeo sin errores; 5 contratos aprobados. El entorno local usa Node 26 y el proyecto declara Node 20; el adaptador Vercel emite una advertencia de runtime que debe resolverse antes de desplegar. No se desplegó esta entrega.
- Producción: preflight confirmó que la única migración pendiente era 026. Se aplicó únicamente `026_course_video_progress` en transacción. El reporte de lectura devolvió cero filas al activarlo.
- Local: inicio de sesión Titanio, detalle y GET de avance respondieron 200; el reproductor real de Vimeo confirmó estar listo, sin mensaje de error de avance. No se marcó ningún video ni se simuló reproducción sobre cuentas de producción.
