export function getSiteBackendBaseUrl() {
  return process.env.SITE_BACKEND_BASE_URL
    ?? import.meta.env.SITE_BACKEND_BASE_URL
    ?? "http://127.0.0.1:3001";
}
