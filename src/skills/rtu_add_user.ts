import type { Device } from "../domain/device/index.js";
import type { SmsSendResult } from "../mcp/sms_gateway/port.js";
import { ValidationError } from "../shared/errors.js";
import { isValidE164 } from "../shared/utils.js";
import { buildAddUserCommand } from "./rtu/protocol.js";
import type { SkillContext } from "./context.js";

export interface RtuAddUserInput {
  device: Device;
  /** E.164 number to authorize. */
  phone: string;
  /** Phonebook slot to write. */
  slot: number;
}

/** Outcome of dispatching an RTU command (confirmation is reconciled later). */
export interface RtuDispatch {
  /** The exact SMS command sent to the device. */
  command: string;
  /** Provider-reported status at send time. */
  sendStatus: SmsSendResult["status"];
}

/**
 * RTU Add User skill — **dispatch only**. Composes the RTU5024 add command and
 * sends it via the SMS Gateway (fire-and-forget). The device's confirmation
 * arrives as a separate inbound SMS and is reconciled by the lifecycle, so this
 * does not wait for a reply.
 */
export async function rtuAddUser(
  ctx: SkillContext,
  input: RtuAddUserInput,
): Promise<RtuDispatch> {
  if (!isValidE164(input.phone)) {
    throw new ValidationError("Invalid phone for RTU add", [
      `not E.164: ${input.phone}`,
    ]);
  }
  const command = buildAddUserCommand(input.device.password, input.slot, input.phone);
  const res = await ctx.sms.send(input.device.numero_sim, command);
  return { command, sendStatus: res.status };
}
