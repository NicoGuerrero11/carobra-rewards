import type { RewardsLevel } from '../shared/enums.js';

export interface CourseChapterDefinition {
  postId: number;
  activityId: number;
  number: number;
  title: string;
  durationSeconds: number;
  contentType?: 'video' | 'text';
}
export interface CourseDefinition {
  id: number;
  title: string;
  category: string;
  minimumLevel: RewardsLevel;
  sourceSlide: number;
  summary: string;
  image: string;
  chapters: readonly CourseChapterDefinition[];
}
export interface CourseChapter {
  id: number;
  number: number;
  title: string;
  summary: string;
  content: string;
  duration_seconds: number | null;
  presenters: readonly string[];
  embed_url: string | null;
}
export interface ActivitiesReader {
  getChapter(chapter: CourseChapterDefinition): Promise<CourseChapter>;
}

// Topic categories in the route are independent from the provider's libraries.
export function courseSpace(course: CourseDefinition): 'cursos' | 'bienestar' {
  return course.chapters.every(chapter => chapter.activityId === 1) ? 'bienestar' : 'cursos';
}
export function courseContentType(course: CourseDefinition): 'video' | 'text' {
  return course.chapters[0]?.contentType ?? 'video';
}
export class CourseError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'CourseError';
  }
}

// Partner HTML is displayed as escaped text by Astro, never injected into the DOM.
export function courseText(value: unknown, maximum = 20000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:p|div|li|br)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim().slice(0, maximum);
}

export function courseImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['i.vimeocdn.com', 'cuponstar-ar.s3.amazonaws.com'].includes(url.hostname)
      ? url.toString() : null;
  } catch { return null; }
}
