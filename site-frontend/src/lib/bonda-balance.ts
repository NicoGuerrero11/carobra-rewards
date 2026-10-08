import type { BondaPointsView } from './rewards-v2-contract';

const format = (value: string) => new Intl.NumberFormat('es-MX').format(BigInt(value));
const numeric = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value);

export function attachBalanceRefresh() {
  const roots = [...document.querySelectorAll<HTMLElement>('[data-bonda-status]')];
  if (!roots.length) return;
  let pending = false;
  const buttons = roots.flatMap(root => [...root.querySelectorAll<HTMLButtonElement>('[data-balance-retry]')]);
  const refresh = async () => {
    if (pending) return;
    pending = true;
    const controller = new AbortController();
    let leavingPage = false;
    const cancel = () => { leavingPage = true; controller.abort(); };
    const deadline = window.setTimeout(() => controller.abort(), 12000);
    window.addEventListener('pagehide', cancel, {once: true});
    buttons.forEach(button => button.disabled = true);
    roots.forEach(root => {
      root.setAttribute('aria-busy', 'true');
      root.querySelector('.bonda-balance__status')!.textContent = root.dataset.bondaStatus === 'STALE'
        ? 'Consultando saldo actualizado. El último saldo puede haber cambiado.'
        : 'Consultando tu saldo…';
    });
    try {
      const response = await fetch('/api/v1/rewards/bonda-balance', {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      if (response.status === 401) { window.location.assign('/login?error=unauthenticated'); return; }
      if (!response.ok) throw new Error('balance_unavailable');
      const value = await response.json() as BondaPointsView;
      if (!['DISABLED', 'FRESH', 'STALE', 'UNAVAILABLE'].includes(value.status)) throw new Error('invalid_balance');
      roots.forEach(root => renderBalance(root, value));
    } catch {
      if (leavingPage) return;
      // An unsuccessful refresh cannot leave an earlier observation labelled fresh.
      roots.forEach(root => {
        const status = root.dataset.bondaStatus;
        const known = status === 'FRESH' || status === 'STALE';
        root.dataset.bondaStatus = known ? 'STALE' : 'UNAVAILABLE';
        root.querySelector('.bonda-balance__label')!.textContent = known ? 'Último saldo consultado' : 'Puntos para gift cards';
        root.querySelector('.bonda-balance__status')!.textContent = known
          ? 'No pudimos actualizarlo. Puede haber cambiado desde la última consulta.'
          : 'No pudimos consultar tu saldo. Intenta de nuevo más tarde.';
        root.querySelector<HTMLButtonElement>('[data-balance-retry]')!.hidden = false;
      });
    } finally {
      window.clearTimeout(deadline);
      window.removeEventListener('pagehide', cancel);
      pending = false;
      buttons.forEach(button => button.disabled = false);
      roots.forEach(root => root.removeAttribute('aria-busy'));
    }
  };
  buttons.forEach(button => button.addEventListener('click', refresh));
  if (roots.some(root => ['STALE', 'UNAVAILABLE'].includes(root.dataset.bondaStatus ?? ''))) void refresh();
}

function renderBalance(root: HTMLElement, value: BondaPointsView) {
  const known = ['FRESH', 'STALE'].includes(value.status) && numeric(value.available);
  root.dataset.bondaStatus = value.status;
  root.querySelector('.bonda-balance__label')!.textContent = value.status === 'STALE' ? 'Último saldo consultado' : 'Puntos para gift cards';
  root.querySelector<HTMLElement>('.bonda-balance__amount')!.hidden = !known;
  root.querySelector('[data-balance-amount]')!.textContent = known ? format(value.available!) : '';
  root.querySelector('.bonda-balance__status')!.textContent = value.status === 'STALE'
    ? 'No pudimos actualizarlo. Puede haber cambiado desde la última consulta.'
    : value.status === 'DISABLED' ? 'Consulta tu saldo para gift cards al ingresar.'
    : known ? 'Saldo confirmado para gift cards.' : 'No pudimos consultar tu saldo. Intenta de nuevo más tarde.';
  const date = value.observed_at ? new Date(value.observed_at) : null;
  const validDate = date && Number.isFinite(date.getTime());
  root.querySelector<HTMLElement>('.bonda-balance__time')!.hidden = !known || !validDate;
  const time = root.querySelector('time')!;
  time.dateTime = validDate ? date.toISOString() : '';
  time.textContent = validDate ? new Intl.DateTimeFormat('es-MX', {dateStyle:'medium', timeStyle:'short', timeZone:'America/Mexico_City'}).format(date) : '';
  for (const [selector, amount, label] of [
    ['[data-balance-pending]', value.pending, 'puntos pendientes de acreditar.'],
    ['[data-balance-review]', value.verification_required, 'puntos en revisión. Pueden estar incluidos en el saldo consultado.'],
  ] as const) {
    const element = root.querySelector<HTMLElement>(selector)!;
    const positive = numeric(amount) && BigInt(amount) > 0n;
    element.hidden = !positive;
    element.textContent = positive ? `${format(amount)} ${label}` : '';
  }
  root.querySelector<HTMLButtonElement>('[data-balance-retry]')!.hidden = value.status === 'DISABLED' || value.status === 'FRESH';
}
