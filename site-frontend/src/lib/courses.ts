export const courseLevels: Record<string,string> = {BRONZE:'Bronce', SILVER:'Plata', GOLD:'Oro', PLATINUM:'Platino', TITANIUM:'Titanio'};
export const learningSpaces = {
  cursos: {title: 'Cursos', summary: 'Desarrolla nuevas habilidades y conocimientos.', image: 'https://cuponstar-ar.s3.amazonaws.com/public/files/uploads/activities/6901751a97905.png', action: 'Explorar cursos'},
  bienestar: {title: 'Bienestar', summary: 'Encuentra contenidos para cuidar tu bienestar.', image: 'https://cuponstar-ar.s3.amazonaws.com/public/files/uploads/activities/6901752eb21a4.png', action: 'Explorar bienestar'},
} as const;
export type LearningSpace = keyof typeof learningSpaces;
// The backend resolves catalog origin independently of the topic category.
export function learningSpace(course: Pick<CoursePreview, 'space'>): LearningSpace {
  return course.space;
}
export function learningCatalogUrl(space: LearningSpace) {
  return `/cliente/cursos?tipo=${space}`;
}
export interface CoursePreview {
  id: number; title: string; category: string; minimum_level: string;
  space: LearningSpace; content_type: 'video' | 'text';
  summary: string; image_url: string | null; chapter_count: number;
  duration_seconds: number | null; accessible: boolean;
  progress?: (Omit<CourseProgress,'chapters'> & {
    started?: boolean; last_activity_at?: string | null; resume_chapter_number?: number | null;
  }) | null;
}
export interface CoursesCatalog {
  status: 'AVAILABLE' | 'DISABLED'; current_level: string | null; reviewed_at: string; courses: CoursePreview[];
  progress_available?: boolean;
}
export interface CourseDetail {
  course: CoursePreview;
  progress?: CourseProgress | null;
  chapters: {id:number; number:number; title:string; summary:string; content:string; duration_seconds:number|null; presenters:string[]; embed_url:string|null}[];
}
export interface VideoProgress {
  course_id:number; chapter_id:number; played_ranges:[number,number][];
  duration_seconds:number|null; watched_seconds:number;
  manual_completed_at:string|null; playback_completed_at:string|null; updated_at:string;
}
export interface CourseProgress {
  completed_chapters:number; total_chapters:number; completed:boolean; chapters:VideoProgress[];
}
export function courseDuration(seconds: number | null) {
  if (!seconds) return 'Duración no informada';
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}
