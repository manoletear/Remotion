import type { Device } from "../domain/device/index.js";
import { buildRemoveUserCommand } from "./rtu/protocol.js";
import type { RtuDispatch } from "./rtu_add_user.js";
import type { SkillContext } from "./context.js";

export interface RtuRemoveUserInput {
  device: Device;
  /** Phonebook slot to clear. */
  slot: number;
}

/**
 * RTU Remove User skill — **dispatch only**. Sends the command to clear an
 * authorized number from a phonebook slot; the confirmation is reconciled later.
 */
export async function rtuRemoveUser(
  ctx: SkillContext,
  input: RtuRemoveUserInput,
): Promise<RtuDispatch> {
  const command = buildRemoveUserCommand(input.device.password, input.slot);
  const res = await ctx.sms.send(input.device.numero_sim, command);
  return { command, sendStatus: res.status };
}
