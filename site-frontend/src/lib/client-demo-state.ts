export interface ClientIdentity {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export type BenefitState = "disponible" | "proximo" | "canjeado";

export interface DemoBenefit {
  id: string;
  title: string;
  category: string;
  validUntil: string;
  state: BenefitState;
  description: string;
}

export interface DemoActivity {
  id: string;
  type: "actividad" | "redencion" | "perfil" | "notificacion";
  title: string;
  description: string;
  status: string;
  createdAt: string;
}

export interface DemoNotification {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
}

export interface DemoProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
}

export interface ClientDemoState {
  version: 1;
  levelLabel: string;
  points: number;
  progressPercent: number;
  pointsToNextLevel: number;
  onboardingSeen: boolean;
  profile: DemoProfile;
  benefits: DemoBenefit[];
  activity: DemoActivity[];
  notifications: DemoNotification[];
}

const STORAGE_PREFIX = "carobra:client-demo-state:v1";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getStorageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function getDemoStorage() {
  if (typeof sessionStorage === "undefined") {
    return null;
  }

  return sessionStorage;
}

function createInitialState(user: ClientIdentity): ClientDemoState {
  const now = Date.now();
  const hoursAgo = (hours: number) =>
    new Date(now - hours * 60 * 60 * 1000).toISOString();
  const daysAgo = (days: number) =>
    new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date(now).toISOString();

  return {
    version: 1,
    levelLabel: "Platinum Plus",
    points: 8450,
    progressPercent: 82,
    pointsToNextLevel: 1850,
    onboardingSeen: false,
    profile: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: "",
      city: "",
    },
    benefits: [
      {
        id: "benefit_gourmet",
        title: "Cena degustación para 2",
        category: "Gastronomía",
        validUntil: "2026-08-30",
        state: "disponible",
        description:
          "Accede a una experiencia gastronómica con menú especial en restaurantes aliados seleccionados por Carobra.",
      },
      {
        id: "benefit_upgrade",
        title: "Upgrade de experiencia premium",
        category: "Experiencias",
        validUntil: "2026-10-15",
        state: "disponible",
        description:
          "Desbloquea un upgrade de servicio en eventos aliados para elevar tu experiencia en momentos clave.",
      },
      {
        id: "benefit_valet",
        title: "Valet sin costo",
        category: "Movilidad",
        validUntil: "2026-07-20",
        state: "proximo",
        description:
          "Beneficio de valet en ubicaciones participantes una vez cumplido el siguiente hito de actividad.",
      },
      {
        id: "benefit_wellness",
        title: "Sesión wellness exclusiva",
        category: "Bienestar",
        validUntil: "2026-09-10",
        state: "proximo",
        description:
          "Sesión personalizada de bienestar para miembros con actividad consistente en el programa.",
      },
      {
        id: "benefit_lounge",
        title: "Acceso lounge preferente",
        category: "Lifestyle",
        validUntil: "2026-12-31",
        state: "canjeado",
        description:
          "Acceso preferente a espacios lounge seleccionados con beneficios adicionales.",
      },
    ],
    activity: [
      {
        id: createId("act"),
        type: "actividad",
        title: "Actividad validada",
        description: "Tu consumo en restaurante aliado fue validado correctamente.",
        status: "confirmada",
        createdAt: hoursAgo(3),
      },
      {
        id: createId("act"),
        type: "redencion",
        title: "Redención registrada",
        description: "Acceso lounge preferente marcado como canjeado.",
        status: "completada",
        createdAt: hoursAgo(20),
      },
      {
        id: createId("act"),
        type: "notificacion",
        title: "Novedad revisada",
        description: "Leíste el comunicado sobre beneficios de temporada.",
        status: "registrada",
        createdAt: hoursAgo(28),
      },
      {
        id: createId("act"),
        type: "perfil",
        title: "Perfil actualizado",
        description: "Se actualizó tu ciudad de residencia para segmentación local.",
        status: "confirmada",
        createdAt: daysAgo(2),
      },
      {
        id: createId("act"),
        type: "actividad",
        title: "Hito mensual alcanzado",
        description: "Superaste el umbral de actividad requerido para beneficios premium.",
        status: "confirmada",
        createdAt: daysAgo(3),
      },
      {
        id: createId("act"),
        type: "redencion",
        title: "Redención completada",
        description: "Sesión wellness exclusiva redimida con referencia CRB-204831.",
        status: "completada",
        createdAt: daysAgo(4),
      },
      {
        id: createId("act"),
        type: "actividad",
        title: "Consumo aliado confirmado",
        description: "Tu visita en partner gastronómico generó acreditación de puntos.",
        status: "confirmada",
        createdAt: daysAgo(5),
      },
      {
        id: createId("act"),
        type: "notificacion",
        title: "Novedad revisada",
        description: "Revisaste el aviso de disponibilidad de Valet sin costo.",
        status: "registrada",
        createdAt: daysAgo(6),
      },
      {
        id: createId("act"),
        type: "perfil",
        title: "Datos de contacto validados",
        description: "Se verificó tu número telefónico para notificaciones operativas.",
        status: "confirmada",
        createdAt: daysAgo(8),
      },
      {
        id: createId("act"),
        type: "actividad",
        title: "Bienvenida completada",
        description: "Terminaste el onboarding inicial del programa Carobra Rewards.",
        status: "completada",
        createdAt: daysAgo(10),
      },
    ],
    notifications: [
      {
        id: createId("noti"),
        title: "Bienvenido a Carobra Rewards",
        description: "Ya puedes consultar beneficios según tu estado y actividad reciente.",
        createdAt,
        read: false,
      },
      {
        id: createId("noti"),
        title: "Nuevo beneficio cercano",
        description: "Estás cerca de desbloquear Valet sin costo este mes.",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        read: false,
      },
    ],
  };
}

function sanitizeState(state: ClientDemoState, user: ClientIdentity): ClientDemoState {
  const safeFirstName = user.firstName.trim() || state.profile?.firstName?.trim() || "";
  const safeLastName = user.lastName.trim() || state.profile?.lastName?.trim() || "";
  const safeEmail = user.email.trim() || state.profile?.email?.trim() || "";

  const normalized: ClientDemoState = {
    ...state,
    version: 1,
    profile: {
      ...state.profile,
      firstName: safeFirstName,
      lastName: safeLastName,
      email: safeEmail,
    },
  };

  return normalized;
}

export function loadClientDemoState(user: ClientIdentity): ClientDemoState {
  const storage = getDemoStorage();
  if (!storage) {
    return createInitialState(user);
  }

  const key = getStorageKey(user.id);
  const raw = storage.getItem(key);
  if (!raw) {
    const initial = createInitialState(user);
    storage.setItem(key, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as ClientDemoState;
    const normalized = sanitizeState(parsed, user);
    storage.setItem(key, JSON.stringify(normalized));
    return normalized;
  } catch {
    const fallback = createInitialState(user);
    storage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

export function saveClientDemoState(userId: string, state: ClientDemoState) {
  const storage = getDemoStorage();
  if (!storage) {
    return;
  }

  storage.setItem(getStorageKey(userId), JSON.stringify(state));
}

export function getHighlightedBenefits(state: ClientDemoState, limit = 5) {
  return state.benefits.slice(0, limit);
}

export function getActivityHistory(state: ClientDemoState, limit?: number) {
  const sorted = [...state.activity].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (typeof limit === "number") {
    return sorted.slice(0, limit);
  }

  return sorted;
}

export function getRecentActivity(state: ClientDemoState, limit = 4) {
  return getActivityHistory(state, limit);
}

export function getRecentNotifications(state: ClientDemoState, limit = 4) {
  return state.notifications.slice(0, limit);
}

export function getBenefitStateLabel(state: BenefitState) {
  if (state === "disponible") {
    return "Disponible";
  }

  if (state === "proximo") {
    return "Próximo";
  }

  return "Canjeado";
}

export function markOnboardingSeen(user: ClientIdentity): ClientDemoState {
  const state = loadClientDemoState(user);
  if (!state.onboardingSeen) {
    state.onboardingSeen = true;
    saveClientDemoState(user.id, state);
  }

  return state;
}

export function markNotificationAsRead(user: ClientIdentity, notificationId: string) {
  const state = loadClientDemoState(user);
  const notification = state.notifications.find((item) => item.id === notificationId);

  if (!notification || notification.read) {
    return state;
  }

  notification.read = true;
  state.activity.unshift({
    id: createId("act"),
    type: "notificacion",
    title: "Novedad revisada",
    description: `Leíste la novedad: ${notification.title}`,
    status: "registrada",
    createdAt: nowIso(),
  });

  saveClientDemoState(user.id, state);
  return state;
}

export function redeemBenefit(user: ClientIdentity, benefitId: string) {
  const state = loadClientDemoState(user);
  const benefit = state.benefits.find((item) => item.id === benefitId);

  if (!benefit) {
    return {
      ok: false,
      message: "No se encontró el beneficio seleccionado.",
      state,
    };
  }

  if (benefit.state !== "disponible") {
    return {
      ok: false,
      message: "Este beneficio no está disponible para redención en este momento.",
      state,
    };
  }

  benefit.state = "canjeado";
  const reference = `CRB-${Date.now().toString().slice(-6)}`;

  state.activity.unshift({
    id: createId("act"),
    type: "redencion",
    title: "Redención completada",
    description: `${benefit.title} canjeado con referencia ${reference}.`,
    status: "completada",
    createdAt: nowIso(),
  });

  state.notifications.unshift({
    id: createId("noti"),
    title: "Redención confirmada",
    description: `Tu redención de ${benefit.title} fue registrada. Ref: ${reference}.`,
    createdAt: nowIso(),
    read: false,
  });

  saveClientDemoState(user.id, state);
  return {
    ok: true,
    message: `Redención simulada completada. Referencia ${reference}.`,
    state,
    reference,
  };
}

export function updateProfile(user: ClientIdentity, updates: Partial<DemoProfile>) {
  const state = loadClientDemoState(user);
  state.profile = {
    ...state.profile,
    ...updates,
    email: user.email,
  };

  state.activity.unshift({
    id: createId("act"),
    type: "perfil",
    title: "Perfil actualizado",
    description: "Tus datos de perfil fueron actualizados correctamente.",
    status: "confirmada",
    createdAt: nowIso(),
  });

  state.notifications.unshift({
    id: createId("noti"),
    title: "Datos actualizados",
    description: "Tu perfil se actualizó y ya se refleja en tu panel.",
    createdAt: nowIso(),
    read: false,
  });

  saveClientDemoState(user.id, state);
  return state;
}
