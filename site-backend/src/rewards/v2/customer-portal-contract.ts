import type { RewardsJourneyState, RewardsLevel, RewardsProductFactStatus } from "../shared/enums.js";

export type CustomerActionType = "STATUS" | "QUESTIONNAIRE" | "CONTENT" | "DOCUMENT" | "LEARNING" | "SUPPORT";

export interface RewardsCustomerPortalHttpResponse {
  customer_id: string;
  primary_action: CustomerPortalAction;
  actions: ReadonlyArray<CustomerPortalAction>;
  timeline: ReadonlyArray<CustomerTimelineEntry>;
  notifications: {
    unread_count: number;
    items: ReadonlyArray<CustomerNotification>;
  };
  products: ReadonlyArray<CustomerProductDetail>;
  preferences: RewardsCustomerPreferences;
  learning: {
    items: ReadonlyArray<CustomerLearningItem>;
  };
  documents: {
    requests: ReadonlyArray<CustomerDocumentRequest>;
  };
  help: ReadonlyArray<CustomerHelpItem>;
}

export interface CustomerPortalAction {
  id: string;
  type: CustomerActionType;
  title: string;
  description: string;
  status: "PENDING" | "COMPLETED" | "INFORMATIONAL";
  href: string | null;
  approved_points: string | null;
}

export interface CustomerTimelineEntry {
  id: string;
  type: "REGISTRATION" | "PRODUCT" | "LEVEL" | "POINTS" | "ACTIVITY" | "LEARNING" | "DOCUMENT";
  title: string;
  description: string;
  occurred_at: string;
}

export interface CustomerNotification {
  id: string;
  title: string;
  message: string;
  occurred_at: string;
  read: boolean;
  href: string | null;
}

export interface CustomerProductDetail {
  id: string;
  product_type: string;
  label: string;
  status: RewardsProductFactStatus;
  status_label: string;
  activated_at: string | null;
  ended_at: string | null;
  level_impact: string;
  guidance: string;
}

export interface RewardsCustomerPreferences {
  activity_updates: boolean;
  learning_updates: boolean;
  product_updates: boolean;
  updated_at: string | null;
}

export interface CustomerLearningItem {
  id: string;
  course_code: string;
  title: string;
  description: string;
  category: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
  progress: number;
  qualifies: boolean;
  assigned_at: string;
  last_activity_at: string | null;
}

export interface CustomerDocumentRequest {
  id: string;
  request_code: string;
  title: string;
  purpose: string;
  status: "REQUESTED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  accepted_mime_types: ReadonlyArray<string>;
  max_size_bytes: number;
  upload_available: boolean;
  updated_at: string;
}

export interface CustomerHelpItem {
  id: string;
  title: string;
  body: string;
}

const forbiddenKey = /^(?:provider|source|source_id|checkpoint|request_id|raw_evidence|safe_evidence)$/i;
const forbiddenValue = /\b(?:SISCA|H24|H72|D3|D5|MATCH_VALIDATED|TECHNICAL_FAILURE)\b/i;

export function assertRewardsCustomerPortalContract(
  value: RewardsCustomerPortalHttpResponse,
): RewardsCustomerPortalHttpResponse {
  if (!value.customer_id.trim()) throw new Error("Customer portal customer is required");
  if (!value.primary_action.title.trim()) throw new Error("Customer portal primary action is required");
  inspectCustomerValue(value, "portal");
  return value;
}

function inspectCustomerValue(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (forbiddenValue.test(value)) throw new Error(`Internal terminology is not allowed at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectCustomerValue(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKey.test(key)) throw new Error(`Internal evidence field is not allowed at ${path}.${key}`);
    inspectCustomerValue(nested, `${path}.${key}`);
  }
}

export function journeyStateHelp(state: RewardsJourneyState, level: RewardsLevel | null): CustomerHelpItem[] {
  const stateHelp: Record<RewardsJourneyState, CustomerHelpItem> = {
    INVITED: {
      id: "validation-pending",
      title: "¿Qué estamos validando?",
      body: "Carobra está confirmando tu primer producto. Puedes consultar tu cuenta mientras terminamos.",
    },
    ACTIVE: {
      id: "active-account",
      title: "¿Cómo se calcula mi nivel?",
      body: `Tu nivel${level ? ` ${levelLabel(level)}` : ""} considera productos activos, permanencia y actividades aprobadas; gastar puntos no lo reduce.`,
    },
    INACTIVE: {
      id: "inactive-account",
      title: "¿Qué pasa con mi historial?",
      body: "Tus movimientos permanecen protegidos. Tu nivel volverá a calcularse cuando exista un producto activo confirmado.",
    },
    BLOCKED: {
      id: "account-review",
      title: "¿Por qué está en revisión?",
      body: "Carobra necesita revisar información de tu producto. No repitas tu registro; puedes contactar a soporte si necesitas ayuda.",
    },
  };
  return [stateHelp[state], {
    id: "redemption-help",
    title: "¿Por qué todavía no puedo redimir?",
    body: "El canje se habilitará únicamente cuando tu cuenta cumpla los requisitos visibles y exista un catálogo disponible.",
  }];
}

function levelLabel(level: RewardsLevel): string {
  return ({ BRONZE: "Bronce", SILVER: "Plata", GOLD: "Oro", PLATINUM: "Platino", TITANIUM: "Titanio" })[level];
}
