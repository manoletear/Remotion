import type { Device } from "../domain/device/index.js";
import { RTU_ACK_TIMEOUT_MS } from "../shared/constants.js";
import { buildRemoveUserCommand, parseMutationReply } from "./rtu/protocol.js";
import type { RtuResult } from "./rtu/types.js";
import type { SkillContext } from "./context.js";

export interface RtuRemoveUserInput {
  device: Device;
  /** Phonebook slot to clear. */
  slot: number;
}

/**
 * RTU Remove User skill. Clears an authorized number from a phonebook slot.
 */
export async function rtuRemoveUser(
  ctx: SkillContext,
  input: RtuRemoveUserInput,
): Promise<RtuResult> {
  const command = buildRemoveUserCommand(input.device.password, input.slot);
  const reply = await ctx.sms.sendAndAwaitReply(
    input.device.numero_sim,
    command,
    RTU_ACK_TIMEOUT_MS,
  );
  return { status: parseMutationReply(reply?.body ?? null), command, rawReply: reply?.body ?? null };
}
