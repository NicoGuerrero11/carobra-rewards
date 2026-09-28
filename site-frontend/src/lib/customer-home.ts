import type {CoursePreview, CoursesCatalog} from './courses';
import type {BondaCouponCatalog} from './bonda-coupon-contract';

/** Bounded independent reads; never treat a failed request as an empty catalog. */
export async function readHomeModule<T>(baseUrl: string, path: string, cookie: string): Promise<{status: number; data: T | null}> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {cookie}, signal: AbortSignal.timeout(5000), cache: 'no-store', redirect: 'error',
    });
    return {status: response.status, data: response.ok ? await response.json() as T : null};
  } catch { return {status: 503, data: null}; }
}

export function selectHomeLearning(catalog: CoursesCatalog | null, restricted: boolean) {
  const available = !restricted && catalog?.status === 'AVAILABLE'
    ? catalog.courses.filter(course => course.accessible) : [];
  const courses = available.filter(course => course.space === 'cursos');
  const unfinished = courses.filter(course => course.progress?.started && !course.progress.completed)
    .sort((a,b) => (b.progress?.last_activity_at ?? '').localeCompare(a.progress?.last_activity_at ?? ''));
  const selected = unfinished.slice(0,2);
  for (const course of [...courses.filter(c => !c.progress?.completed), ...courses.filter(c => c.progress?.completed)]) {
    if (selected.length >= 2) break;
    if (!selected.some(item => item.id === course.id)) selected.push(course);
  }
  const wellness = available.filter(course => course.space === 'bienestar');
  return {
    courses: selected, courseCount: courses.length,
    wellness: ['video','text'].map(type => wellness.find(item => item.content_type === type)).filter((item): item is CoursePreview => Boolean(item)),
  };
}

export function homeCourseLink(course: CoursePreview) {
  const chapter = course.progress?.resume_chapter_number;
  return `/cliente/cursos/${course.id}${course.progress?.started && !course.progress.completed && Number.isInteger(chapter) && chapter! > 0 ? `?capitulo=${chapter}` : ''}`;
}

export function homeCouponMessage(catalog: BondaCouponCatalog | null) {
  if (!catalog) return 'No pudimos cargar los beneficios en este momento. Puedes volver a intentarlo desde el catálogo.';
  return {
    AVAILABLE: 'Por ahora no hay beneficios publicados para tu cuenta. Consulta el catálogo para ver su disponibilidad.',
    NO_LEVEL: 'Tus descuentos comienzan en Bronce, cuando tengas un producto confirmado y un nivel activo.',
    ACCOUNT_UNAVAILABLE: 'Revisa el estado de tu cuenta para consultar tus beneficios.',
    AFFILIATE_PENDING: 'Consulta el catálogo para revisar la disponibilidad de tus beneficios.',
    COUPON_UNAVAILABLE: 'La disponibilidad de los beneficios cambió. Consulta el catálogo actualizado.',
    FEATURE_DISABLED: 'El catálogo de beneficios no está habilitado por el momento.',
    PARTNER_UNAVAILABLE: 'No pudimos cargar los beneficios en este momento. Puedes volver a intentarlo desde el catálogo.',
  }[catalog.access_state];
}
