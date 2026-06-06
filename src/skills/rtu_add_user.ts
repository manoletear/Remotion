import type { Device } from "../domain/device/index.js";
import { RTU_ACK_TIMEOUT_MS } from "../shared/constants.js";
import { buildAddUserCommand, parseMutationReply } from "./rtu/protocol.js";
import type { RtuResult } from "./rtu/types.js";
import type { SkillContext } from "./context.js";

export interface RtuAddUserInput {
  device: Device;
  /** E.164 number to authorize. */
  phone: string;
  /** Phonebook slot to write. */
  slot: number;
}

/**
 * RTU Add User skill. Composes the RTU5024 add command and dispatches it via the
 * SMS Gateway, then interprets the reply. Pure device interaction — no domain
 * persistence; the orchestration layer records the resulting state.
 */
export async function rtuAddUser(
  ctx: SkillContext,
  input: RtuAddUserInput,
): Promise<RtuResult> {
  const command = buildAddUserCommand(input.device.password, input.slot, input.phone);
  const reply = await ctx.sms.sendAndAwaitReply(
    input.device.numero_sim,
    command,
    RTU_ACK_TIMEOUT_MS,
  );
  return { status: parseMutationReply(reply?.body ?? null), command, rawReply: reply?.body ?? null };
}
