import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Twilio webhook request per Twilio's documented `RequestValidator`
 * algorithm: HMAC-SHA1(authToken, url + sorted "key"+"value" pairs), base64,
 * compared to the `X-Twilio-Signature` header.
 *
 * No `twilio` SDK dependency — matches `TwilioSmsGateway`'s existing
 * fetch-only convention (`src/mcp/sms_gateway/twilio.ts`).
 *
 * @param url exact callback URL Twilio was configured to POST to, including
 *   protocol/host/path/query string.
 * @param params the parsed `application/x-www-form-urlencoded` body fields.
 * @param signature the `X-Twilio-Signature` header value (may be null/absent).
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string,
): boolean {
  if (!signature) return false;

  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
