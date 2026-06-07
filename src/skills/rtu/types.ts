import type { RtuResultStatus } from "../../shared/enums.js";

/** Outcome of a single RTU operation, with the raw exchange for the audit log. */
export interface RtuResult {
  status: RtuResultStatus;
  /** The exact SMS command sent to the device. */
  command: string;
  /** The device's reply body, or null on timeout. */
  rawReply: string | null;
}
