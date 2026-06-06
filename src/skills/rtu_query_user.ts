import type { Device } from "../domain/device/index.js";
import { RTU_ACK_TIMEOUT_MS } from "../shared/constants.js";
import { buildQueryCommand, queryReplyContains } from "./rtu/protocol.js";
import type { RtuResult } from "./rtu/types.js";
import type { SkillContext } from "./context.js";

export interface RtuQueryUserInput {
  device: Device;
  /** E.164 number whose presence we are confirming. */
  phone: string;
}

/**
 * RTU Query User skill. Asks the device for its authorized list and reports
 * whether `phone` is present (SUCCESS), absent (NOT_FOUND) or unknown (TIMEOUT).
 * Used to verify a sync actually took effect.
 */
export async function rtuQueryUser(
  ctx: SkillContext,
  input: RtuQueryUserInput,
): Promise<RtuResult> {
  const command = buildQueryCommand(input.device.password);
  const reply = await ctx.sms.sendAndAwaitReply(
    input.device.numero_sim,
    command,
    RTU_ACK_TIMEOUT_MS,
  );
  return {
    status: queryReplyContains(reply?.body ?? null, input.phone),
    command,
    rawReply: reply?.body ?? null,
  };
}
