import type {Migration} from '../migration.js';

export const courseVideoProgress: Migration = {
  id: '026_course_video_progress',
  up: `
    CREATE TABLE rewards_course_video_progress (
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      course_id integer NOT NULL CHECK (course_id > 0),
      chapter_id integer NOT NULL CHECK (chapter_id > 0),
      played_ranges jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(played_ranges) = 'array'),
      duration_seconds double precision CHECK (duration_seconds > 0 AND duration_seconds < 86400),
      watched_seconds double precision NOT NULL DEFAULT 0 CHECK (watched_seconds >= 0 AND watched_seconds < 86400),
      manual_completed_at timestamptz,
      playback_completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (customer_id, course_id, chapter_id)
    );
    CREATE INDEX ix_course_progress_report ON rewards_course_video_progress (course_id, customer_id, chapter_id);
  `,
  down: 'DROP TABLE rewards_course_video_progress;',
};
