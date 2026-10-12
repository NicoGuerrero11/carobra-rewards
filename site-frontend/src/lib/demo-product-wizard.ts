export interface DemoField {
  name: string;
  label: string;
  type: 'text' | 'select' | 'date';
  options?: string[];
  optional?: boolean;
  hint?: string;
  placeholder?: string;
  inputmode?: 'text' | 'numeric';
  maxLength?: number;
}
export interface DemoStep {
  title: string;
  description: string;
  fields: DemoField[];
  note?: string;
  contact?: boolean;
}
export type DemoAnswers = Record<string, string>;
export interface DemoIssue { field: string; message: string }
export type DemoValidator = (answers: DemoAnswers, step: number) => DemoIssue | null;

// Pure transition model shared by demonstration forms. There is no request or persistence state.
export function createDemoWizard(stepCount: number) {
  let step = 0;
  let complete = false;
  let lastAdvance = -Infinity;
  return {
    get step() { return step; },
    get complete() { return complete; },
    canAdvance(now: number) { return !complete && now - lastAdvance >= 400; },
    advance(valid: boolean, now: number) {
      if (!valid || complete || now - lastAdvance < 400) return false;
      if (step === stepCount) complete = true;
      else step++;
      lastAdvance = now;
      return true;
    },
    back() { if (step > 0 && !complete) step--; },
    reset() { step = 0; complete = false; lastAdvance = -Infinity; },
  };
}

export function validateDemoFields(steps: DemoStep[], answers: DemoAnswers, step: number): DemoIssue | null {
  for (const field of steps[step]?.fields ?? []) {
    const value = answers[field.name]?.trim() ?? '';
    if (!value && !field.optional) return { field: field.name, message: `Completa «${field.label}» para continuar.` };
    if (!value) continue;
    if (value.length > (field.maxLength ?? 80)) return { field: field.name, message: `Revisa «${field.label}»: el texto es demasiado largo.` };
    if (field.options && !field.options.includes(value)) return { field: field.name, message: `Elige una opción de «${field.label}».` };
    if (field.type === 'date') {
      const date = new Date(`${value}T12:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        return { field: field.name, message: 'Ingresa una fecha válida.' };
      }
    }
  }
  if (steps[step]?.contact && answers.consent !== 'on') return { field: 'consent', message: 'Confirma que deseas continuar esta prueba con datos ficticios.' };
  return null;
}
