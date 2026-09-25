import type { BondaConfig } from '../../config.js';
import { approvedCourses } from '../courses/catalog.js';
import { wellnessCatalog } from '../courses/wellness-catalog.js';
import type { CourseChapterDefinition } from '../courses/types.js';

const messages = {
  OK: 'Consulta de lectura verificada.',
  CONFIGURATION_REQUIRED: 'Revisa las variables de Bonda, el host permitido y las banderas de cupones y cursos. No uses el modo de vista previa.',
  TECHNICAL_AFFILIATE_MISSING: 'Bonda no encuentra el afiliado técnico configurado. Su recuperación requiere autorización explícita.',
  AUTHORIZATION_REJECTED: 'Bonda rechaza la credencial o los permisos de esta consulta. Esto por sí solo no prueba que la clave sea incorrecta.',
  RESOURCE_UNAVAILABLE: 'El recurso de prueba no está disponible. Revisa el endpoint y el contenido aprobado.',
  PARTNER_UNAVAILABLE: 'No se pudo completar la conexión con Bonda. Revisa la red o la disponibilidad del proveedor.',
  TIMEOUT: 'Bonda no respondió dentro del tiempo permitido.',
  INVALID_RESPONSE: 'La respuesta no coincide con el contenido esperado. Requiere revisión; no se sustituyó el contenido.',
  RESPONSE_TOO_LARGE: 'Bonda devolvió una respuesta mayor al límite de diagnóstico.',
  REDIRECT_REJECTED: 'Bonda devolvió una redirección. No se siguió para proteger las credenciales.',
} as const;

type Code = keyof typeof messages;
type CheckName = 'configuration' | 'affiliate' | 'coupons' | 'courses' | 'wellness';
export interface BondaConnectionCheck {
  check: CheckName;
  code: Code;
  message: string;
  http_status: number | null;
}
export interface BondaConnectionReport {
  ready: boolean;
  checks: BondaConnectionCheck[];
  next_step: string;
}

interface Probe {
  name: Exclude<CheckName, 'configuration'>;
  url: URL;
  headers: Record<string, string>;
  valid(body: Record<string, unknown>): boolean;
}

const MAX_RESPONSE_BYTES = 1_000_000;
class ProbeFailure extends Error {
  constructor(readonly code: Code) { super(code); }
}

export function configurationFailure(): BondaConnectionReport {
  return report([result('configuration', 'CONFIGURATION_REQUIRED')]);
}

/** Operational preflight only. No database, provisioning, sessions or mutations. */
export async function checkBondaConnection(
  config: BondaConfig | undefined,
  request: typeof fetch = fetch,
): Promise<BondaConnectionReport> {
  if (!validConfiguration(config)) return configurationFailure();
  const c = config!;
  const contentUrl = (path: string) => {
    const url = new URL(path, c.baseUrl);
    url.search = new URLSearchParams({
      key: c.couponApiKey!, micrositio_id: c.micrositeId!, codigo_afiliado: c.catalogAffiliateCode!,
    }).toString();
    return url;
  };
  const chapterProbe = (name: 'courses' | 'wellness', chapter: CourseChapterDefinition): Probe => ({
    name,
    url: contentUrl(`/api/actividades/${chapter.activityId}/posts/${chapter.postId}`),
    headers: {},
    valid: body => validVideo(body, chapter),
  });
  const probes: Probe[] = [
    {
      name: 'affiliate',
      url: new URL(`/api/v2/microsite/${encodeURIComponent(c.micrositeId!)}/affiliates/${encodeURIComponent(c.catalogAffiliateCode!)}`, c.baseUrl),
      // This integration uses a shared key; operators can configure a separate roster token.
      headers: { token: c.affiliateToken || c.couponApiKey! },
      valid: body => body.success === true,
    },
    {
      name: 'coupons', url: contentUrl('/api/cupones/9510'), headers: {},
      valid: body => String(body.id) === '9510' && typeof body.nombre === 'string' && body.nombre.trim().length > 0,
    },
    chapterProbe('courses', approvedCourses[0]!.chapters[0]!),
    chapterProbe('wellness', wellnessCatalog[0]!.chapters[0]!),
  ];
  return report(await Promise.all(probes.map(probe => checkProbe(probe, c.requestTimeoutMs, request))));
}

function validConfiguration(c: BondaConfig | undefined): boolean {
  if (!c || !c.catalogEnabled || !c.coursesEnabled || c.localPreviewEnabled
      || !c.couponApiKey?.trim() || !c.micrositeId || !c.catalogAffiliateCode
      || /[\r\n]/.test(c.couponApiKey + (c.affiliateToken ?? ''))
      || !/^[A-Za-z0-9_-]{1,200}$/.test(c.micrositeId)
      || !/^[A-Za-z0-9_-]{1,200}$/.test(c.catalogAffiliateCode)
      || !Number.isFinite(c.requestTimeoutMs) || c.requestTimeoutMs <= 0) return false;
  try {
    const url = new URL(c.baseUrl);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && !url.search && !url.hash && c.allowedHosts.includes(url.hostname.toLowerCase());
  } catch { return false; }
}

async function checkProbe(probe: Probe, timeoutMs: number, request: typeof fetch): Promise<BondaConnectionCheck> {
  let status: number | null = null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = async () => {
      const response = await request(probe.url, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { accept: 'application/json', ...probe.headers },
      });
      status = response.status;
      let immediate: Code | undefined;
      if (status >= 300 && status < 400) immediate = 'REDIRECT_REJECTED';
      else if (status === 401 || status === 403) immediate = 'AUTHORIZATION_REJECTED';
      else if (status >= 500 || status === 429) immediate = 'PARTNER_UNAVAILABLE';
      if (immediate) {
        void response.body?.cancel().catch(() => undefined);
        return result(probe.name, immediate, status);
      }
      const body = await readBoundedJson(response, controller.signal);
      const errorCode = record(body.error)?.code;
      // Only this explicit provider error proves the technical affiliate is absent.
      if (probe.name === 'affiliate' && errorCode === 'USER_NOT_FOUND')
        return result(probe.name, 'TECHNICAL_AFFILIATE_MISSING', status);
      if (errorCode === 'AuthorizationException') return result(probe.name, 'AUTHORIZATION_REJECTED', status);
      if (status === 404) return result(probe.name, 'RESOURCE_UNAVAILABLE', status);
      if (!response.ok || body.success === false || (body.error !== undefined && body.error !== null && body.error !== false)
          || !probe.valid(body)) return result(probe.name, 'INVALID_RESPONSE', status);
      return result(probe.name, 'OK', status);
    };
    // Bound the complete exchange (including body), even if a custom transport ignores abort.
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new ProbeFailure('TIMEOUT'));
          controller.abort();
        }, Math.min(timeoutMs, 10_000));
      }),
    ]);
  } catch (error) {
    // No raw exceptions: fetch errors can contain the authenticated URL.
    return result(probe.name, error instanceof ProbeFailure ? error.code : 'PARTNER_UNAVAILABLE', status);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProbeFailure('RESPONSE_TOO_LARGE');
  }
  if (!response.body) throw new ProbeFailure('INVALID_RESPONSE');
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new ProbeFailure('RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
  try {
    const body = record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!body) throw new Error();
    return body;
  } catch { throw new ProbeFailure('INVALID_RESPONSE'); }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validVideo(body: Record<string, unknown>, chapter: CourseChapterDefinition): boolean {
  const payload = record(body.payload);
  return body.id === chapter.postId && body.titulo === chapter.title && body.tipo === 'video'
    && payload?.proveedor === 'vimeo' && typeof payload.provider_external_id === 'string'
    && /^\d{1,20}$/.test(payload.provider_external_id) && typeof payload.duracion === 'number'
    && Number.isFinite(payload.duracion) && payload.duracion >= 0;
}

function result(check: CheckName, code: Code, http_status: number | null = null): BondaConnectionCheck {
  return { check, code, message: messages[code], http_status };
}

function report(checks: BondaConnectionCheck[]): BondaConnectionReport {
  const ready = checks.every(check => check.code === 'OK');
  const missing = checks.some(check => check.code === 'TECHNICAL_AFFILIATE_MISSING');
  return {
    ready, checks,
    next_step: ready
      ? 'Conexión verificada en muestras aprobadas. Comprueba también el sitio con las cuentas de revisión antes de la demo o despliegue.'
      : missing
        ? 'Solicita autorización para recuperar únicamente el afiliado técnico. No actives altas automáticas ni cambies clientes. Después repite bonda:check.'
        : 'Revisa los checks fallidos y docs/bonda-coupons-runbook.md. No cambies credenciales ni permisos sin confirmar la causa.',
  };
}
