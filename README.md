# Carobra Rewards

[![CI de la API](https://github.com/NicoGuerrero11/carobra-rewards/actions/workflows/ci.yml/badge.svg)](https://github.com/NicoGuerrero11/carobra-rewards/actions/workflows/ci.yml)

Plataforma de lealtad para clientes de Carobra: reúne el registro, la validación
de productos, los puntos y el acceso a beneficios en un mismo portal.

[Uso](#uso) · [Desarrollo local](docs/development.md) ·
[Documentación](#documentación) · [Contribuir](#contribuir)

## Funcionalidades destacadas

- **Una cuenta para el cliente:** registro, inicio de sesión, Rewards ID,
  perfil y seguimiento de la validación SISCA.
- **Puntos y niveles:** consulta del saldo, nivel e historial de movimientos,
  con reglas de negocio administradas por el servidor.
- **Beneficios por nivel:** catálogo y detalle de cupones mediante la
  integración con Bonda.
- **Cursos y bienestar:** contenido por nivel y seguimiento del avance de
  videos, conservado entre sesiones.
- **Portal adaptable:** experiencia para escritorio y móvil, con actividad,
  notificaciones y ayuda.

## Acerca del proyecto

Carobra Rewards acompaña al cliente desde su registro como Invitado hasta la
validación de sus productos y el acceso a los beneficios que le corresponden.
Los puntos y el nivel se calculan con reglas distintas; el saldo por sí solo
no determina el nivel.

El repositorio contiene el sitio web, la API de identidad y el servicio de
Rewards. FastAPI gestiona clientes, consentimientos, autenticación y validaciones
SISCA. El backend en Node.js gestiona puntos, niveles, actividad e integraciones
de beneficios. Astro presenta la experiencia web y comunica el navegador con
estos servicios mediante rutas del mismo origen.

La disponibilidad de Bonda depende de las credenciales y de la configuración
del entorno. Las plantillas locales mantienen sus integraciones deshabilitadas;
consultar el catálogo no habilita la emisión de cupones ni el alta de afiliados.
La [guía de publicación](docs/production-site-release.md) explica la activación
de cada función.

## Uso

Con el entorno local iniciado, abre [Carobra Rewards](http://127.0.0.1:4321):

1. Explora la página de inicio y entra a **Registro** para crear una cuenta de
   prueba, o a **Iniciar sesión** si ya tienes una.
2. Consulta tu resumen de Rewards y el estado de validación de tus productos.
3. Explora los beneficios y cursos disponibles para tu nivel.
4. Revisa tu actividad, notificaciones y perfil desde el portal.

Para preparar ese entorno, sigue la [guía de desarrollo local](docs/development.md).
Incluye instalación, configuración, migraciones, arranque y verificaciones.

## Requisitos e instalación

El proyecto se ejecuta desde este repositorio y requiere:

- **Python 3.13** y **uv** para la API.
- **Node.js 20** y **npm** para los servicios web.
- **PostgreSQL**, local o en Neon, para los datos de clientes y Rewards.

```bash
git clone https://github.com/NicoGuerrero11/carobra-rewards.git
cd carobra-rewards
```

Continúa con la [instalación de dependencias](docs/development.md#instalar-dependencias).
Usa una base de desarrollo y datos de prueba; las pruebas de integración
requieren otra base independiente y pueden recrear su esquema.

## Estructura

| Directorio | Responsabilidad | Tecnología |
| --- | --- | --- |
| [`api/`](api/) | Identidad, sesiones, clientes, consentimientos y SISCA | Python, FastAPI, SQLAlchemy, Alembic |
| [`site-backend/`](site-backend/) | Contrato web, puntos, niveles, actividad y Bonda | TypeScript, Node.js, PostgreSQL |
| [`site-frontend/`](site-frontend/) | Sitio público y portal de clientes | Astro SSR, TypeScript, Tailwind CSS |
| [`docs/`](docs/) | Guías técnicas, contratos y operación | Markdown |
| [`openspec/`](openspec/) | Especificaciones y propuestas de cambios | OpenSpec |

## Documentación

| Para… | Consulta |
| --- | --- |
| Instalar, ejecutar y probar el proyecto | [Desarrollo local](docs/development.md) |
| Trabajar con autenticación y SISCA | [API](api/README.md) |
| Consultar rutas y respuestas de Rewards | [Contratos HTTP](docs/rewards-http-contracts.md) |
| Entender el comportamiento esperado | [Especificaciones](openspec/specs/) |
| Configurar cupones y cursos | [Cupones Bonda](docs/bonda-coupons-runbook.md) y [catálogo de cursos](docs/bonda-courses-reconciliation.md) |
| Consultar el seguimiento de videos | [Avance de cursos](docs/course-video-progress.md) |
| Operar reglas, tareas y conciliaciones | [Operación de Rewards](docs/rewards-operations-runbook.md) |
| Publicar una actualización | [Guía de producción](docs/production-site-release.md) |

## Contribuir

Reporta errores o propone mejoras en los
[issues del repositorio](https://github.com/NicoGuerrero11/carobra-rewards/issues).
Incluye los pasos para reproducir el problema y el resultado esperado, sin
credenciales ni datos personales.

Antes de abrir un pull request, revisa las especificaciones del área afectada,
ejecuta las [verificaciones correspondientes](docs/development.md#verificaciones)
y actualiza la documentación cuando cambie el comportamiento.

El proyecto se mantiene en
[NicoGuerrero11/carobra-rewards](https://github.com/NicoGuerrero11/carobra-rewards),
con el trabajo de sus
[colaboradores](https://github.com/NicoGuerrero11/carobra-rewards/graphs/contributors).

## Licencia

El repositorio no incluye actualmente un archivo de licencia. Consulta con
sus responsables las condiciones de uso y distribución.
