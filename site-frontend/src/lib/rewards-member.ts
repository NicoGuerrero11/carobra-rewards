/** Display only: never coerce, trim, regenerate or migrate an identity. */
export function memberNumber(value: unknown): { canonical: string; display: string } | null {
  if (typeof value !== "string" || !/^[1-9][0-9]{8}$/.test(value)) return null;
  return { canonical: value, display: value.match(/.{3}/g)!.join(" ") };
}

/** Explains the level requirement; deliberately does not authorize Bonda access. */
export function giftCardReadiness(state: string | null | undefined, level: string | null | undefined, identity: unknown) {
  if (!state || !["INVITED", "ACTIVE", "INACTIVE", "BLOCKED"].includes(state)) return "unavailable";
  if (state === "BLOCKED" || state === "INACTIVE") return "restricted";
  if (state === "INVITED") return "below_level";
  if (!["BRONZE", "SILVER", "GOLD", "PLATINUM", "TITANIUM"].includes(level ?? "")) return "unavailable";
  if (level === "BRONZE" || level === "SILVER") return "below_level";
  if (!memberNumber(identity)) return "identity_pending";
  return "level_met";
}
