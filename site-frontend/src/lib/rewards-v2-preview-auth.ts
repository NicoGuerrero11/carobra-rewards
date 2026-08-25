import { timingSafeEqual } from "node:crypto";

export function isRewardsV2PreviewAuthorized(input: {
  authorizationHeader: string | null;
  expectedUsername: string | undefined;
  expectedPassword: string | undefined;
}): boolean {
  if (!input.expectedUsername || !input.expectedPassword) return false;
  if (!input.authorizationHeader?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(input.authorizationHeader.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  return safeEqual(decoded.slice(0, separator), input.expectedUsername)
    && safeEqual(decoded.slice(separator + 1), input.expectedPassword);
}

function safeEqual(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return receivedBuffer.byteLength === expectedBuffer.byteLength
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}
