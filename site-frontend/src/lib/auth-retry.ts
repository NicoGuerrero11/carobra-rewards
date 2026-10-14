/** Never display upstream response text or account-specific throttling details. */
export function authRetrySeconds(response: Response): number {
  const raw = response.headers.get("retry-after") ?? "";
  const value = /^\d{1,3}$/.test(raw) ? Number(raw) : 1;
  return Math.min(300, Math.max(1, value));
}

export function authRetryMessage(seconds: number): string {
  return `Hay demasiados intentos en este momento. Espera ${seconds} segundos y vuelve a intentarlo.`;
}
