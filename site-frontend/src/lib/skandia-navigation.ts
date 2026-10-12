// Only an allowlisted product intent survives authentication. Never carry questionnaire answers.
export function skandiaDestination(candidate: string | null): string | null {
  if (candidate === '/cliente/productos/skandia') return candidate;
  if (candidate === '/cliente/productos/skandia?plan=ahorro' || candidate === '/cliente/productos/skandia?plan=retiro') return candidate;
  return null;
}
