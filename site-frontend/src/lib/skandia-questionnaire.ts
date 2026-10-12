// Presentation-only questionnaire. No eligibility, tax or product rules are inferred here.
export type PlanKind = 'ahorro' | 'retiro';
export interface Question {
  id: string;
  label: string;
  type: 'select' | 'number';
  options?: string[];
  optional?: boolean;
  hint?: string;
  integer?: boolean;
}
export interface PlanStep { title: string; description: string; questions: Question[]; contact?: boolean }
const contribution: Question = { id: 'contribution', label: '¿Cuánto te gustaría aportar? (MXN)', type: 'number', hint: 'Usa un monto ficticio. No representa un mínimo comercial.' };
const frequency: Question = { id: 'frequency', label: 'Frecuencia de aportación', type: 'select', options: ['Mensual', 'Trimestral', 'Anual'] };
const tax: Question = { id: 'tax', label: '¿Presentas declaración anual?', type: 'select', options: ['Sí', 'No', 'No estoy seguro/a'], hint: 'No calculamos deducciones ni beneficios fiscales.' };
const expectation: Question = { id: 'expectation', label: '¿Qué esperas de tu plan?', type: 'select', options: ['Crear el hábito de ahorrar', 'Construir un patrimonio', 'Complementar mi retiro', 'Entender mis opciones'] };
const start: Question = { id: 'start', label: '¿Cuándo te gustaría comenzar?', type: 'select', options: ['Este mes', 'En los próximos meses', 'Solo estoy explorando'] };
export const planSteps: Record<PlanKind, PlanStep[]> = {
  ahorro: [
    { title: 'Tu meta', description: 'Todo empieza con algo que quieres lograr.', questions: [
      { id: 'goal', label: '¿Para qué quieres ahorrar?', type: 'select', options: ['Un proyecto personal', 'Educación', 'Mi patrimonio', 'Mi retiro', 'Otra meta'] },
      { id: 'target', label: 'Monto de tu meta (MXN)', type: 'number', optional: true, hint: 'Opcional. Puedes definirlo más adelante.' },
      { id: 'years', label: '¿En cuántos años te gustaría lograrlo?', type: 'number', integer: true, hint: 'Horizonte ilustrativo; los plazos disponibles están pendientes de validar.' },
    ] },
    { title: 'A tu ritmo', description: 'Explora una aportación que tenga sentido para ti.', questions: [contribution, frequency, expectation] },
    { title: 'Tu contexto', description: 'Solo lo necesario para explorar. Sin documentos ni datos fiscales.', questions: [tax, start] },
    { title: 'Contacto de prueba', description: 'Revisa cómo se vería el último paso con una identidad ficticia.', questions: [], contact: true },
  ],
  retiro: [
    { title: 'Tu próxima etapa', description: 'Imagina cuándo te gustaría empezar esa etapa.', questions: [
      { id: 'retirementAge', label: '¿A qué edad te gustaría retirarte?', type: 'number', integer: true, hint: 'Es una preferencia ilustrativa, no una validación de elegibilidad.' },
      contribution, frequency,
    ] },
    { title: 'Lo que buscas', description: 'Cuéntanos qué te gustaría explorar.', questions: [tax, expectation, start] },
    { title: 'Contacto de prueba', description: 'Revisa el contacto ficticio antes de ver tu resumen.', questions: [], contact: true },
  ],
};

export const frequencyPerYear: Record<string, number> = { Mensual: 12, Trimestral: 4, Anual: 1 };
export function contributionTotals(values: Record<string, string>, kind: PlanKind) {
  const annual = Number(values.contribution) * (frequencyPerYear[values.frequency] ?? 0);
  const total = kind === 'ahorro' ? annual * Number(values.years) : null;
  if (!Number.isFinite(annual) || annual <= 0 || annual > Number.MAX_SAFE_INTEGER / 100
    || (total !== null && (!Number.isFinite(total) || total <= 0 || total > Number.MAX_SAFE_INTEGER / 100))) return null;
  return { annual, total };
}
