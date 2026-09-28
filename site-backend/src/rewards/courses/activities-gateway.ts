import type { BondaConfig } from '../../config.js';
import { CourseError, courseText, type ActivitiesReader, type CourseChapter, type CourseChapterDefinition } from './types.js';

export class BondaActivitiesGateway implements ActivitiesReader {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  constructor(private readonly config: BondaConfig, private readonly request: typeof fetch = fetch) {}

  async getChapter(chapter: CourseChapterDefinition): Promise<CourseChapter> {
    if (this.active >= 4) {
      if (this.waiters.length >= 32) throw new CourseError(503, 'courses_busy');
      await new Promise<void>(resolve => this.waiters.push(resolve));
    } else { this.active++; }
    try { return await this.read(chapter); }
    finally {
      const next = this.waiters.shift();
      if (next) next(); else this.active--;
    }
  }

  private async read(chapter: CourseChapterDefinition): Promise<CourseChapter> {
    try {
      const config = this.config;
      if (!config.coursesEnabled || !config.couponApiKey || !config.micrositeId || !config.catalogAffiliateCode)
        throw new CourseError(503, 'courses_unavailable');
      if (!Number.isSafeInteger(chapter.postId) || chapter.postId <= 0 || ![1,2].includes(chapter.activityId))
        throw new CourseError(503, 'courses_unavailable');
      const url = new URL(`/api/actividades/${chapter.activityId}/posts/${chapter.postId}`, config.baseUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !config.allowedHosts.includes(url.hostname))
        throw new CourseError(503, 'courses_unavailable');
      url.searchParams.set('key', config.couponApiKey);
      url.searchParams.set('micrositio_id', config.micrositeId);
      url.searchParams.set('codigo_afiliado', config.catalogAffiliateCode);
      const response = await this.request(url, {
        signal: AbortSignal.timeout(Math.min(config.requestTimeoutMs, 10000)), redirect: 'error',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new CourseError(503, 'courses_unavailable');
      const text = await response.text();
      if (text.length > 1_000_000) throw new CourseError(503, 'courses_unavailable');
      const post = JSON.parse(text) as Record<string, unknown>;
      const payload = post.payload as Record<string, unknown> | null;
      // A changed title is held for review instead of silently replacing approved content.
      const contentType = chapter.contentType ?? 'video';
      if (post.id !== chapter.postId || post.titulo !== chapter.title || post.tipo !== contentType)
        throw new CourseError(503, 'courses_unavailable');
      if (contentType === 'text') {
        if (chapter.activityId !== 1 || typeof post.contenido !== 'string' || !courseText(post.contenido))
          throw new CourseError(503, 'courses_unavailable');
        return {
          id: chapter.postId, number: chapter.number, title: courseText(post.titulo, 500),
          summary: courseText(post.descripcion_breve, 2000), content: courseText(post.contenido, 100000),
          duration_seconds: null, embed_url: null,
          presenters: Array.isArray(post.ponentes) ? post.ponentes.slice(0,10).map(p => courseText(p?.nombre, 200)).filter(Boolean) : [],
        };
      }
      if (payload?.proveedor !== 'vimeo' || typeof payload.provider_external_id !== 'string'
          || !/^\d{1,20}$/.test(payload.provider_external_id)
          || typeof payload.duracion !== 'number' || !Number.isFinite(payload.duracion) || payload.duracion < 0)
        throw new CourseError(503, 'courses_unavailable');
      return {
        id: chapter.postId, number: chapter.number, title: courseText(post.titulo, 500),
        summary: courseText(post.descripcion_breve, 2000), content: courseText(post.contenido),
        duration_seconds: payload.duracion > 0 ? payload.duracion : null,
        presenters: Array.isArray(post.ponentes) ? post.ponentes.slice(0,10).map(p => courseText(p?.nombre, 200)).filter(Boolean) : [],
        embed_url: `https://player.vimeo.com/video/${payload.provider_external_id}?dnt=1`,
      };
    } catch {
      // Never propagate fetch errors containing the authenticated URL or upstream payload.
      throw new CourseError(503, 'courses_unavailable');
    }
  }
}
