import { createDemoWizard, type DemoStep, type DemoAnswers, type DemoValidator } from './demo-product-wizard';

export function initDemoProductWizard(id: string, steps: DemoStep[], validate: DemoValidator) {
  const dialog = document.querySelector<HTMLDialogElement>(`[data-demo-wizard="${id}"]`);
  if (!dialog) return;
  const form = dialog.querySelector<HTMLFormElement>('form')!;
  const sections = [...form.querySelectorAll<HTMLElement>('[data-step]')];
  const inputs = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')];
  const summary = form.querySelector<HTMLElement>('[data-summary]')!;
  const success = dialog.querySelector<HTMLElement>('[data-success]')!;
  const error = form.querySelector<HTMLElement>('[data-error]')!;
  const progress = dialog.querySelector<HTMLOListElement>('.pw-progress')!;
  const back = form.querySelector<HTMLButtonElement>('[data-back]')!;
  const next = form.querySelector<HTMLButtonElement>('[data-next]')!;
  const state = createDemoWizard(steps.length);
  let opener: HTMLElement | null = null;

  function clearErrors() {
    error.hidden = true;
    inputs.forEach(input => input.removeAttribute('aria-invalid'));
    form.querySelectorAll<HTMLElement>('[data-error-for]').forEach(item => { item.hidden = true; item.textContent = ''; });
  }
  function readAnswers(): DemoAnswers {
    // Disabled steps still live only in this DOM; never send or serialize outside this page.
    return Object.fromEntries(inputs.map(input => [input.name, input instanceof HTMLInputElement && input.type === 'checkbox' ? (input.checked ? 'on' : '') : input.value.trim()]));
  }
  function render(focus = true) {
    clearErrors();
    form.hidden = state.complete;
    progress.hidden = state.complete;
    success.hidden = !state.complete;
    sections.forEach((section, i) => {
      section.hidden = i !== state.step;
      section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(input => { input.disabled = i !== state.step; });
    });
    summary.hidden = state.step !== steps.length;
    back.hidden = state.step === 0;
    next.textContent = state.step === steps.length ? 'Terminar simulación' : state.step === steps.length - 1 ? 'Ver resumen →' : 'Continuar →';
    progress.querySelectorAll('li').forEach((item, i) => {
      if (i === state.step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      item.classList.toggle('is-complete', i < state.step);
    });
    if (focus) (state.complete ? success : state.step === steps.length ? summary : sections[state.step]).querySelector<HTMLElement>('h3')?.focus();
    dialog!.scrollTop = 0;
  }
  function reset() {
    form.reset(); state.reset();
    form.querySelector('[data-answers]')!.replaceChildren();
    render(false);
  }
  function showSummary(answers: DemoAnswers) {
    const list = summary.querySelector('[data-answers]')!;
    list.replaceChildren();
    const rows = steps.flatMap(step => step.fields).map(field => [field.label, answers[field.name] || 'Sin definir']);
    rows.push(['Contacto de prueba', 'Alex Ejemplo · alex@example.test']);
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      row.append(dt, dd); list.append(row);
    }
  }
  document.querySelectorAll<HTMLButtonElement>(`[data-open-demo="${id}"]`).forEach(button => button.addEventListener('click', () => {
    if (dialog.open) return;
    opener = button; dialog.showModal(); document.body.classList.add('pw-modal-open'); render();
  }));
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-finish]')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-discard]')!.addEventListener('click', () => { reset(); dialog.close(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('pw-modal-open');
    if (state.complete) reset();
    opener?.focus();
  });
  back.addEventListener('click', () => { state.back(); render(); });
  form.addEventListener('input', clearErrors);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const now = performance.now();
    if (!state.canAdvance(now)) return;
    const answers = readAnswers();
    const issue = state.step === steps.length
      ? steps.map((_, i) => ({ issue: validate(answers, i), step: i })).find(result => result.issue)
      : { issue: validate(answers, state.step), step: state.step };
    if (issue?.issue) {
      while (state.step > issue.step) state.back();
      render(false);
      const { field, message } = issue.issue;
      error.textContent = message; error.hidden = false;
      const fieldError = form.querySelector<HTMLElement>(`[data-error-for="${field}"]`);
      if (fieldError) { fieldError.textContent = message; fieldError.hidden = false; }
      const input = inputs.find(item => item.name === field);
      input?.setAttribute('aria-invalid', 'true'); input?.focus();
      return;
    }
    if (state.advance(true, now)) {
      if (state.step === steps.length && !state.complete) showSummary(answers);
      render();
    }
  });
  window.addEventListener('pagehide', () => { reset(); if (dialog.open) dialog.close(); document.body.classList.remove('pw-modal-open'); });
  render(false);
}
