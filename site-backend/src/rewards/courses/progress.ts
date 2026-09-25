import type {Database} from '../../database/connection.js';
import type {CustomerId} from '../shared/identifiers.js';
import {CourseError, type CourseDefinition} from './types.js';

export type PlayedRange = [number, number];
export interface VideoProgress {
  course_id: number; chapter_id: number; played_ranges: PlayedRange[];
  duration_seconds: number | null; watched_seconds: number;
  manual_completed_at: string | null; playback_completed_at: string | null;
  updated_at: string;
}
export interface ProgressInput {chapter_id: number; ranges: PlayedRange[]; manual: boolean}
export interface ProgressStore {
  list(customerId: CustomerId): Promise<VideoProgress[]>;
  save(customerId: CustomerId, courseId: number, input: ProgressInput, duration: number | null): Promise<VideoProgress>;
}

export function progressInput(value: unknown): ProgressInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CourseError(400, 'invalid_progress');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['chapter_id','ranges','manual'].includes(key))
    || !Number.isSafeInteger(body.chapter_id) || Number(body.chapter_id) <= 0
    || typeof body.manual !== 'boolean') throw new CourseError(400, 'invalid_progress');
  return {chapter_id: Number(body.chapter_id), ranges: validateRanges(body.ranges), manual: body.manual};
}

function validateRanges(value: unknown): PlayedRange[] {
  if (!Array.isArray(value) || value.length > 256) throw new CourseError(400, 'invalid_progress_ranges');
  return value.map(range => {
    if (!Array.isArray(range) || range.length !== 2 || range.some(n => typeof n !== 'number' || !Number.isFinite(n))
      || range[0] < 0 || range[1] <= range[0] || range[1] >= 86400) throw new CourseError(400, 'invalid_progress_ranges');
    return [range[0],range[1]];
  });
}

export function mergePlayed(ranges: readonly PlayedRange[], duration: number | null): PlayedRange[] {
  const merged: PlayedRange[] = [];
  for (const [start,end] of [...ranges].sort((a,b) => a[0]-b[0])) {
    const boundedEnd = duration ? Math.min(end,duration) : end;
    if (start >= boundedEnd) continue;
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1],boundedEnd);
    else merged.push([start,boundedEnd]);
  }
  if (merged.length > 2048) throw new CourseError(400, 'progress_too_fragmented');
  return merged;
}

export function nextProgress(previous: VideoProgress | undefined, courseId: number, input: ProgressInput, duration: number | null, at: string): VideoProgress {
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration >= 86400)) throw new CourseError(503, 'invalid_video_duration');
  if (input.ranges.length && (!duration || input.ranges.some(r => r[1] > duration + 1))) throw new CourseError(400, 'invalid_progress_duration');
  const ranges = mergePlayed([...(previous?.played_ranges ?? []),...input.ranges],duration);
  const watched = ranges.reduce((sum,[a,b]) => sum+b-a,0);
  return {
    course_id:courseId, chapter_id:input.chapter_id, played_ranges:ranges,
    duration_seconds:duration, watched_seconds:watched,
    manual_completed_at:previous?.manual_completed_at ?? (input.manual ? at : null),
    playback_completed_at:previous?.playback_completed_at ?? (duration && watched/duration >= .8 ? at : null),
    updated_at:at,
  };
}
export function isVideoCompleted(item: VideoProgress): boolean {
  return Boolean(item.manual_completed_at || item.playback_completed_at);
}
export function courseProgress(course: CourseDefinition, rows: readonly VideoProgress[]) {
  const chapters = rows.filter(row => row.course_id === course.id && course.chapters.some(c => c.postId === row.chapter_id));
  const completed = chapters.filter(isVideoCompleted).length;
  return {completed_chapters:completed,total_chapters:course.chapters.length,completed:completed === course.chapters.length,chapters};
}

/** Read-only summary: no fabricated playback position or completion. */
export function courseContinuation(course: CourseDefinition, rows: readonly VideoProgress[]) {
  const summary = courseProgress(course, rows);
  const started = summary.chapters
    .filter(row => row.watched_seconds > 0 || isVideoCompleted(row))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const lastUnfinished = started.find(row => !isVideoCompleted(row));
  const nextIndex = lastUnfinished
    ? course.chapters.findIndex(chapter => chapter.postId === lastUnfinished.chapter_id)
    : course.chapters.findIndex(chapter => !summary.chapters.some(row => row.chapter_id === chapter.postId && isVideoCompleted(row)));
  return {
    started: started.length > 0,
    last_activity_at: started[0]?.updated_at ?? null,
    resume_chapter_number: started.length && !summary.completed && nextIndex >= 0 ? nextIndex + 1 : null,
  };
}

function fromRow(row: Record<string, unknown>): VideoProgress {
  const date = (value: unknown) => value ? new Date(String(value)).toISOString() : null;
  return {
    course_id:Number(row.course_id),chapter_id:Number(row.chapter_id),
    played_ranges:row.played_ranges as PlayedRange[],duration_seconds:row.duration_seconds === null ? null : Number(row.duration_seconds),
    watched_seconds:Number(row.watched_seconds),manual_completed_at:date(row.manual_completed_at),
    playback_completed_at:date(row.playback_completed_at),updated_at:date(row.updated_at)!,
  };
}

export class PostgresProgressStore implements ProgressStore {
  constructor(private readonly database: Database) {}
  async list(customerId: CustomerId): Promise<VideoProgress[]> {
    const client = await this.database.connect();
    try {
      const result = await client.query('SELECT * FROM rewards_course_video_progress WHERE customer_id = $1',[customerId]);
      return result.rows.map(fromRow);
    } finally {client.release();}
  }
  async save(customerId: CustomerId, courseId: number, input: ProgressInput, duration: number | null): Promise<VideoProgress> {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO rewards_course_video_progress (customer_id,course_id,chapter_id)
        VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,[customerId,courseId,input.chapter_id]);
      const locked = await client.query(`SELECT * FROM rewards_course_video_progress
        WHERE customer_id=$1 AND course_id=$2 AND chapter_id=$3 FOR UPDATE`,[customerId,courseId,input.chapter_id]);
      const next = nextProgress(fromRow(locked.rows[0]),courseId,input,duration,new Date().toISOString());
      await client.query(`UPDATE rewards_course_video_progress SET played_ranges=$4::jsonb, duration_seconds=$5,
        watched_seconds=$6,manual_completed_at=$7,playback_completed_at=$8,updated_at=$9
        WHERE customer_id=$1 AND course_id=$2 AND chapter_id=$3`,
        [customerId,courseId,input.chapter_id,JSON.stringify(next.played_ranges),duration,next.watched_seconds,
          next.manual_completed_at,next.playback_completed_at,next.updated_at]);
      await client.query('COMMIT');
      return next;
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  }
}
