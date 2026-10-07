import { contributionTotals, planSteps, type PlanKind } from './skandia-questionnaire';

const money = (value: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);

export function initSkandiaQuestionnaires() {
  document.querySelectorAll<HTMLDialogElement>('dialog[data-plan]').forEach(dialog => {
    const kind = dialog.dataset.plan as PlanKind;
    const steps = planSteps[kind];
    const form = dialog.querySelector<HTMLFormElement>('form')!;
    const sections = [...dialog.querySelectorAll<HTMLElement>('[data-step]')];
    const summary = dialog.querySelector<HTMLElement>('[data-summary]')!;
    const success = dialog.querySelector<HTMLElement>('[data-success]')!;
    const error = dialog.querySelector<HTMLElement>('[data-error]')!;
    const next = dialog.querySelector<HTMLButtonElement>('[data-next]')!;
    const back = dialog.querySelector<HTMLButtonElement>('[data-back]')!;
    const progress = dialog.querySelector<HTMLOListElement>('.sk-progress')!;
    let step = 0;
    let completed = false;
    let opener: HTMLElement | null = null;
    let lastTransition = 0;
    const values = () => Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const showError = (message: string) => { error.textContent = message; error.hidden = false; };
    function render(focus = true) {
      error.hidden = true;
      sections.forEach((section, index) => {
        section.hidden = index !== step;
        section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(input => { input.disabled = index !== step; });
      });
      summary.hidden = step !== steps.length;
      back.hidden = step === 0;
      next.textContent = step === steps.length ? 'Confirmar simulación' : step === steps.length - 1 ? 'Ver resumen →' : 'Continuar →';
      progress.querySelectorAll('li').forEach((item, index) => {
        if (index === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
        item.classList.toggle('is-complete', index < step);
      });
      if (focus) (step === steps.length ? summary : sections[step]).querySelector<HTMLElement>('h3')?.focus();
      dialog.scrollTop = 0;
    }
    // Read disabled fields deliberately only for the in-memory summary.
    function allValues() {
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(input => { input.disabled = false; });
      const answers = values();
      render(false);
      return answers;
    }
    function buildSummary() {
      const answers = allValues();
      const totals = contributionTotals(answers, kind);
      if (!totals) { showError('El importe calculado es demasiado grande. Vuelve y usa montos y plazos menores para este ejercicio.'); return false; }
      dialog.querySelector('[data-total-label]')!.textContent = kind === 'ahorro' ? 'Tus aportaciones durante el horizonte elegido' : 'Tus aportaciones en un año';
      dialog.querySelector('[data-total]')!.textContent = money(totals.total ?? totals.annual);
      dialog.querySelector('[data-total-detail]')!.textContent = `${money(Number(answers.contribution))} · ${answers.frequency.toLowerCase()}${kind === 'ahorro' ? ` · ${answers.years} años` : ''}`;
      const list = dialog.querySelector('[data-answers]')!;
      list.replaceChildren();
      const rows = steps.flatMap(item => item.questions).map(question => [question.label, answers[question.id] || 'Sin definir']);
      rows.push(['Contacto de prueba', 'Alex Ejemplo · alex@example.test']);
      for (const [label, value] of rows) {
        const row = document.createElement('div');
        const term = document.createElement('dt'); term.textContent = label;
        const definition = document.createElement('dd'); definition.textContent = value;
        row.append(term, definition); list.append(row);
      }
      return true;
    }
    function reset() {
      form.reset(); step = 0; completed = false; lastTransition = 0;
      form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
      form.hidden = false; progress.hidden = false; success.hidden = true;
      dialog.querySelector('[data-answers]')!.replaceChildren();
      dialog.querySelectorAll('[data-total], [data-total-label], [data-total-detail]').forEach(item => { item.textContent = ''; });
      render(false);
    }
    function close() { dialog.close(); }
    document.querySelectorAll<HTMLButtonElement>(`[data-open-plan="${kind}"]`).forEach(button => button.addEventListener('click', () => {
      opener = button; dialog.showModal(); document.body.classList.add('sk-modal-open'); render();
    }));
    dialog.addEventListener('close', () => {
      document.body.classList.remove('sk-modal-open');
      if (completed) reset();
      opener?.focus();
    });
    dialog.querySelector('[data-close]')!.addEventListener('click', close);
    dialog.querySelector('[data-finish]')!.addEventListener('click', close);
    dialog.querySelector('[data-discard]')!.addEventListener('click', () => { reset(); close(); });
    back.addEventListener('click', () => { if (step > 0) { step--; render(); } });
    form.addEventListener('input', event => {
      const input = event.target as HTMLInputElement;
      input.removeAttribute('aria-invalid');
      error.hidden = true;
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (completed || performance.now() - lastTransition < 400) return;
      const invalid = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not(:disabled), select:not(:disabled)')].find(input => !input.checkValidity());
      if (invalid) {
        invalid.setAttribute('aria-invalid', 'true');
        showError(invalid.type === 'checkbox' ? 'Confirma que deseas continuar con datos ficticios.' : 'Completa este campo. Para cantidades usa un número positivo; años y edad deben ser enteros.');
        invalid.focus(); return;
      }
      if (step === steps.length) {
        completed = true; form.hidden = true; progress.hidden = true; success.hidden = false;
        success.querySelector<HTMLElement>('h3')!.focus(); dialog.scrollTop = 0; return;
      }
      if (step === steps.length - 1 && !buildSummary()) return;
      step++; lastTransition = performance.now(); render();
    });
    window.addEventListener('pagehide', () => {
      reset();
      if (dialog.open) dialog.close();
      document.body.classList.remove('sk-modal-open');
    });
    render(false);
  });
  const initialPlan = new URLSearchParams(window.location.search).get('plan');
  if (initialPlan === 'ahorro' || initialPlan === 'retiro') {
    document.querySelector<HTMLButtonElement>(`[data-open-plan="${initialPlan}"]`)?.click();
  }
}
