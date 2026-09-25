import {approvedCourses} from './catalog.js';
import {wellnessCatalog, wellnessReviewedAt} from './wellness-catalog.js';
import type {CourseDefinition} from './types.js';

// Existing course IDs remain unchanged so saved video progress survives recategorization.
export const learningCatalog: readonly CourseDefinition[] = [...approvedCourses, ...wellnessCatalog];
export const learningReviewedAt = wellnessReviewedAt;
