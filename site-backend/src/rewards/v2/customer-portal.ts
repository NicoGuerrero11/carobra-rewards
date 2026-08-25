import type { QueryResult, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import type { RewardsJourneyState, RewardsLevel, RewardsProductFactStatus } from "../shared/enums.js";
import type { CustomerId } from "../shared/identifiers.js";
import type { RewardsActivityDetailsHttpResponse, RewardsMovementDetailsHttpResponse } from "./journey-details.js";
import type { RewardsJourneySummaryHttpResponse } from "./journey-summary-contract.js";
import type { RewardsJourneySummaryQuery } from "./journey-summary.js";
import {
  assertRewardsCustomerPortalContract,
  journeyStateHelp,
  type CustomerDocumentRequest,
  type CustomerLearningItem,
  type CustomerPortalAction,
  type CustomerProductDetail,
  type CustomerTimelineEntry,
  type RewardsCustomerPortalHttpResponse,
  type RewardsCustomerPreferences,
} from "./customer-portal-contract.js";

interface Queryable {
  query<TRow extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
}

interface PortalActionRow extends QueryResultRow {
  id: string; action_type: string; title: string; description: string; status: string;
  href: string | null; approved_points: string | null; assigned_at: Date;
}
interface ProductRow extends QueryResultRow {
  id: string; product_type: string; status: RewardsProductFactStatus;
  activated_at: Date | null; ended_at: Date | null; updated_at: Date;
}
interface PreferenceRow extends QueryResultRow {
  activity_updates: boolean; learning_updates: boolean; product_updates: boolean; updated_at: Date;
}
interface LearningRow extends QueryResultRow {
  id: string; course_code: string; title: string; description: string; category: string;
  status: CustomerLearningItem["status"]; progress: number; qualifies: boolean; last_activity_at: Date | null;
  assigned_at: Date;
}
interface DocumentRow extends QueryResultRow {
  id: string; request_code: string; title: string; purpose: string;
  status: CustomerDocumentRequest["status"]; accepted_mime_types: string[];
  max_size_bytes: number; upload_enabled: boolean;
  updated_at: Date;
}
interface LevelRow extends QueryResultRow {
  id: string; resulting_level: RewardsLevel | null; reason: string; decided_at: Date;
}
interface ReadRow extends QueryResultRow { notification_id: string; }

interface PortalStoredState {
  actions: PortalActionRow[];
  products: ProductRow[];
  preferences: RewardsCustomerPreferences;
  learning: CustomerLearningItem[];
  documents: CustomerDocumentRequest[];
  levels: LevelRow[];
  readNotificationIds: Set<string>;
}

export interface RewardsCustomerPortalApplication {
  getPortal(customerId: CustomerId, validationStatus: string): Promise<RewardsCustomerPortalHttpResponse | null>;
  updatePreferences(customerId: CustomerId, input: UpdatePreferencesInput): Promise<RewardsCustomerPreferences>;
  markNotificationRead(customerId: CustomerId, notificationId: string): Promise<void>;
  completeAction(customerId: CustomerId, actionId: string): Promise<boolean>;
  updateLearningProgress(customerId: CustomerId, input: UpdateLearningProgressInput): Promise<boolean>;
}

export interface UpdatePreferencesInput {
  activity_updates: boolean;
  learning_updates: boolean;
  product_updates: boolean;
}

export interface UpdateLearningProgressInput { assignment_id: string; progress: number; }

export interface RewardsCustomerPortalStore {
  load(customerId: CustomerId): Promise<PortalStoredState>;
  updatePreferences(customerId: CustomerId, input: UpdatePreferencesInput, at: Date): Promise<RewardsCustomerPreferences>;
  markNotificationRead(customerId: CustomerId, notificationId: string, at: Date): Promise<void>;
  completeAction(customerId: CustomerId, actionId: string, at: Date): Promise<boolean>;
  updateLearningProgress(customerId: CustomerId, input: UpdateLearningProgressInput, at: Date): Promise<boolean>;
}

interface JourneyDetailsPort {
  getActivities(customerId: CustomerId): Promise<RewardsActivityDetailsHttpResponse>;
  getMovements(customerId: CustomerId): Promise<RewardsMovementDetailsHttpResponse>;
}

export class DefaultRewardsCustomerPortalApplication implements RewardsCustomerPortalApplication {
  constructor(
    private readonly summaries: RewardsJourneySummaryQuery,
    private readonly details: JourneyDetailsPort,
    private readonly store: RewardsCustomerPortalStore,
    private readonly clock: Clock,
  ) {}

  async getPortal(customerId: CustomerId, validationStatus: string): Promise<RewardsCustomerPortalHttpResponse | null> {
    const [summary, activities, movements, state] = await Promise.all([
      this.summaries.getForCustomer(customerId, validationStatus),
      this.details.getActivities(customerId),
      this.details.getMovements(customerId),
      this.store.load(customerId),
    ]);
    if (!summary) return null;
    return projectPortal(summary, activities, movements, state);
  }

  updatePreferences(customerId: CustomerId, input: UpdatePreferencesInput) {
    requireBooleanPreferences(input);
    return this.store.updatePreferences(customerId, input, this.clock.now());
  }

  markNotificationRead(customerId: CustomerId, notificationId: string): Promise<void> {
    const normalized = notificationId.trim();
    if (!normalized || normalized.length > 220) throw new Error("Notification identity is invalid");
    return this.store.markNotificationRead(customerId, normalized, this.clock.now());
  }

  completeAction(customerId: CustomerId, actionId: string): Promise<boolean> {
    return this.store.completeAction(customerId, requireUuidLike(actionId), this.clock.now());
  }

  updateLearningProgress(customerId: CustomerId, input: UpdateLearningProgressInput): Promise<boolean> {
    if (!Number.isInteger(input.progress) || input.progress < 0 || input.progress > 100) {
      throw new Error("Learning progress must be an integer from 0 to 100");
    }
    return this.store.updateLearningProgress(
      customerId,
      { assignment_id: requireUuidLike(input.assignment_id), progress: input.progress },
      this.clock.now(),
    );
  }
}

export class PostgresRewardsCustomerPortalStore implements RewardsCustomerPortalStore {
  constructor(private readonly database: Queryable) {}

  async load(customerId: CustomerId): Promise<PortalStoredState> {
    const [actions, products, preferences, learning, documents, levels, reads] = await Promise.all([
      this.database.query<PortalActionRow>(`
        SELECT id::text, action_type, title, description, status, href,
          approved_points::text, assigned_at
        FROM rewards_customer_actions WHERE customer_id = $1
          AND status IN ('PENDING', 'COMPLETED')
        ORDER BY (status = 'PENDING') DESC, assigned_at DESC, id DESC LIMIT 20
      `, [customerId]),
      this.database.query<ProductRow>(`
        SELECT id::text, product_type, status, activated_at, ended_at, updated_at
        FROM rewards_product_facts WHERE customer_id = $1
        ORDER BY updated_at DESC, id DESC LIMIT 12
      `, [customerId]),
      this.database.query<PreferenceRow>(`
        SELECT activity_updates, learning_updates, product_updates, updated_at
        FROM rewards_customer_preferences WHERE customer_id = $1
      `, [customerId]),
      this.database.query<LearningRow>(`
        SELECT id::text, course_code, title, description, category, status,
          progress, qualifies, assigned_at, last_activity_at
        FROM rewards_learning_assignments WHERE customer_id = $1
        ORDER BY (status <> 'COMPLETED') DESC, assigned_at DESC, id DESC LIMIT 20
      `, [customerId]),
      this.database.query<DocumentRow>(`
        SELECT id::text, request_code, title, purpose, status, accepted_mime_types,
          max_size_bytes, upload_enabled, updated_at
        FROM rewards_document_requests WHERE customer_id = $1
        ORDER BY (status = 'REQUESTED') DESC, created_at DESC, id DESC LIMIT 20
      `, [customerId]),
      this.database.query<LevelRow>(`
        SELECT decision.id::text, decision.resulting_level, decision.reason, decision.decided_at
        FROM rewards_level_decisions AS decision
        JOIN rewards_v2_journeys AS journey ON journey.id = decision.journey_id
        WHERE journey.customer_id = $1
        ORDER BY decision.decided_at DESC, decision.id DESC LIMIT 20
      `, [customerId]),
      this.database.query<ReadRow>(`
        SELECT notification_id FROM rewards_notification_reads
        WHERE customer_id = $1 ORDER BY read_at DESC LIMIT 100
      `, [customerId]),
    ]);
    const preference = preferences.rows[0];
    return {
      actions: actions.rows,
      products: products.rows,
      preferences: preference ? {
        activity_updates: preference.activity_updates,
        learning_updates: preference.learning_updates,
        product_updates: preference.product_updates,
        updated_at: preference.updated_at.toISOString(),
      } : defaultPreferences(),
      learning: learning.rows.map((item) => ({ ...item, assigned_at: item.assigned_at.toISOString(), last_activity_at: item.last_activity_at?.toISOString() ?? null })),
      documents: documents.rows.map((item) => ({
        id: item.id,
        request_code: item.request_code,
        title: item.title,
        purpose: item.purpose,
        status: item.status,
        accepted_mime_types: item.accepted_mime_types,
        max_size_bytes: item.max_size_bytes,
        // Upload remains disabled until a customer-bound short-lived target exists.
        upload_available: false,
        updated_at: item.updated_at.toISOString(),
      })),
      levels: levels.rows,
      readNotificationIds: new Set(reads.rows.map((row) => row.notification_id)),
    };
  }

  async updatePreferences(customerId: CustomerId, input: UpdatePreferencesInput, at: Date): Promise<RewardsCustomerPreferences> {
    await this.database.query(`
      INSERT INTO rewards_customer_preferences (
        customer_id, activity_updates, learning_updates, product_updates, updated_at
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (customer_id) DO UPDATE SET
        activity_updates = EXCLUDED.activity_updates,
        learning_updates = EXCLUDED.learning_updates,
        product_updates = EXCLUDED.product_updates,
        updated_at = EXCLUDED.updated_at
    `, [customerId, input.activity_updates, input.learning_updates, input.product_updates, at]);
    return { ...input, updated_at: at.toISOString() };
  }

  async markNotificationRead(customerId: CustomerId, notificationId: string, at: Date): Promise<void> {
    await this.database.query(`
      INSERT INTO rewards_notification_reads (customer_id, notification_id, read_at)
      VALUES ($1, $2, $3) ON CONFLICT (customer_id, notification_id) DO NOTHING
    `, [customerId, notificationId, at]);
  }

  async completeAction(customerId: CustomerId, actionId: string, at: Date): Promise<boolean> {
    const result = await this.database.query(`
      UPDATE rewards_customer_actions SET status = 'COMPLETED', completed_at = $3, updated_at = $3
      WHERE customer_id = $1 AND id = $2 AND status = 'PENDING'
    `, [customerId, actionId, at]);
    if ((result.rowCount ?? 0) > 0) return true;
    const replay = await this.database.query<{ completed: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM rewards_customer_actions
        WHERE customer_id = $1 AND id = $2 AND status = 'COMPLETED'
      ) AS completed
    `, [customerId, actionId]);
    return replay.rows[0]?.completed === true;
  }

  async updateLearningProgress(customerId: CustomerId, input: UpdateLearningProgressInput, at: Date): Promise<boolean> {
    const result = await this.database.query(`
      UPDATE rewards_learning_assignments SET
        progress = GREATEST(progress, $3),
        status = CASE WHEN GREATEST(progress, $3) = 100 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,
        last_activity_at = $4,
        completed_at = CASE WHEN GREATEST(progress, $3) = 100 THEN COALESCE(completed_at, $4) ELSE completed_at END,
        updated_at = $4
      WHERE customer_id = $1 AND id = $2
    `, [customerId, input.assignment_id, input.progress, at]);
    return (result.rowCount ?? 0) > 0;
  }
}

function projectPortal(
  summary: RewardsJourneySummaryHttpResponse,
  activities: RewardsActivityDetailsHttpResponse,
  movements: RewardsMovementDetailsHttpResponse,
  state: PortalStoredState,
): RewardsCustomerPortalHttpResponse {
  const actions = state.actions.map(mapAssignedAction);
  const pendingAction = actions.find((action) => action.status === "PENDING");
  const pendingDocument = state.documents.find((request) => request.status === "REQUESTED");
  const pendingLearning = state.learning.find((item) => item.status !== "COMPLETED");
  const primaryAction = pendingAction
    ?? (pendingDocument ? documentPrimaryAction(pendingDocument) : undefined)
    ?? (pendingLearning ? learningPrimaryAction(pendingLearning) : undefined)
    ?? journeyPrimaryAction(summary.journey.state);
  const products = state.products.map((product) => mapProduct(product, summary.journey.current_level));
  const timeline = buildTimeline(summary, movements, activities, state);
  const notifications = timeline.slice(0, 8).map((entry) => ({
    id: `notice:${entry.id}`,
    title: entry.title,
    message: entry.description,
    occurred_at: entry.occurred_at,
    read: state.readNotificationIds.has(`notice:${entry.id}`),
    href: entry.type === "PRODUCT" ? "#productos" : entry.type === "ACTIVITY" ? "#actividad" : null,
  }));
  return assertRewardsCustomerPortalContract({
    customer_id: summary.customer_id,
    journey: summary,
    activity_details: activities,
    movement_details: movements,
    primary_action: primaryAction,
    actions,
    timeline,
    notifications: { unread_count: notifications.filter((item) => !item.read).length, items: notifications },
    products,
    preferences: state.preferences,
    learning: { items: state.learning },
    documents: { requests: state.documents },
    help: journeyStateHelp(summary.journey.state, summary.journey.current_level),
  });
}

function buildTimeline(
  summary: RewardsJourneySummaryHttpResponse,
  movements: RewardsMovementDetailsHttpResponse,
  activities: RewardsActivityDetailsHttpResponse,
  state: PortalStoredState,
): CustomerTimelineEntry[] {
  const entries: CustomerTimelineEntry[] = [{
    id: `registration:${summary.journey.registered_at}`,
    type: "REGISTRATION",
    title: "Registro completado",
    description: "Tu cuenta Carobra Rewards quedó creada.",
    occurred_at: summary.journey.registered_at,
  }];
  for (const product of state.products) entries.push({
    id: `product:${product.id}:${product.updated_at.toISOString()}`,
    type: "PRODUCT",
    title: product.status === "ACTIVE" ? "Producto confirmado" : `Producto ${productStatusLabel(product.status).toLowerCase()}`,
    description: productGuidance(product.status),
    occurred_at: (product.activated_at ?? product.ended_at ?? product.updated_at).toISOString(),
  });
  for (const movement of movements.movements) entries.push({
    id: `points:${movement.code}:${movement.occurred_at}`,
    type: "POINTS",
    title: movementTitle(movement.code),
    description: `${BigInt(movement.points_delta) >= 0n ? "+" : ""}${movement.points_delta} puntos en tu cuenta.`,
    occurred_at: movement.occurred_at,
  });
  for (const activity of activities.activities) entries.push({
    id: `activity:${activity.activity_type}:${activity.occurred_at}`,
    type: "ACTIVITY",
    title: activityTitle(activity.activity_type),
    description: activity.qualifies ? "Esta actividad quedó registrada en tu perfil." : "Actividad registrada en tu cuenta.",
    occurred_at: activity.occurred_at,
  });
  for (const level of state.levels) entries.push({
    id: `level:${level.id}`,
    type: "LEVEL",
    title: level.resulting_level ? `Nivel ${levelLabel(level.resulting_level)}` : "Nivel actualizado",
    description: "Carobra recalculó tu nivel con la información vigente de tu cuenta.",
    occurred_at: level.decided_at.toISOString(),
  });
  for (const item of state.learning) {
    entries.push({
      id: `learning:${item.id}:${item.last_activity_at ?? item.assigned_at}`,
      type: "LEARNING",
      title: item.status === "COMPLETED" ? "Curso completado" : "Avance de aprendizaje",
      description: item.title,
      occurred_at: item.last_activity_at ?? item.assigned_at,
    });
  }
  for (const request of state.documents) entries.push({
    id: `document:${request.id}:${request.status}`,
    type: "DOCUMENT",
    title: request.status === "REQUESTED" ? "Documento solicitado" : "Documento actualizado",
    description: request.title,
    occurred_at: request.updated_at,
  });
  return entries.sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)).slice(0, 30);
}

function mapAssignedAction(row: PortalActionRow): CustomerPortalAction {
  return {
    id: row.id,
    type: row.action_type as CustomerPortalAction["type"],
    title: row.title,
    description: row.description,
    status: row.status === "COMPLETED" ? "COMPLETED" : "PENDING",
    href: row.href,
    approved_points: row.approved_points,
  };
}

function journeyPrimaryAction(state: RewardsJourneyState): CustomerPortalAction {
  const actions: Record<RewardsJourneyState, CustomerPortalAction> = {
    INVITED: { id: "journey:validation", type: "STATUS", title: "Estamos validando tu producto", description: "No necesitas hacer nada adicional. Te avisaremos cuando Carobra termine la revisión.", status: "INFORMATIONAL", href: null, approved_points: null },
    ACTIVE: { id: "journey:profile", type: "CONTENT", title: "Sigue construyendo tu perfil", description: "Aquí aparecerán actividades, contenidos y documentos aprobados para ti.", status: "INFORMATIONAL", href: "#actividad", approved_points: null },
    INACTIVE: { id: "journey:inactive", type: "SUPPORT", title: "Revisa el estado de tu cuenta", description: "Tu historial está protegido, pero actualmente no encontramos un producto activo.", status: "INFORMATIONAL", href: "mailto:soporte@carobra.mx", approved_points: null },
    BLOCKED: { id: "journey:support", type: "SUPPORT", title: "Tu cuenta está en revisión", description: "Nuestro equipo necesita revisar información. No repitas tu registro.", status: "INFORMATIONAL", href: "mailto:soporte@carobra.mx", approved_points: null },
  };
  return actions[state];
}

function documentPrimaryAction(request: CustomerDocumentRequest): CustomerPortalAction {
  return { id: request.id, type: "DOCUMENT", title: request.title, description: request.purpose, status: "PENDING", href: "#documentos", approved_points: null };
}
function learningPrimaryAction(item: CustomerLearningItem): CustomerPortalAction {
  return { id: item.id, type: "LEARNING", title: item.title, description: item.description, status: "PENDING", href: "/cliente/cursos", approved_points: null };
}
function mapProduct(product: ProductRow, level: RewardsLevel | null): CustomerProductDetail {
  return {
    id: product.id,
    product_type: product.product_type,
    label: productLabel(product.product_type),
    status: product.status,
    status_label: productStatusLabel(product.status),
    activated_at: product.activated_at?.toISOString() ?? null,
    ended_at: product.ended_at?.toISOString() ?? null,
    level_impact: product.status === "ACTIVE" ? `Se considera en tu nivel${level ? ` ${levelLabel(level)}` : ""}.` : "No se considera como producto activo en tu nivel actual.",
    guidance: productGuidance(product.status),
  };
}

function productLabel(type: string): string {
  return ({ AFORE: "Cuenta de retiro", PPR: "Plan personal de retiro", AUTO_POLICY: "Protección de auto", ADDITIONAL_PRODUCT: "Producto Carobra" } as Record<string, string>)[type] ?? "Producto Carobra";
}
function productStatusLabel(status: RewardsProductFactStatus): string {
  return ({ ACTIVE: "Activo", PENDING: "En validación", SIGNED: "En proceso", REJECTED: "No confirmado", CANCELLED: "Cancelado", ENDED: "Finalizado" })[status];
}
function productGuidance(status: RewardsProductFactStatus): string {
  return ({ ACTIVE: "Tu producto está confirmado y forma parte de tu relación con Carobra.", PENDING: "Carobra está validando la información de tu producto.", SIGNED: "Tu producto continúa en proceso y todavía no cambia tu nivel.", REJECTED: "No pudimos confirmar este producto. Contacta a Carobra si necesitas ayuda.", CANCELLED: "El producto fue cancelado y tu nivel se recalculó con los productos restantes.", ENDED: "El producto terminó y conservamos su historial en tu cuenta." })[status];
}
function movementTitle(code: string): string {
  return ({ V2_INVITED_REGISTRATION: "Puntos de bienvenida", V2_INITIAL_PRODUCT_ACTIVE: "Puntos por producto confirmado", REGISTRATION_ACTIVATION: "Bienvenida a Carobra Rewards" } as Record<string, string>)[code] ?? "Movimiento de puntos";
}
function activityTitle(type: string): string {
  return ({ QUESTIONNAIRE_COMPLETED: "Cuestionario completado", CONTENT_VIEWED: "Contenido consultado", DOCUMENT_UPLOADED: "Documento recibido", PROFILE_UPDATED: "Perfil actualizado" } as Record<string, string>)[type] ?? "Actividad completada";
}
function levelLabel(level: RewardsLevel): string { return ({ BRONZE: "Bronce", SILVER: "Plata", GOLD: "Oro", PLATINUM: "Platino", TITANIUM: "Titanio" })[level]; }
function defaultPreferences(): RewardsCustomerPreferences { return { activity_updates: true, learning_updates: true, product_updates: true, updated_at: null }; }
function requireBooleanPreferences(input: UpdatePreferencesInput): void {
  if (typeof input.activity_updates !== "boolean" || typeof input.learning_updates !== "boolean" || typeof input.product_updates !== "boolean") throw new Error("Preference values must be boolean");
}
function requireUuidLike(value: string): string {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(normalized)) throw new Error("Resource identity is invalid");
  return normalized;
}
