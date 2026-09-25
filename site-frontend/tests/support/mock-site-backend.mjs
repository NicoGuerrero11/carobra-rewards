import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 3002;
const pendingSessionCookie = "carobra_session=e2e-pending";
const eligibleSessionCookie = "carobra_session=e2e-eligible";
const inactiveSessionCookie = "carobra_session=e2e-inactive";
const attentionSessionCookie = "carobra_session=e2e-attention";
const videoProgress = new Map();
const notificationReads = new Map();
function notificationKey(request, candidate) { return `${candidate.id}:${homeCookie(request, 'notifications-test') ?? 'default'}`; }
function notificationPortal(request, candidate, portal) {
  if (!homeCookie(request, 'notifications-test')) return portal;
  const read = notificationReads.get(notificationKey(request, candidate)) ?? new Set();
  const mode = homeCookie(request, 'notifications-state');
  portal.notifications.items = mode === 'empty' ? [] : portal.notifications.items.map(item => ({ ...item, read: mode === 'read' || read.has(item.id) }));
  portal.notifications.unread_count = portal.notifications.items.filter(item => !item.read).length;
  return portal;
}
function progressKey(request,courseId) {return `${request.headers.cookie?.match(/progress-test=([^;]+)/)?.[1]??'default'}:${courseId}`;}
function progressFor(request,courseId) {
  const chapters=videoProgress.get(progressKey(request,courseId))??[];
  const count=chapters.filter(c=>c.manual_completed_at||c.playback_completed_at).length;
  return {completed_chapters:count,total_chapters:3,completed:count===3,chapters};
}
function homeCookie(request,name) {return request.headers.cookie?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1];}
function homePortal(request,candidate) {
  const portal=portalFor(candidate);
  const level=homeCookie(request,'home-level');
  if(['BRONZE','SILVER','GOLD','PLATINUM','TITANIUM'].includes(level)) portal.journey.journey.current_level=level;
  const state=homeCookie(request,'home-state');
  if(['BLOCKED','INACTIVE'].includes(state)) portal.journey.journey.state=state;
  if(homeCookie(request,'home-rules')==='true') {
    portal.journey.progress={target_level:'SILVER',rule_available:true,remaining_active_products:1,remaining_registration_months:2,remaining_qualifying_activities:0};
    portal.journey.modules.expiry_policy_approved=true;
  }
  if (homeCookie(request, 'help-fixture') === 'state') {
    const body = candidate === eligibleProfile ? 'Tu nivel considera productos activos, permanencia y actividades aprobadas; gastar puntos no lo reduce.'
      : candidate === inactiveProfile ? 'Tus movimientos permanecen protegidos. Tu nivel volverá a calcularse cuando exista un producto activo confirmado.'
      : candidate === attentionProfile ? 'Carobra necesita revisar información de tu producto. No repitas tu registro.'
      : 'Carobra está confirmando tu primer producto. Puedes consultar tu cuenta mientras terminamos.';
    portal.help = [{ id: 'state', title: 'Sobre el estado de tu cuenta', body }];
  }
  if (homeCookie(request, 'help-fixture') === 'empty') portal.help = [];
  if (homeCookie(request, 'help-fixture') === 'markup') portal.help = [{ id: 'untrusted', title: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>' }];
  return notificationPortal(request, candidate, portal);
}
function homeProgress(request,id) {
  if(homeCookie(request,'home-progress')==='unavailable') return null;
  const progress=progressFor(request,id);
  const rows=progress.chapters.filter(row=>row.watched_seconds>0||row.manual_completed_at||row.playback_completed_at).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  const unfinished=rows.find(row=>!row.manual_completed_at&&!row.playback_completed_at);
  const number=unfinished?unfinished.chapter_id-1255:[1,2,3].find(n=>!rows.some(row=>row.chapter_id===1255+n&&(row.manual_completed_at||row.playback_completed_at)));
  return {...progress,started:rows.length>0,last_activity_at:rows[0]?.updated_at??null,resume_chapter_number:rows.length&&!progress.completed?number:null};
}

const profile = {
  id: "00000000-0000-0000-0000-000000000301",
  rewards_id: "RWD-e2e",
  curp: "ABCD123456HMNLRS09",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  phone: "5551234567",
  postal_code: "01010",
  state: "CDMX",
  city: "Ciudad de Mexico",
  customer_status: "PENDING_VALIDATION",
  onboarding_status: "COMPLETED",
};

const eligibleProfile = {
  ...profile,
  id: "00000000-0000-0000-0000-000000000401",
  rewards_id: "RWD-eligible",
  email: "eligible@example.com",
  customer_status: "ACTIVE",
};

const inactiveProfile = {
  ...profile,
  id: "00000000-0000-0000-0000-000000000501",
  rewards_id: "RWD-inactive",
  email: "inactive@example.com",
  customer_status: "INACTIVE",
};

const attentionProfile = {
  ...profile,
  id: "00000000-0000-0000-0000-000000000601",
  rewards_id: "RWD-attention",
  email: "attention@example.com",
};

const bronzeCoupons = [
  coupon("cinepolis", "Cinépolis", "2x1", "Entretenimiento", "Beneficio en entradas participantes.", "https://cuponstar-ar.s3.amazonaws.com/public/files/uploads/assets/65b0172b3f7b3.gif"),
  coupon("benavides", "Farmacias Benavides", "10%", "Salud", "Ahorra en productos participantes."),
];

const validation = {
  validation_id: "00000000-0000-0000-0000-000000000302",
  customer_id: profile.id,
  status: "PENDING",
  registered_at: "2026-07-09T23:30:00Z",
  next_checkpoint: "H24",
  next_checkpoint_at: "2026-07-10T23:30:00Z",
  last_checked_at: null,
  last_check_outcome: null,
  validated_at: null,
  product_evidence: null,
};

const eligibleValidation = {
  ...validation,
  validation_id: "00000000-0000-0000-0000-000000000402",
  customer_id: eligibleProfile.id,
  status: "VALIDATED",
  next_checkpoint: null,
  next_checkpoint_at: null,
  last_checked_at: "2026-07-14T12:00:00Z",
  last_check_outcome: "MATCH_VALIDATED",
  validated_at: "2026-07-14T12:00:00Z",
  product_evidence: {
    provider: "SISCA",
    product_type: "AFORE",
    status: "ACTIVE",
    source_id: "sisca-validation:00000000-0000-0000-0000-000000000402",
    validated_at: "2026-07-14T12:00:00Z",
  },
};

const inactiveValidation = {
  ...validation,
  validation_id: "00000000-0000-0000-0000-000000000502",
  customer_id: inactiveProfile.id,
  status: "CANCELLED",
  next_checkpoint: null,
  next_checkpoint_at: null,
  last_checked_at: "2026-07-14T12:00:00Z",
  last_check_outcome: "MATCH_NOT_ELIGIBLE",
};

const attentionValidation = {
  ...validation,
  validation_id: "00000000-0000-0000-0000-000000000602",
  customer_id: attentionProfile.id,
  status: "REQUIRES_ATTENTION",
  next_checkpoint: null,
  next_checkpoint_at: null,
  last_checked_at: "2026-07-14T12:00:00Z",
  last_check_outcome: "TECHNICAL_FAILURE",
};

const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
  const method = request.method ?? "GET";

  if (method === "GET" && path === "/__health") {
    return json(response, 200, { status: "ok" });
  }

  if (method === "POST" && path === "/api/v1/auth/register") {
    const payload = await readJson(request);
    if (payload.email === "duplicate@example.com") {
      return siteError(response, 409, "duplicate_email", "Email already registered");
    }
    return json(response, 201, {
      customer: profile,
      validation_id: validation.validation_id,
      validation_status: validation.status,
      registered_at: validation.registered_at,
    });
  }

  if (method === "POST" && path === "/api/v1/auth/login") {
    const payload = await readJson(request);
    const loginProfile = [profile, eligibleProfile, inactiveProfile, attentionProfile]
      .find((candidate) => candidate.email === payload.email);
    if (!loginProfile || payload.password !== "correct-horse-7") {
      return siteError(response, 401, "invalid_credentials", "Invalid credentials");
    }
    const sessionCookie = sessionCookieFor(loginProfile);
    response.setHeader(
      "set-cookie",
      `${sessionCookie}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`,
    );
    return json(response, 200, {
      customer: loginProfile,
      expires_at: "2026-07-16T23:30:00Z",
    });
  }

  if (method === "POST" && path === "/api/v1/auth/logout") {
    response.setHeader(
      "set-cookie",
      "carobra_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    );
    response.writeHead(204);
    return response.end();
  }

  if (method === "GET" && path === "/api/v1/me") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, authenticated)
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (method === "GET" && path === "/api/v1/me/validation-status") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, validationFor(authenticated))
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (method === "GET" && path === "/api/v1/rewards/customer-context") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, {
          customer: authenticated,
          validation: { status: validationFor(authenticated).status },
          portal: request.headers.cookie?.includes('products-failure=true') ? null : homePortal(request,authenticated),
        })
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  const progressMatch=path.match(/^\/api\/v1\/rewards\/courses\/(1256|1500)\/progress$/);
  if(progressMatch && ['GET','POST'].includes(method)) {
    const authenticated=authenticatedProfile(request);
    if(!authenticated) return siteError(response,401,'unauthenticated','Authentication required');
    if(authenticated!==eligibleProfile) return siteError(response,403,'course_locked','Locked');
    if(request.headers.cookie?.includes('progress-failure=true')) return siteError(response,503,'progress_unavailable','Unavailable');
    const courseId=Number(progressMatch[1]);
    if(method==='POST') {
      const input=await readJson(request);
      const data=progressFor(request,courseId);
      const old=data.chapters.find(c=>c.chapter_id===input.chapter_id);
      const ranges=[...(old?.played_ranges??[]),...input.ranges].sort((a,b)=>a[0]-b[0]);
      const merged=[];
      for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
      const seconds=merged.reduce((sum,[a,b])=>sum+b-a,0);
      const row={course_id:courseId,chapter_id:input.chapter_id,played_ranges:merged,duration_seconds:600,watched_seconds:seconds,
        manual_completed_at:old?.manual_completed_at??(input.manual?new Date().toISOString():null),
        playback_completed_at:old?.playback_completed_at??(seconds>=480?new Date().toISOString():null),updated_at:new Date().toISOString()};
      videoProgress.set(progressKey(request,courseId),[...data.chapters.filter(c=>c.chapter_id!==input.chapter_id),row]);
    }
    return json(response,200,progressFor(request,courseId));
  }
  if (method === 'GET' && path.startsWith('/api/v1/rewards/courses')) {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) return siteError(response, 401, 'unauthenticated', 'Authentication is required');
    if (request.headers.cookie?.includes('courses-failure=true')) return siteError(response,503,'courses_unavailable','Unavailable');
    const accessible = authenticated === eligibleProfile && !['BLOCKED','INACTIVE'].includes(homeCookie(request,'home-state'));
    const gold = accessible && request.headers.cookie?.includes('courses-level=GOLD');
    const first = {id:1256,title:'Gestión Financiera Personal',space:'cursos',content_type:'video',category:'Finanzas',minimum_level:'BRONZE',summary:'Organiza tus finanzas y construye hábitos de ahorro.',image_url:'https://i.vimeocdn.com/video/1726147607-d_640x360',chapter_count:3,duration_seconds:1800,accessible};
    const second = {...first,id:226,title:'Cómo Potenciar tus Conocimientos de Inglés',category:'Inglés',minimum_level:'SILVER',summary:'Mejora tu inglés.',image_url:null,chapter_count:1,duration_seconds:900,accessible:Boolean(gold)};
    const emotional = {...first,id:273,title:'Inteligencia Emocional',category:'Bienestar',minimum_level:'GOLD',chapter_count:1,accessible:Boolean(gold)};
    const wellness = {...first,id:1500,title:'Rutina de relajación cervical',space:'bienestar',category:'Meditación'};
    const article = {...wellness,id:61,title:'7 ejercicios para realizar con pelota medicinal',content_type:'text',category:'Entrenamiento',chapter_count:1,duration_seconds:null};
    if (path === '/api/v1/rewards/courses') {
      const mode=homeCookie(request,'home-learning');
      return json(response,200,{status:mode==='disabled'?'DISABLED':'AVAILABLE',progress_available:homeCookie(request,'home-progress')!=='unavailable',current_level:accessible?(gold?'GOLD':'BRONZE'):null,reviewed_at:'2026-09-24',courses:['empty','disabled'].includes(mode)?[]:[first,second,emotional,wellness,article].map(c=>({...c,progress:c.content_type==='text'?null:homeProgress(request,c.id)}))});
    }
    const selected=[first,second,emotional,wellness,article].find(c=>path===`/api/v1/rewards/courses/${c.id}` && c.accessible);
    if (!selected) return siteError(response,403,'course_locked','Locked');
    if (!accessible) return siteError(response,403,'course_locked','Locked');
    if(selected.content_type==='text') return json(response,200,{course:selected,progress:null,chapters:[{id:61,number:1,title:selected.title,summary:'Ideas para entrenar a tu ritmo.',content:'Primera recomendación.\n\nSegunda recomendación. <script>alert("unsafe")</script>',duration_seconds:null,presenters:['Equipo de Bienestar'],embed_url:null}]});
    return json(response,200,{course:selected,progress:progressFor(request,selected.id),chapters:[1,2,3].map(n=>({id:1255+n,number:n,title:`Gestión Financiera Personal Cap ${n}`,summary:`Resumen del capítulo ${n}`,content:`Contenido del capítulo ${n}`,duration_seconds:600,presenters:['Docente de prueba'],embed_url:`https://player.vimeo.com/video/${123450+n}?dnt=1`}))});
  }

  if (method === "GET" && path === "/api/v1/rewards/coupons") {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) return siteError(response, 401, "unauthenticated", "Authentication is required");
    const mode=homeCookie(request,'home-coupons');
    if(mode==='failure') return siteError(response,503,'partner_unavailable','Unavailable');
    if(mode==='slow') await new Promise(resolve=>setTimeout(resolve,6500));
    const active = authenticated === eligibleProfile && !['BLOCKED','INACTIVE'].includes(homeCookie(request,'home-state'));
    const accountUnavailable = authenticated === inactiveProfile || authenticated === attentionProfile;
    return json(response, 200, {
      current_level: active ? "BRONZE" : null,
      access_state: mode==='disabled' ? 'FEATURE_DISABLED' : active ? "AVAILABLE" : accountUnavailable ? "ACCOUNT_UNAVAILABLE" : "NO_LEVEL",
      affiliate_state: active ? "ACTIVE" : "DISABLED",
      items: ['disabled','empty'].includes(mode) ? [] : active ? mode==='many'?Array.from({length:6},(_,i)=>({...bronzeCoupons[0],id:`example-${i}`})):bronzeCoupons : [],
      refreshed_at: active ? "2026-09-10T12:00:00.000Z" : null,
      page: 1,
      page_size: 50,
      total: active ? bronzeCoupons.length : 0,
      next_page: null,
    });
  }

  if (method === "GET" && path === "/api/v1/rewards/coupons/affiliate-status") {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) return siteError(response, 401, "unauthenticated", "Authentication is required");
    return json(response, 200, {
      state: authenticated === eligibleProfile ? "ACTIVE" : "DISABLED",
      can_request_codes: authenticated === eligibleProfile,
      retry_scheduled: false,
    });
  }

  if (method === "GET" && path === "/api/v1/rewards/coupons/history") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, { items: [] })
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  const codeMatch = path.match(/^\/api\/v1\/rewards\/coupons\/([^/]+)\/code$/);
  if (method === "POST" && codeMatch) {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) return siteError(response, 401, "unauthenticated", "Authentication is required");
    const payload = await readJson(request);
    return json(response, 200, {
      request_id: payload.request_id,
      status: "ISSUED",
      code: `CAROBRA-${codeMatch[1].toUpperCase()}`,
      instructions: "Presenta este código antes de pagar.",
      receipt_id: `receipt-${codeMatch[1]}`,
    });
  }

  const branchesMatch = path.match(/^\/api\/v1\/rewards\/coupons\/([^/]+)\/branches$/);
  if (method === "GET" && branchesMatch) {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) return siteError(response, 401, "unauthenticated", "Authentication is required");
    const item = bronzeCoupons.find((candidate) => candidate.id === branchesMatch[1]);
    return json(response, 200, { items: item?.id === "cinepolis"
      ? [{ id: "branch-1", name: "Cinépolis Universidad", address: "Av. Universidad 1000", city: "Ciudad de México", state: "CDMX", latitude: 19.368, longitude: -99.166 }]
      : [] });
  }

  const detailMatch = path.match(/^\/api\/v1\/rewards\/coupons\/([^/]+)$/);
  if (method === "GET" && detailMatch) {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) return siteError(response, 401, "unauthenticated", "Authentication is required");
    const item = bronzeCoupons.find((candidate) => candidate.id === detailMatch[1]);
    return json(response, 200, {
      access_state: item ? "AVAILABLE" : "COUPON_UNAVAILABLE",
      affiliate_state: "ACTIVE",
      item: item ? {
        ...item,
        description: item.id === "cinepolis"
          ? "Disfruta descuentos exclusivos en entradas participantes y dulcería.\nImportante: presenta el código antes de finalizar tu compra.\nNo acumulable con otras promociones. Válido hasta 31/12/2027."
          : item.shortDescription,
        usageInstructions: "1- Solicita tu código.\n2- Elige tus entradas participantes.\n3- Presenta el código antes de pagar.",
        legalTerms: "Sujeto a disponibilidad y establecimientos participantes. No acumulable con otras promociones.",
        brandDescription: "Cinépolis crea experiencias de entretenimiento para toda la familia.",
        branches: [{ id: "branch-1", name: "Cinépolis Universidad", address: "Av. Universidad 1000", city: "Ciudad de México", state: "CDMX", latitude: 19.368, longitude: -99.166 }],
      } : null,
    });
  }

  if (method === "GET" && path === "/api/v1/rewards/journey") {
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, journeyFor(authenticated))
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (method === "GET" && path === "/api/v1/rewards/portal") {
    if (request.headers.cookie?.includes('products-failure=true')) return siteError(response, 503, 'portal_unavailable', 'Unavailable');
    const authenticated = authenticatedProfile(request);
    return authenticated
      ? json(response, 200, activityPortal(request, authenticated))
      : siteError(response, 401, "unauthenticated", "Authentication is required");
  }

  if (method === 'POST' && path === '/api/v1/rewards/portal/notifications/read') {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) return siteError(response, 401, 'unauthenticated', 'Authentication required');
    const payload = await readJson(request);
    const key = notificationKey(request, authenticated);
    const read = notificationReads.get(key) ?? new Set();
    read.add(payload.notification_id);
    notificationReads.set(key, read);
    return json(response, 200, { updated: true });
  }

  if (authenticatedProfile(request) && (
    (method === "PATCH" && path === "/api/v1/rewards/portal/preferences")
    || (method === "POST" && path.startsWith("/api/v1/rewards/portal/"))
  )) {
    const payload = await readJson(request);
    return json(response, 200, path.endsWith("preferences") ? { ...payload, updated_at: "2026-08-24T12:00:00.000Z" } : { updated: true });
  }

  if (method === "GET" && path === "/api/v1/rewards/activities") {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) {
      return siteError(response, 401, "unauthenticated", "Authentication is required");
    }
    return json(response, 200, activityDetailsFor(authenticated));
  }

  if (method === "GET" && path === "/api/v1/rewards/movements") {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) {
      return siteError(response, 401, "unauthenticated", "Authentication is required");
    }
    return json(response, 200, movementDetailsFor(authenticated));
  }

  if (method === "GET" && path === "/api/v1/rewards/referrals") {
    const authenticated = authenticatedProfile(request);
    if (!authenticated) {
      return siteError(response, 401, "unauthenticated", "Authentication is required");
    }
    if (authenticated !== eligibleProfile) {
      return siteError(response, 403, "rewards_not_eligible", "Rewards account is not eligible");
    }
    return json(response, 200, {
      invite_path: "/registro?ref=abcdefghijklmnopqrstuvwxyzABCDEFG_123456789",
      accepting_referrals: true,
      unavailable_reason: null,
      totals: { invited: 1, registered: 1, active: 0, earned_points: "3000" },
      referrals: [{
        position: 1,
        status: "REGISTERED",
        registration_completed: true,
        six_month_completed: false,
        twelve_month_completed: false,
      }],
    });
  }

  return siteError(response, 404, "not_found", "Route not found");
});

server.listen(port, host);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

function authenticatedProfile(request) {
  const cookies = request.headers.cookie?.split(";").map((value) => value.trim()) ?? [];
  if (cookies.includes(eligibleSessionCookie)) return eligibleProfile;
  if (cookies.includes(pendingSessionCookie)) return profile;
  if (cookies.includes(inactiveSessionCookie)) return inactiveProfile;
  if (cookies.includes(attentionSessionCookie)) return attentionProfile;
  return null;
}

function sessionCookieFor(candidate) {
  if (candidate === eligibleProfile) return eligibleSessionCookie;
  if (candidate === inactiveProfile) return inactiveSessionCookie;
  if (candidate === attentionProfile) return attentionSessionCookie;
  return pendingSessionCookie;
}

function validationFor(candidate) {
  if (candidate === eligibleProfile) return eligibleValidation;
  if (candidate === inactiveProfile) return inactiveValidation;
  if (candidate === attentionProfile) return attentionValidation;
  return validation;
}

function journeyFor(candidate) {
  const active = candidate === eligibleProfile;
  return {
    customer_id: candidate.id,
    journey: {
      state: active ? "ACTIVE" : "INVITED",
      current_level: active ? "BRONZE" : null,
      validation_status: validationFor(candidate).status,
      registered_at: validationFor(candidate).registered_at,
    },
    redemption: {
      eligible: false,
      reason: active ? "REDEMPTION_DISABLED" : "NO_ACTIVE_PRODUCT",
    },
    points: {
      available: active ? "150" : "45",
      reserved: "0",
      next_expiration_at: "2028-01-09T23:30:00.000Z",
    },
    progress: {
      target_level: active ? "SILVER" : "BRONZE",
      rule_available: false,
      remaining_active_products: null,
      remaining_registration_months: null,
      remaining_qualifying_activities: null,
    },
    products: active ? [{
      product_type: "AFORE",
      status: "ACTIVE",
      activated_at: "2026-07-14T12:00:00.000Z",
    }] : [],
    recent_movements: active ? [{
      code: "V2_INITIAL_PRODUCT_ACTIVE",
      points_delta: "105",
      occurred_at: "2026-07-14T12:00:00.000Z",
    }, {
      code: "V2_INVITED_REGISTRATION",
      points_delta: "45",
      occurred_at: "2026-07-09T23:30:00.000Z",
    }] : [{
      code: "V2_INVITED_REGISTRATION",
      points_delta: "45",
      occurred_at: "2026-07-09T23:30:00.000Z",
    }],
    modules: {
      benefits_enabled: false,
      coupons_enabled: active,
      expiry_policy_approved: false,
      ave_enabled: false,
      referrals_enabled: false,
      renewals_enabled: false,
    },
  };
}

function portalFor(candidate) {
  const active = candidate === eligibleProfile;
  const validationStatus = validationFor(candidate).status;
  const timeline = [{ id: `registration:${candidate.id}`, type: "REGISTRATION", title: "Registro completado", description: "Tu cuenta Carobra Rewards quedó creada.", occurred_at: "2026-07-09T23:30:00.000Z" }];
  if (active) timeline.unshift({ id: `product:${candidate.id}`, type: "PRODUCT", title: "Producto confirmado", description: "Tu producto está activo en Carobra Rewards.", occurred_at: "2026-07-14T12:00:00.000Z" });
  const actions = active ? [{ id: "00000000-0000-4000-8000-000000000701", type: "QUESTIONNAIRE", title: "Completa tu perfil financiero", description: "Responde un cuestionario breve para conocerte mejor.", status: "PENDING", href: "#actividad", approved_points: "20" }] : [];
  return {
    customer_id: candidate.id,
    journey: journeyFor(candidate),
    activity_details: activityDetailsFor(candidate),
    movement_details: movementDetailsFor(candidate),
    primary_action: actions[0] ?? invitedPrimaryAction(validationStatus),
    actions,
    timeline,
    notifications: { unread_count: timeline.length, items: timeline.map((item) => ({ id: `notice:${item.id}`, title: item.title, message: item.description, occurred_at: item.occurred_at, read: false, href: null })) },
    products: active ? [{ id: "00000000-0000-4000-8000-000000000702", product_type: "AFORE", label: "Cuenta de retiro", status: "ACTIVE", status_label: "Activo", activated_at: "2026-07-14T12:00:00.000Z", ended_at: null, level_impact: "Se considera en tu nivel Bronce.", guidance: "Tu producto está confirmado y forma parte de tu relación con Carobra." }] : [],
    preferences: { activity_updates: true, learning_updates: true, product_updates: true, updated_at: null },
    learning: { items: active ? [{ id: "00000000-0000-4000-8000-000000000703", course_code: "RETIRO_101", title: "Fundamentos para tu retiro", description: "Aprende los conceptos esenciales para tomar decisiones informadas.", category: "Retiro", status: "IN_PROGRESS", progress: 40, qualifies: false, assigned_at: "2026-08-01T12:00:00.000Z", last_activity_at: "2026-08-20T12:00:00.000Z" }] : [] },
    documents: { requests: [] },
    help: [{ id: "levels", title: "¿Cómo se calcula mi nivel?", body: "Tu nivel considera productos activos, permanencia y actividades aprobadas; gastar puntos no lo reduce." }],
  };
}

// Presentation-only fixtures for Activity. All data stays in this isolated mock.
function activityPortal(request, candidate) {
  const portal = portalFor(candidate);
  const mode = homeCookie(request, 'activity-fixture');
  if (mode === 'empty') {
    portal.timeline = [];
    portal.movement_details.movements = [];
  }
  if (mode === 'review') {
    const entry = portal.timeline[0];
    portal.timeline.unshift(...[3, 2, 1, 0].map((day) => ({
      ...entry, id: `review:${day}`, occurred_at: `2026-07-${18 + day}T12:00:00.000Z`,
    })));
  }
  if (mode === 'mixed') {
    portal.journey.points.available = '950';
    portal.movement_details.movements = [
      { code: 'REFUND', entry_type: 'REFUND', points_delta: '100', occurred_at: '2026-07-16T12:00:00.000Z' },
      { code: 'CONSUMPTION', entry_type: 'CONSUMPTION', points_delta: '-50', occurred_at: '2026-07-15T12:00:00.000Z' },
      { code: 'ADJUSTMENT', entry_type: 'ADJUSTMENT', points_delta: '0', occurred_at: '2026-07-14T12:00:00.000Z' },
    ];
    portal.timeline[0].title = 'Confirmación del producto asociado a tu cuenta de Carobra Rewards';
    portal.timeline[0].description = 'La confirmación conserva su fecha y detalle original, incluso cuando el contenido ocupa varias líneas en una pantalla pequeña.';
  }
  if (homeCookie(request, 'activity-expiry') === 'approved') portal.journey.modules.expiry_policy_approved = true;
  return portal;
}

function invitedPrimaryAction(validationStatus) {
  if (validationStatus === "CANCELLED") {
    return { id: "journey:invited", type: "STATUS", title: "Sigues siendo miembro Invitado", description: "Tu cuenta Rewards permanece disponible. Te avisaremos cuando podamos confirmar un producto activo.", status: "INFORMATIONAL", href: null, approved_points: null };
  }
  if (validationStatus === "REQUIRES_ATTENTION") {
    return { id: "journey:review", type: "SUPPORT", title: "Tu cuenta sigue como Invitado", description: "Estamos revisando la información de tu producto. Puedes seguir consultando Rewards y contactar a soporte si necesitas ayuda.", status: "INFORMATIONAL", href: "mailto:soporte@carobra.mx", approved_points: null };
  }
  return { id: "journey:validation", type: "STATUS", title: "Estamos validando tu producto", description: "No necesitas hacer nada adicional. Te avisaremos cuando Carobra termine la revisión.", status: "INFORMATIONAL", href: null, approved_points: null };
}

function activityDetailsFor(candidate) {
  return {
    activities: candidate === eligibleProfile
      ? [{
          activity_type: "PROFILE_UPDATED",
          qualifies: true,
          occurred_at: "2026-07-15T12:00:00.000Z",
        }]
      : [],
  };
}

function movementDetailsFor(candidate) {
  return {
    movements: journeyFor(candidate).recent_movements.map((movement) => ({
      ...movement,
      entry_type: "ISSUANCE",
    })),
  };
}

function coupon(id, name, discount, category, shortDescription, imageUrl = null) {
  return {
    id,
    name,
    discount,
    shortDescription,
    expirationAt: "2027-12-31T23:59:59.000Z",
    imageUrl,
    heroImageUrl: imageUrl ? `${imageUrl}?variant=original` : null,
    logoImageUrl: imageUrl,
    bannerImageUrl: null,
    category,
    channels: ["ONLINE", "ONSITE"],
    minimumLevel: "BRONZE",
    displayOrder: ["cinepolis", "benavides"].indexOf(id) + 1,
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function siteError(response, status, code, message) {
  return json(response, status, { error: { code, message } });
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}
