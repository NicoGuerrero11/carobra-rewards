// Carry only a product/route choice through authentication, never form answers.
const destinations = new Set([
  '/cliente/productos/skandia',
  '/cliente/productos/skandia?plan=ahorro',
  '/cliente/productos/skandia?plan=retiro',
  '/cliente/productos/qualitas',
  '/cliente/productos/qualitas?plan=cotizar',
  '/cliente/productos/qualitas?plan=mejorar',
]);
export function productDestination(candidate: string | null): string | null {
  return candidate && destinations.has(candidate) ? candidate : null;
}
