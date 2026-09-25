## Context

La presentación de retro compara el sitio actual con una propuesta de navegación, contenido y jerarquía cromática. El proyecto ya cuenta con un tema Carobra para rutas de producto, un portal V2 con estado controlado por servidor y especificaciones que impiden presentar puntos, equivalencias, inventario o disponibilidad no aprobados. El sitio público todavía usa una tarjeta ilustrativa, tres enlaces de navegación y no explica productos ni trayectoria antes del registro.

La presentación funciona como fuente de requisitos de experiencia, no como contrato técnico. Cuando una cifra o activo sugerido no existe en el repositorio, la implementación debe conservar la intención sin convertir la propuesta en un dato operativo falso.

## Goals / Non-Goals

**Goals:**

- Aplicar el significado funcional del color y reservar el degradado para el nivel del cliente.
- Hacer que la navegación autenticada incluya ayuda, contador de avisos y una barra inferior móvil útil.
- Reorganizar Inicio, Ganar puntos, Productos y Beneficios alrededor de decisiones concretas.
- Incorporar al sitio público productos, trayectoria y anticipos del catálogo antes del registro.
- Mantener la experiencia alineada con el manual de marca y con el estado del servidor.

**Non-Goals:**

- Crear o simular el video institucional que Carobra aún no entregó.
- Copiar, reconstruir o publicar logotipos de terceros sin archivos y derechos confirmados.
- Cambiar reglas del ledger, niveles, elegibilidad, catálogo o redención desde la interfaz.
- Presentar una equivalencia monetaria de puntos sin un campo aprobado en el contrato del portal.

## Decisions

### La retro guía la experiencia y el servidor conserva la autoridad de negocio

La interfaz adoptará los títulos, destinos y prioridades de la presentación. Los valores variables seguirán viniendo de `RewardsCustomerPortal`. Los 600 puntos sugeridos se comunicarán como incentivo de referencia sujeto a confirmación, sin acreditarlos ni convertirlos en saldo. La equivalencia monetaria no se calculará en el navegador porque el contrato actual no publica una tasa.

La alternativa de codificar todos los ejemplos de la presentación como datos reales produciría saldos, niveles y vencimientos falsos para clientes distintos al ejemplo.

### El shell obtiene el contador desde el contexto ya cargado

`ClientShellLayout` leerá `Astro.locals.rewardsPortal` para mostrar el contador de notificaciones sin agregar otra solicitud. El nuevo destino Ayuda usará el arreglo `help` del portal y conservará un enlace de soporte como respaldo. En móvil, los cinco destinos principales se mostrarán en una barra inferior fija; Ayuda permanecerá en el menú de cuenta y en escritorio.

La alternativa de agregar una segunda consulta al layout duplicaría trabajo en cada navegación.

### Los activos pendientes tendrán sustituciones explícitas

El sitio público aceptará un video mediante `PUBLIC_CAROBRA_INSTITUTIONAL_VIDEO_URL`. Sin esa variable mostrará una portada informativa que lleva a Quiénes somos, sin un botón de reproducción falso. Las marcas del catálogo aparecerán como nombres tipográficos bajo una etiqueta “Próximamente”; los productos autenticados conservarán monogramas hasta recibir logotipos oficiales.

La alternativa de extraer logotipos desde capturas de la presentación reduciría calidad y podría incumplir derechos de uso.

### La evidencia institucional vendrá de la fuente oficial

Quiénes somos mostrará únicamente afirmaciones publicadas por Carobra: 14 años de experiencia, más de 2,000 asesores y alianzas con instituciones líderes. La sección enlazará a la fuente oficial. No se declarará un número exacto de clientes ni un respaldo regulatorio que la fuente no especifica.

### La marca pública conserva composición y adopta tipografía aprobada

La landing mantendrá su degradado azul, sus formas y su estructura visual general. Se aplicará Montserrat como tipografía de apoyo del manual y se incorporarán las nuevas secciones con los mismos patrones existentes. El portal autenticado conservará el logotipo completo disponible a un tamaño legible; no se recortará para simular una variante compacta inexistente.

## Risks / Trade-offs

- [El video no está disponible] → La portada deja visible el destino y la variable de configuración necesaria sin prometer reproducción.
- [No existen logotipos oficiales de socios en el proyecto] → Se usan nombres o monogramas y se documenta el reemplazo pendiente.
- [La presentación contiene cifras de puntos no publicadas por el backend] → Las cifras comerciales se marcan como referencia y las tablas usan valores aprobados cuando existen.
- [La barra inferior ocupa espacio vertical en móvil] → El contenido añade espacio seguro inferior y la navegación mantiene etiquetas breves.
- [La landing gana contenido y longitud] → Las nuevas secciones se organizan con anclas y carrusel horizontal para evitar densidad excesiva.

## Migration Plan

El cambio se despliega como actualización de frontend sin migración de datos. El video puede activarse después configurando su URL pública. Los logotipos oficiales pueden reemplazar los monogramas sin cambiar la estructura. La reversión consiste en retirar las nuevas secciones y restaurar el shell y las páginas anteriores; ningún dato del cliente se transforma.

## Open Questions

- URL o archivo final del video institucional de 90 segundos.
- Archivos oficiales y autorización de uso para Skandia, Quálitas, Amazon, Cinépolis, Soriana, Uber, Starbucks e Infinity.
- Contrato definitivo para valor monetario, incentivo de contratación y precios del catálogo.
- Evidencia oficial específica de respaldo regulatorio y cifra de clientes atendidos.
