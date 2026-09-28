import type { BondaCouponJourney, BondaCouponJourneyQuery } from '../bonda/catalog-application.js';
import type { CustomerId } from '../shared/identifiers.js';
import { rewardsLevels } from '../shared/enums.js';
import { learningCatalog, learningReviewedAt as catalogReviewedAt } from './learning-catalog.js';
import { CourseError, courseImage, courseText, courseSpace, courseContentType, type ActivitiesReader, type CourseChapter, type CourseDefinition } from './types.js';
import {courseProgress, courseContinuation, progressInput, type ProgressStore, type VideoProgress} from './progress.js';

export class CoursesApplication {
  private readonly cache = new Map<number, {expires: number; chapters: readonly CourseChapter[]}>();
  private readonly inflight = new Map<number, Promise<readonly CourseChapter[]>>();
  constructor(
    private readonly journeys: BondaCouponJourneyQuery,
    private readonly activities: ActivitiesReader,
    private readonly enabled: boolean,
    private readonly catalog: readonly CourseDefinition[] = learningCatalog,
    private readonly now: () => number = Date.now,
    private readonly progressStore?: ProgressStore,
  ) {}

  async list(customerId: CustomerId) {
    if (!this.enabled) return {status: 'DISABLED' as const, courses: [], current_level: null, reviewed_at: catalogReviewedAt};
    const journey = await this.journeys.get(customerId);
    if (!journey) throw new CourseError(503, 'course_journey_unavailable');
    const progress = await this.readProgress(customerId);
    return {
      status: 'AVAILABLE' as const, current_level: journey.currentLevel, reviewed_at: catalogReviewedAt,
      progress_available: progress !== null,
      courses: this.catalog.map(course => {
        const summary = progress && courseContentType(course) === 'video' ? courseProgress(course,progress) : null;
        return {...this.preview(course), accessible: canPlay(journey, course),
          progress:summary ? {completed_chapters:summary.completed_chapters,total_chapters:summary.total_chapters,completed:summary.completed,
            ...(canPlay(journey, course) ? courseContinuation(course, progress!) : {})} : null};
      }),
    };
  }

  async detail(customerId: CustomerId, courseId: number) {
    if (!this.enabled) throw new CourseError(503, 'courses_disabled');
    const course = await this.authorize(customerId,courseId);
    const chapters = await this.chapters(course);
    const progress = await this.readProgress(customerId);
    return {course: {...this.preview(course), accessible: true}, chapters, progress:progress && courseContentType(course) === 'video' ? courseProgress(course,progress) : null};
  }

  private async authorize(customerId: CustomerId, courseId: number) {
    if (!this.enabled) throw new CourseError(503, 'courses_disabled');
    const course = this.catalog.find(c => c.id === courseId);
    if (!course) throw new CourseError(404, 'course_not_found');
    const journey = await this.journeys.get(customerId);
    if (!journey) throw new CourseError(503, 'course_journey_unavailable');
    // Authorization is deliberately outside (and before) the shared media cache.
    if (!canPlay(journey, course)) throw new CourseError(403, 'course_locked');
    return course;
  }

  async getProgress(customerId: CustomerId, courseId: number) {
    const course = await this.authorize(customerId,courseId);
    if (courseContentType(course) !== 'video') throw new CourseError(400, 'progress_not_supported');
    const rows = await this.readProgress(customerId);
    if (!rows) throw new CourseError(503,'progress_unavailable');
    return courseProgress(course,rows);
  }

  async saveProgress(customerId: CustomerId, courseId: number, body: unknown) {
    const course = await this.authorize(customerId,courseId);
    if (courseContentType(course) !== 'video') throw new CourseError(400, 'progress_not_supported');
    const input = progressInput(body);
    if (!course.chapters.some(ch => ch.postId === input.chapter_id)) throw new CourseError(404,'chapter_not_found');
    if (!this.progressStore) throw new CourseError(503,'progress_unavailable');
    const chapters = await this.chapters(course);
    const duration = chapters.find(ch => ch.id === input.chapter_id)?.duration_seconds ?? null;
    try {
      await this.progressStore.save(customerId,courseId,input,duration);
      return courseProgress(course,await this.progressStore.list(customerId));
    } catch(error) {
      if (error instanceof CourseError) throw error;
      throw new CourseError(503,'progress_unavailable');
    }
  }

  private async readProgress(customerId: CustomerId): Promise<VideoProgress[] | null> {
    try {return this.progressStore ? await this.progressStore.list(customerId) : null;}
    catch {return null;}
  }

  private preview(course: CourseDefinition) {
    return {
      id: course.id, title: course.title, category: course.category, minimum_level: course.minimumLevel,
      space: courseSpace(course), content_type: courseContentType(course),
      summary: courseText(course.summary, 1500), image_url: courseImage(course.image),
      chapter_count: course.chapters.length,
      duration_seconds: course.chapters.every(c => c.durationSeconds > 0)
        ? course.chapters.reduce((sum, chapter) => sum + chapter.durationSeconds, 0) : null,
    };
  }

  private async chapters(course: CourseDefinition): Promise<readonly CourseChapter[]> {
    const cached = this.cache.get(course.id);
    if (cached && cached.expires > this.now()) return cached.chapters;
    const running = this.inflight.get(course.id);
    if (running) return running;
    if (this.inflight.size >= 8) throw new CourseError(503, 'courses_busy');
    const promise = this.load(course).finally(() => this.inflight.delete(course.id));
    this.inflight.set(course.id, promise);
    return promise;
  }

  private async load(course: CourseDefinition): Promise<readonly CourseChapter[]> {
    const chapters: CourseChapter[] = [];
    // Complete series only, at most four upstream chapter reads per course at once.
    for (let i = 0; i < course.chapters.length; i += 4)
      chapters.push(...await Promise.all(course.chapters.slice(i, i + 4).map(c => this.activities.getChapter(c))));
    if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(course.id, {expires: this.now() + 300_000, chapters});
    return chapters;
  }
}

export function canPlay(journey: BondaCouponJourney, course: CourseDefinition): boolean {
  return journey.state === 'ACTIVE' && journey.currentLevel !== null
    && rewardsLevels.indexOf(journey.currentLevel) >= rewardsLevels.indexOf(course.minimumLevel);
}
