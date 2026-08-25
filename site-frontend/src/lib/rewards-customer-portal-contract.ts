import type {
  RewardsJourneySummary,
  RewardsV2ProductStatus,
} from "./rewards-v2-contract";

export interface CustomerPortalAction {
  id: string;
  type: "STATUS" | "QUESTIONNAIRE" | "CONTENT" | "DOCUMENT" | "LEARNING" | "SUPPORT";
  title: string;
  description: string;
  status: "PENDING" | "COMPLETED" | "INFORMATIONAL";
  href: string | null;
  approved_points: string | null;
}

export interface RewardsCustomerPortal {
  customer_id: string;
  journey: RewardsJourneySummary;
  activity_details: {
    activities: Array<{ activity_type: string; qualifies: boolean; occurred_at: string }>;
  };
  movement_details: {
    movements: Array<{ code: string; entry_type: string; points_delta: string; occurred_at: string }>;
  };
  primary_action: CustomerPortalAction;
  actions: CustomerPortalAction[];
  timeline: Array<{ id: string; type: string; title: string; description: string; occurred_at: string }>;
  notifications: { unread_count: number; items: Array<{ id: string; title: string; message: string; occurred_at: string; read: boolean; href: string | null }> };
  products: Array<{ id: string; product_type: string; label: string; status: RewardsV2ProductStatus; status_label: string; activated_at: string | null; ended_at: string | null; level_impact: string; guidance: string }>;
  preferences: { activity_updates: boolean; learning_updates: boolean; product_updates: boolean; updated_at: string | null };
  learning: { items: Array<{ id: string; course_code: string; title: string; description: string; category: string; status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED"; progress: number; qualifies: boolean; assigned_at: string; last_activity_at: string | null }> };
  documents: { requests: Array<{ id: string; request_code: string; title: string; purpose: string; status: "REQUESTED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "CANCELLED"; accepted_mime_types: string[]; max_size_bytes: number; upload_available: boolean; updated_at: string }> };
  help: Array<{ id: string; title: string; body: string }>;
}
