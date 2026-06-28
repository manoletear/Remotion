import { SnrhosResultStatus } from "../../shared/enums.js";
import type {
  CheckinPayload,
  SnrhosPort,
  SnrhosResult,
} from "./port.js";

/**
 * In-memory fake of the SNRHos API for tests and the demo.
 *
 * Scriptable outages: push results onto `nextResults` to simulate 5xx/timeout
 * (so the sync engine exercises its contingency path) before falling back to
 * SUCCESS. Mirrors the role of the Access Layer's `FakeSmsGateway`.
 */
export class FakeSnrhos implements SnrhosPort {
  /** Queue of forced results; when empty, calls succeed. */
  readonly nextResults: SnrhosResult[] = [];
  /** Every registered check-in, keyed by reservation locator. */
  readonly registered = new Map<string, CheckinPayload>();

  private take(reservaLocalizador: string): SnrhosResult {
    const forced = this.nextResults.shift();
    if (forced) return forced;
    return {
      status: SnrhosResultStatus.SUCCESS,
      httpStatus: 200,
      protocolo: `FNRH-${reservaLocalizador}-${this.registered.size + 1}`,
    };
  }

  async registerCheckin(payload: CheckinPayload): Promise<SnrhosResult> {
    const result = this.take(payload.reservaLocalizador);
    if (result.status === SnrhosResultStatus.SUCCESS) {
      // Idempotent: re-draining the same locator does not duplicate.
      this.registered.set(payload.reservaLocalizador, payload);
    }
    return result;
  }

  async registerCheckout(
    reservaLocalizador: string,
    _checkoutAt: string,
  ): Promise<SnrhosResult> {
    return this.take(reservaLocalizador);
  }

  async registerNoShow(reservaLocalizador: string): Promise<SnrhosResult> {
    return this.take(reservaLocalizador);
  }

  async cancelReserva(reservaLocalizador: string): Promise<SnrhosResult> {
    return this.take(reservaLocalizador);
  }
}
