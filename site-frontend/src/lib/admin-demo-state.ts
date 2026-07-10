export interface AdminIdentity {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export type AdminCustomerStatus = "activa" | "en_riesgo" | "nueva";
export type AdminBenefitLifecycleState = "activo" | "pausado" | "borrador";
export type AdminRedemptionStatus = "pendiente" | "en_revision" | "atendida" | "completada";

export interface AdminCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: AdminCustomerStatus;
  tier: string;
  enrolledAt: string;
  lastInteractionAt: string;
  participationNote: string;
}

export interface AdminBenefit {
  id: string;
  title: string;
  category: string;
  state: AdminBenefitLifecycleState;
  updatedAt: string;
}

export interface AdminRedemption {
  id: string;
  reference: string;
  customerId: string;
  benefitId: string;
  status: AdminRedemptionStatus;
  requestedAt: string;
  updatedAt: string;
  channel: string;
}

export interface AdminActivity {
  id: string;
  module: "inicio" | "clientes" | "beneficios" | "redenciones";
  title: string;
  description: string;
  status: string;
  createdAt: string;
  relatedCustomerId?: string;
  relatedBenefitId?: string;
  relatedRedemptionId?: string;
}

export interface AdminFlowProgress {
  homeVisited: boolean;
  customerDetailVisited: boolean;
  benefitActionCompleted: boolean;
  redemptionActionCompleted: boolean;
  impactConfirmed: boolean;
}

export interface AdminDashboardDemoState {
  version: 1;
  updatedAt: string;
  customers: AdminCustomer[];
  benefits: AdminBenefit[];
  redemptions: AdminRedemption[];
  activity: AdminActivity[];
  flow: AdminFlowProgress;
}

export interface OperationalSnapshot {
  customers: number;
  activeBenefits: number;
  recentRedemptions: number;
  newEnrollments: number;
  pendingRedemptions: number;
}

export interface PendingItem {
  id: string;
  severity: "alta" | "media" | "baja";
  title: string;
  description: string;
  href: string;
}

export interface EnrichedRedemption extends AdminRedemption {
  customerName: string;
  benefitTitle: string;
}

export interface AdminInsight {
  id: string;
  tone: "estable" | "atencion" | "positivo";
  title: string;
  description: string;
}

export interface AdminAlert {
  id: string;
  severity: "alta" | "media" | "baja";
  title: string;
  description: string;
  href: string;
}

export interface ConsistencyCheckResult {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface FlowStep {
  id: string;
  label: string;
  complete: boolean;
}

export interface CustomerDetailContext {
  customer: AdminCustomer;
  redemptions: EnrichedRedemption[];
  activity: AdminActivity[];
  nextActionHint: string;
}

export type AdminVisitRoute = "home" | "clientes" | "clienteDetalle" | "beneficios" | "redenciones";

const STORAGE_PREFIX = "carobra:admin-demo-state:v1";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const benefitStateLabels: Record<AdminBenefitLifecycleState, string> = {
  activo: "Activo",
  pausado: "Pausado",
  borrador: "Borrador",
};

const redemptionStatusLabels: Record<AdminRedemptionStatus, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  atendida: "Atendida",
  completada: "Completada",
};

const customerStatusLabels: Record<AdminCustomerStatus, string> = {
  activa: "Activa",
  en_riesgo: "En riesgo",
  nueva: "Nueva",
};

const validCustomerStatuses = new Set<AdminCustomerStatus>(["activa", "en_riesgo", "nueva"]);
const validBenefitStatuses = new Set<AdminBenefitLifecycleState>(["activo", "pausado", "borrador"]);
const validRedemptionStatuses = new Set<AdminRedemptionStatus>(["pendiente", "en_revision", "atendida", "completada"]);

function nowIso() {
  return new Date().toISOString();
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getStorageKey(adminId: string) {
  return `${STORAGE_PREFIX}:${adminId}`;
}

function getAdminStorage() {
  if (typeof sessionStorage === "undefined") {
    return null;
  }

  return sessionStorage;
}

function sortByDateDesc<T>(rows: T[], getDate: (row: T) => string) {
  return [...rows].sort((a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime());
}

function isWithinDays(dateIso: string, days: number) {
  const from = Date.now() - days * MS_PER_DAY;
  const value = new Date(dateIso).getTime();
  return Number.isFinite(value) && value >= from;
}

function getCustomerName(customer: AdminCustomer) {
  return `${customer.firstName} ${customer.lastName}`;
}

function createInitialState(): AdminDashboardDemoState {
  const createdAt = nowIso();

  const customers: AdminCustomer[] = [
    {
      id: "cust_amparo_arias",
      firstName: "Amparo",
      lastName: "Arias",
      email: "amparo.arias@carobra.demo",
      status: "activa",
      tier: "Platinum",
      enrolledAt: daysAgo(122),
      lastInteractionAt: daysAgo(1),
      participationNote: "Canjea beneficios de movilidad con frecuencia.",
    },
    {
      id: "cust_diego_ruiz",
      firstName: "Diego",
      lastName: "Ruiz",
      email: "diego.ruiz@carobra.demo",
      status: "en_riesgo",
      tier: "Gold",
      enrolledAt: daysAgo(95),
      lastInteractionAt: daysAgo(18),
      participationNote: "Disminuyó participación en las últimas dos semanas.",
    },
    {
      id: "cust_lucia_gomez",
      firstName: "Lucía",
      lastName: "Gómez",
      email: "lucia.gomez@carobra.demo",
      status: "nueva",
      tier: "Silver",
      enrolledAt: daysAgo(8),
      lastInteractionAt: daysAgo(2),
      participationNote: "Alta reciente; primer beneficio listo para acompañamiento.",
    },
    {
      id: "cust_mario_robles",
      firstName: "Mario",
      lastName: "Robles",
      email: "mario.robles@carobra.demo",
      status: "activa",
      tier: "Platinum",
      enrolledAt: daysAgo(180),
      lastInteractionAt: daysAgo(3),
      participationNote: "Mantiene uso estable de beneficios gastronómicos.",
    },
    {
      id: "cust_sofia_nava",
      firstName: "Sofía",
      lastName: "Nava",
      email: "sofia.nava@carobra.demo",
      status: "nueva",
      tier: "Silver",
      enrolledAt: daysAgo(14),
      lastInteractionAt: daysAgo(4),
      participationNote: "Recién incorporada, pendiente de primera redención.",
    },
    {
      id: "cust_raul_moya",
      firstName: "Raúl",
      lastName: "Moya",
      email: "raul.moya@carobra.demo",
      status: "activa",
      tier: "Gold",
      enrolledAt: daysAgo(65),
      lastInteractionAt: daysAgo(6),
      participationNote: "Participación moderada con foco en bienestar.",
    },
  ];

  const benefits: AdminBenefit[] = [
    {
      id: "benefit_express_dining",
      title: "Cena degustación express",
      category: "Gastronomía",
      state: "activo",
      updatedAt: daysAgo(1),
    },
    {
      id: "benefit_valet_weekend",
      title: "Valet weekend",
      category: "Movilidad",
      state: "activo",
      updatedAt: daysAgo(2),
    },
    {
      id: "benefit_spa_focus",
      title: "Sesión wellness focus",
      category: "Bienestar",
      state: "pausado",
      updatedAt: daysAgo(5),
    },
    {
      id: "benefit_lounge_plus",
      title: "Acceso lounge plus",
      category: "Lifestyle",
      state: "activo",
      updatedAt: daysAgo(3),
    },
    {
      id: "benefit_concierge_beta",
      title: "Concierge beta",
      category: "Experiencias",
      state: "borrador",
      updatedAt: daysAgo(9),
    },
  ];

  const redemptions: AdminRedemption[] = [
    {
      id: "red_31001",
      reference: "CRB-31001",
      customerId: "cust_lucia_gomez",
      benefitId: "benefit_express_dining",
      status: "pendiente",
      requestedAt: daysAgo(1),
      updatedAt: daysAgo(1),
      channel: "App cliente",
    },
    {
      id: "red_31002",
      reference: "CRB-31002",
      customerId: "cust_diego_ruiz",
      benefitId: "benefit_spa_focus",
      status: "en_revision",
      requestedAt: daysAgo(3),
      updatedAt: daysAgo(2),
      channel: "Asesor",
    },
    {
      id: "red_31003",
      reference: "CRB-31003",
      customerId: "cust_amparo_arias",
      benefitId: "benefit_valet_weekend",
      status: "atendida",
      requestedAt: daysAgo(2),
      updatedAt: daysAgo(1),
      channel: "App cliente",
    },
    {
      id: "red_31004",
      reference: "CRB-31004",
      customerId: "cust_mario_robles",
      benefitId: "benefit_lounge_plus",
      status: "completada",
      requestedAt: daysAgo(6),
      updatedAt: daysAgo(2),
      channel: "Call center",
    },
    {
      id: "red_31005",
      reference: "CRB-31005",
      customerId: "cust_sofia_nava",
      benefitId: "benefit_express_dining",
      status: "pendiente",
      requestedAt: daysAgo(4),
      updatedAt: daysAgo(4),
      channel: "App cliente",
    },
  ];

  const activity: AdminActivity[] = [
    {
      id: createId("act"),
      module: "redenciones",
      title: "Redención atendida",
      description: "CRB-31003 cambió a estado Atendida en módulo Redenciones.",
      status: "operativa",
      createdAt: daysAgo(1),
      relatedCustomerId: "cust_amparo_arias",
      relatedBenefitId: "benefit_valet_weekend",
      relatedRedemptionId: "red_31003",
    },
    {
      id: createId("act"),
      module: "beneficios",
      title: "Beneficio pausado",
      description: "Sesión wellness focus quedó en pausa por validación de proveedor.",
      status: "seguimiento",
      createdAt: daysAgo(2),
      relatedBenefitId: "benefit_spa_focus",
    },
    {
      id: createId("act"),
      module: "clientes",
      title: "Cliente en seguimiento",
      description: "Diego Ruiz marcado como En riesgo para recuperación temprana.",
      status: "alerta",
      createdAt: daysAgo(3),
      relatedCustomerId: "cust_diego_ruiz",
    },
    {
      id: createId("act"),
      module: "inicio",
      title: "Nueva alta validada",
      description: "Lucía Gómez confirmada como cliente nueva con onboarding activo.",
      status: "registro",
      createdAt: daysAgo(8),
      relatedCustomerId: "cust_lucia_gomez",
    },
  ];

  return {
    version: 1,
    updatedAt: createdAt,
    customers,
    benefits,
    redemptions,
    activity: sortByDateDesc(activity, (entry) => entry.createdAt),
    flow: {
      homeVisited: false,
      customerDetailVisited: false,
      benefitActionCompleted: false,
      redemptionActionCompleted: false,
      impactConfirmed: false,
    },
  };
}

function sanitizeState(raw: AdminDashboardDemoState): AdminDashboardDemoState {
  const fallback = createInitialState();

  if (!raw || raw.version !== 1) {
    return fallback;
  }

  const state: AdminDashboardDemoState = {
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallback.updatedAt,
    customers: Array.isArray(raw.customers) ? raw.customers : fallback.customers,
    benefits: Array.isArray(raw.benefits) ? raw.benefits : fallback.benefits,
    redemptions: Array.isArray(raw.redemptions) ? raw.redemptions : fallback.redemptions,
    activity: Array.isArray(raw.activity) ? raw.activity : fallback.activity,
    flow: {
      homeVisited: Boolean(raw.flow?.homeVisited),
      customerDetailVisited: Boolean(raw.flow?.customerDetailVisited),
      benefitActionCompleted: Boolean(raw.flow?.benefitActionCompleted),
      redemptionActionCompleted: Boolean(raw.flow?.redemptionActionCompleted),
      impactConfirmed: Boolean(raw.flow?.impactConfirmed),
    },
  };

  state.activity = sortByDateDesc(state.activity, (entry) => entry.createdAt);
  return state;
}

function updateImpactProgress(state: AdminDashboardDemoState) {
  if (state.flow.homeVisited && state.flow.customerDetailVisited && state.flow.benefitActionCompleted && state.flow.redemptionActionCompleted) {
    state.flow.impactConfirmed = true;
  }
}

function persistState(adminId: string, state: AdminDashboardDemoState) {
  const storage = getAdminStorage();
  if (!storage) {
    return;
  }

  storage.setItem(getStorageKey(adminId), JSON.stringify(state));
}

export function loadAdminDemoState(admin: AdminIdentity): AdminDashboardDemoState {
  const storage = getAdminStorage();
  if (!storage) {
    return createInitialState();
  }

  const key = getStorageKey(admin.id);
  const raw = storage.getItem(key);
  if (!raw) {
    const initial = createInitialState();
    storage.setItem(key, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as AdminDashboardDemoState;
    const sanitized = sanitizeState(parsed);
    storage.setItem(key, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    const fallback = createInitialState();
    storage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

export function getCustomerStatusLabel(status: AdminCustomerStatus) {
  return customerStatusLabels[status];
}

export function getBenefitLifecycleLabel(state: AdminBenefitLifecycleState) {
  return benefitStateLabels[state];
}

export function getRedemptionStatusLabel(status: AdminRedemptionStatus) {
  return redemptionStatusLabels[status];
}

export function getRedemptionNextStatus(current: AdminRedemptionStatus): AdminRedemptionStatus | null {
  if (current === "pendiente") {
    return "en_revision";
  }

  if (current === "en_revision") {
    return "atendida";
  }

  if (current === "atendida") {
    return "completada";
  }

  return null;
}

export function markAdminRouteVisited(admin: AdminIdentity, route: AdminVisitRoute) {
  const state = loadAdminDemoState(admin);

  if (route === "home") {
    state.flow.homeVisited = true;
  }

  if (route === "clienteDetalle") {
    state.flow.customerDetailVisited = true;
  }

  state.updatedAt = nowIso();
  updateImpactProgress(state);
  persistState(admin.id, state);
  return state;
}

export function getOperationalSnapshot(state: AdminDashboardDemoState): OperationalSnapshot {
  const customers = state.customers.length;
  const activeBenefits = state.benefits.filter((benefit) => benefit.state === "activo").length;
  const recentRedemptions = state.redemptions.filter((redemption) => {
    return redemption.status !== "pendiente" && isWithinDays(redemption.updatedAt, 7);
  }).length;
  const newEnrollments = state.customers.filter((customer) => isWithinDays(customer.enrolledAt, 30)).length;
  const pendingRedemptions = state.redemptions.filter((redemption) => redemption.status !== "completada").length;

  return {
    customers,
    activeBenefits,
    recentRedemptions,
    newEnrollments,
    pendingRedemptions,
  };
}

function enrichRedemption(redemption: AdminRedemption, state: AdminDashboardDemoState): EnrichedRedemption {
  const customer = state.customers.find((entry) => entry.id === redemption.customerId);
  const benefit = state.benefits.find((entry) => entry.id === redemption.benefitId);

  return {
    ...redemption,
    customerName: customer ? getCustomerName(customer) : "Cliente no encontrado",
    benefitTitle: benefit ? benefit.title : "Beneficio no encontrado",
  };
}

export function getRecentRedemptionsPreview(state: AdminDashboardDemoState, limit = 5): EnrichedRedemption[] {
  return sortByDateDesc(state.redemptions, (entry) => entry.updatedAt)
    .slice(0, limit)
    .map((entry) => enrichRedemption(entry, state));
}

export function getRecentActivity(state: AdminDashboardDemoState, limit = 8) {
  return sortByDateDesc(state.activity, (entry) => entry.createdAt).slice(0, limit);
}

export function getPendingOperationalItems(state: AdminDashboardDemoState, limit = 6): PendingItem[] {
  const items: PendingItem[] = [];

  const unresolvedRedemptions = sortByDateDesc(
    state.redemptions.filter((entry) => entry.status === "pendiente" || entry.status === "en_revision"),
    (entry) => entry.requestedAt,
  );

  unresolvedRedemptions.forEach((redemption) => {
    const customer = state.customers.find((entry) => entry.id === redemption.customerId);
    const benefit = state.benefits.find((entry) => entry.id === redemption.benefitId);

    items.push({
      id: `pending_redemption_${redemption.id}`,
      severity: redemption.status === "pendiente" ? "alta" : "media",
      title: `${redemption.reference} requiere seguimiento`,
      description: `${customer ? getCustomerName(customer) : "Cliente"} · ${benefit?.title ?? "beneficio"} · ${getRedemptionStatusLabel(redemption.status)}`,
      href: `/admin/redenciones?focus=${redemption.id}`,
    });
  });

  state.customers
    .filter((customer) => customer.status === "en_riesgo")
    .forEach((customer) => {
      items.push({
        id: `at_risk_customer_${customer.id}`,
        severity: "media",
        title: `${getCustomerName(customer)} en riesgo de abandono`,
        description: "Revisar detalle del cliente y coordinar acción de recuperación.",
        href: `/admin/clientes/${customer.id}`,
      });
    });

  state.benefits
    .filter((benefit) => benefit.state === "pausado")
    .forEach((benefit) => {
      items.push({
        id: `paused_benefit_${benefit.id}`,
        severity: "baja",
        title: `${benefit.title} está pausado`,
        description: "Validar proveedor y reactivar cuando el servicio esté disponible.",
        href: `/admin/beneficios?focus=${benefit.id}`,
      });
    });

  const severityScore: Record<PendingItem["severity"], number> = {
    alta: 0,
    media: 1,
    baja: 2,
  };

  return items
    .sort((a, b) => severityScore[a.severity] - severityScore[b.severity])
    .slice(0, limit);
}

export function searchCustomers(state: AdminDashboardDemoState, query: string) {
  const cleaned = query.trim().toLowerCase();
  const customers = sortByDateDesc(state.customers, (entry) => entry.lastInteractionAt);

  if (!cleaned) {
    return customers;
  }

  return customers.filter((customer) => {
    const name = getCustomerName(customer).toLowerCase();
    const email = customer.email.toLowerCase();
    const status = getCustomerStatusLabel(customer.status).toLowerCase();
    return name.includes(cleaned) || email.includes(cleaned) || status.includes(cleaned);
  });
}

export function getCustomerDetailContext(state: AdminDashboardDemoState, customerId: string): CustomerDetailContext | null {
  const customer = state.customers.find((entry) => entry.id === customerId);

  if (!customer) {
    return null;
  }

  const redemptions = sortByDateDesc(
    state.redemptions.filter((entry) => entry.customerId === customerId),
    (entry) => entry.updatedAt,
  ).map((entry) => enrichRedemption(entry, state));

  const activity = sortByDateDesc(
    state.activity.filter((entry) => entry.relatedCustomerId === customerId),
    (entry) => entry.createdAt,
  ).slice(0, 5);

  const unresolved = redemptions.find((entry) => entry.status !== "completada");

  const nextActionHint = unresolved
    ? `Da seguimiento a ${unresolved.reference} (${getRedemptionStatusLabel(unresolved.status)}).`
    : "No hay redenciones pendientes para este cliente.";

  return {
    customer,
    redemptions,
    activity,
    nextActionHint,
  };
}

function appendActivity(state: AdminDashboardDemoState, entry: Omit<AdminActivity, "id" | "createdAt">) {
  state.activity.unshift({
    id: createId("act"),
    createdAt: nowIso(),
    ...entry,
  });

  state.activity = sortByDateDesc(state.activity, (row) => row.createdAt).slice(0, 20);
}

export function setBenefitLifecycleState(admin: AdminIdentity, benefitId: string, nextState: AdminBenefitLifecycleState) {
  const state = loadAdminDemoState(admin);
  const benefit = state.benefits.find((entry) => entry.id === benefitId);

  if (!benefit) {
    return {
      ok: false,
      message: "No se encontró el beneficio solicitado.",
      state,
    };
  }

  if (benefit.state === nextState) {
    return {
      ok: false,
      message: "El beneficio ya tiene ese estado.",
      state,
    };
  }

  const previousState = benefit.state;
  benefit.state = nextState;
  benefit.updatedAt = nowIso();
  state.updatedAt = nowIso();
  state.flow.benefitActionCompleted = true;

  appendActivity(state, {
    module: "beneficios",
    title: "Estado de beneficio actualizado",
    description: `${benefit.title} cambió de ${getBenefitLifecycleLabel(previousState)} a ${getBenefitLifecycleLabel(nextState)}.`,
    status: "confirmado",
    relatedBenefitId: benefit.id,
  });

  updateImpactProgress(state);
  persistState(admin.id, state);

  return {
    ok: true,
    message: `Beneficio actualizado a ${getBenefitLifecycleLabel(nextState)}.`,
    state,
  };
}

export function advanceRedemptionStatus(admin: AdminIdentity, redemptionId: string) {
  const state = loadAdminDemoState(admin);
  const redemption = state.redemptions.find((entry) => entry.id === redemptionId);

  if (!redemption) {
    return {
      ok: false,
      message: "No se encontró la redención seleccionada.",
      state,
    };
  }

  const nextStatus = getRedemptionNextStatus(redemption.status);

  if (!nextStatus) {
    return {
      ok: false,
      message: "La redención ya está completada.",
      state,
    };
  }

  const previousStatus = redemption.status;
  redemption.status = nextStatus;
  redemption.updatedAt = nowIso();
  state.updatedAt = nowIso();
  state.flow.redemptionActionCompleted = true;

  const customer = state.customers.find((entry) => entry.id === redemption.customerId);
  const benefit = state.benefits.find((entry) => entry.id === redemption.benefitId);

  if (customer) {
    customer.lastInteractionAt = nowIso();

    if (customer.status === "nueva" && (nextStatus === "atendida" || nextStatus === "completada")) {
      customer.status = "activa";
    }
  }

  appendActivity(state, {
    module: "redenciones",
    title: "Redención progresada",
    description: `${redemption.reference} pasó de ${getRedemptionStatusLabel(previousStatus)} a ${getRedemptionStatusLabel(nextStatus)} (${customer ? getCustomerName(customer) : "cliente"} · ${benefit?.title ?? "beneficio"}).`,
    status: "confirmado",
    relatedCustomerId: redemption.customerId,
    relatedBenefitId: redemption.benefitId,
    relatedRedemptionId: redemption.id,
  });

  updateImpactProgress(state);
  persistState(admin.id, state);

  return {
    ok: true,
    message: `Redención ${redemption.reference} actualizada a ${getRedemptionStatusLabel(nextStatus)}.`,
    state,
  };
}

export function getRepresentativeInsights(state: AdminDashboardDemoState): AdminInsight[] {
  const totalRedemptions = state.redemptions.length;
  const completedRedemptions = state.redemptions.filter((entry) => entry.status === "completada").length;
  const unresolvedRedemptions = state.redemptions.filter((entry) => entry.status !== "completada").length;
  const completionRate = totalRedemptions > 0 ? Math.round((completedRedemptions / totalRedemptions) * 100) : 0;
  const atRiskCustomers = state.customers.filter((entry) => entry.status === "en_riesgo").length;
  const newEnrollments = state.customers.filter((entry) => isWithinDays(entry.enrolledAt, 30)).length;

  return [
    {
      id: "insight_completion",
      tone: completionRate >= 55 ? "positivo" : "atencion",
      title: "Cierre operativo de redenciones",
      description: `${completedRedemptions}/${totalRedemptions} redenciones están completadas (${completionRate}%).` +
        (unresolvedRedemptions > 0 ? ` Quedan ${unresolvedRedemptions} en proceso.` : " Sin pendientes abiertos."),
    },
    {
      id: "insight_recovery",
      tone: atRiskCustomers > 0 ? "atencion" : "estable",
      title: "Seguimiento de clientes sensibles",
      description:
        atRiskCustomers > 0
          ? `${atRiskCustomers} cliente(s) están en riesgo y requieren contacto desde Clientes.`
          : "No hay clientes en riesgo visible para esta sesión.",
    },
    {
      id: "insight_enrollment",
      tone: newEnrollments > 0 ? "estable" : "atencion",
      title: "Onboarding reciente",
      description:
        newEnrollments > 0
          ? `${newEnrollments} alta(s) reciente(s) aportan volumen nuevo al programa durante los últimos 30 días.`
          : "No se registran altas recientes en los últimos 30 días.",
    },
  ];
}

export function getOperationalAlerts(state: AdminDashboardDemoState): AdminAlert[] {
  const alerts: AdminAlert[] = [];

  const pendingCount = state.redemptions.filter((entry) => entry.status === "pendiente").length;
  if (pendingCount >= 2) {
    alerts.push({
      id: "alert_pending_redemptions",
      severity: "alta",
      title: "Pendientes sin tomar",
      description: `${pendingCount} redenciones están en estado Pendiente y requieren primer contacto operativo.`,
      href: "/admin/redenciones",
    });
  }

  const atRiskCount = state.customers.filter((entry) => entry.status === "en_riesgo").length;
  if (atRiskCount > 0) {
    alerts.push({
      id: "alert_at_risk_customers",
      severity: "media",
      title: "Clientes en riesgo",
      description: `${atRiskCount} cliente(s) muestran baja participación reciente y necesitan seguimiento.`,
      href: "/admin/clientes",
    });
  }

  const pausedBenefits = state.benefits.filter((entry) => entry.state === "pausado").length;
  if (pausedBenefits > 0) {
    alerts.push({
      id: "alert_paused_benefits",
      severity: "baja",
      title: "Beneficios pausados",
      description: `${pausedBenefits} beneficio(s) pausado(s) pueden afectar experiencia de redención.`,
      href: "/admin/beneficios",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "alert_clear_board",
      severity: "baja",
      title: "Sin alertas críticas",
      description: "No se detectan alertas operativas relevantes en esta sesión.",
      href: "/admin",
    });
  }

  return alerts;
}

export function runConsistencyChecks(state: AdminDashboardDemoState): ConsistencyCheckResult[] {
  const checks: ConsistencyCheckResult[] = [];

  const statusesAreValid =
    state.customers.every((customer) => validCustomerStatuses.has(customer.status)) &&
    state.benefits.every((benefit) => validBenefitStatuses.has(benefit.state)) &&
    state.redemptions.every((redemption) => validRedemptionStatuses.has(redemption.status));

  checks.push({
    id: "states-vocabulary",
    label: "Vocabulario operativo consistente",
    ok: statusesAreValid,
    detail: statusesAreValid
      ? "Estados de clientes, beneficios y redenciones usan el vocabulario compartido definido para demo."
      : "Se detectaron estados fuera del vocabulario esperado.",
  });

  const referencesAreValid = state.redemptions.every((redemption) => {
    const customerExists = state.customers.some((customer) => customer.id === redemption.customerId);
    const benefitExists = state.benefits.some((benefit) => benefit.id === redemption.benefitId);
    return customerExists && benefitExists;
  });

  checks.push({
    id: "record-references",
    label: "Referencias de redenciones válidas",
    ok: referencesAreValid,
    detail: referencesAreValid
      ? "Cada redención apunta a un cliente y beneficio existente."
      : "Hay redenciones con referencias rotas hacia cliente o beneficio.",
  });

  const activityIsOrdered = state.activity.every((entry, index, array) => {
    if (index === 0) {
      return true;
    }

    return new Date(array[index - 1].createdAt).getTime() >= new Date(entry.createdAt).getTime();
  });

  checks.push({
    id: "activity-order",
    label: "Actividad ordenada por recencia",
    ok: activityIsOrdered,
    detail: activityIsOrdered
      ? "La actividad reciente mantiene orden descendente y trazabilidad narrativa."
      : "La actividad está fuera de orden cronológico.",
  });

  const snapshot = getOperationalSnapshot(state);
  const countersAreCoherent =
    snapshot.activeBenefits <= state.benefits.length &&
    snapshot.recentRedemptions <= state.redemptions.length &&
    snapshot.pendingRedemptions === state.redemptions.filter((entry) => entry.status !== "completada").length;

  checks.push({
    id: "snapshot-coherence",
    label: "Coherencia de contadores en Inicio",
    ok: countersAreCoherent,
    detail: countersAreCoherent
      ? "Contadores y tablas están sincronizados en la sesión actual."
      : "Hay diferencias entre resumen de Inicio y datos operativos.",
  });

  return checks;
}

export function getDemoFlowValidation(state: AdminDashboardDemoState): FlowStep[] {
  return [
    {
      id: "flow-login",
      label: "Login y acceso a panel admin",
      complete: true,
    },
    {
      id: "flow-home",
      label: "Inicio revisado con snapshot y pendientes",
      complete: state.flow.homeVisited,
    },
    {
      id: "flow-customer-detail",
      label: "Detalle de cliente consultado",
      complete: state.flow.customerDetailVisited,
    },
    {
      id: "flow-benefit-action",
      label: "Acción operativa en Beneficios ejecutada",
      complete: state.flow.benefitActionCompleted,
    },
    {
      id: "flow-redemption-action",
      label: "Acción operativa en Redenciones ejecutada",
      complete: state.flow.redemptionActionCompleted,
    },
    {
      id: "flow-impact-confirmed",
      label: "Regreso a Inicio y confirmación de impacto",
      complete: state.flow.impactConfirmed,
    },
  ];
}

export function getPresenterWalkthroughScript(state: AdminDashboardDemoState) {
  const pendingRedemption = state.redemptions.find((entry) => entry.status === "pendiente") ?? state.redemptions[0];
  const pendingCustomer = pendingRedemption
    ? state.customers.find((entry) => entry.id === pendingRedemption.customerId)
    : state.customers[0];
  const editableBenefit = state.benefits.find((entry) => entry.state !== "activo") ?? state.benefits[0];

  const customerName = pendingCustomer ? getCustomerName(pendingCustomer) : "cliente de referencia";
  const redemptionReference = pendingRedemption ? pendingRedemption.reference : "redención de referencia";

  return [
    "Accede con rol admin y abre Inicio para mostrar snapshot operativo y alertas.",
    `Desde pendientes, explica el caso ${redemptionReference} y navega al cliente ${customerName}.`,
    "En Clientes, revisa contexto de participación y confirma el siguiente paso operativo.",
    `En Beneficios, actualiza el estado de ${editableBenefit?.title ?? "un beneficio"} para mostrar acción administrativa con confirmación visible.`,
    `En Redenciones, avanza el estado de ${redemptionReference} para evidenciar progresión operativa.`,
    "Vuelve a Inicio y valida impacto en actividad reciente, pendientes y contadores.",
  ];
}
