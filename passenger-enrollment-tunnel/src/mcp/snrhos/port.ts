import type { Hospede } from "../../domain/hospede/index.js";
import type { SnrhosResultStatus } from "../../shared/enums.js";

/**
 * SNRHos port — the federal FNRH Digital REST API (Serpro), V2 (v2.3/v2.4).
 *
 * This is the FNRH analogue of the Access Layer's `SmsGatewayPort`: the single
 * seam between business logic and the external system. A concrete adapter wraps
 * an HTTPS client authenticated with the hotel's Cadastur API-Key/Token (TLS
 * 1.3). Skills and orchestration depend only on this interface, so the fake and
 * the real client are interchangeable.
 */

export interface SnrhosResult {
  status: SnrhosResultStatus;
  /** HTTP status code, when a response was received. */
  httpStatus?: number;
  /** SNRHos protocol id, present on SUCCESS. */
  protocolo?: string;
  /** Raw response body, for the audit trail and debugging. */
  rawBody?: string;
}

/** Payload for a check-in registration (mirror of `Checkin.cs` + reserva). */
export interface CheckinPayload {
  reservaLocalizador: string;
  hospede: Hospede;
  /** ISO-8601 entry timestamp. */
  checkinAt: string;
}

export interface SnrhosPort {
  /** Register a check-in (full validated FNRH payload). */
  registerCheckin(payload: CheckinPayload): Promise<SnrhosResult>;

  /** Register a check-out, closing the ficha in the federal base. */
  registerCheckout(
    reservaLocalizador: string,
    checkoutAt: string,
  ): Promise<SnrhosResult>;

  /** Register a no-show for the reservation's associated guests. */
  registerNoShow(reservaLocalizador: string): Promise<SnrhosResult>;

  /** Cancel a projected hospedaje, preserving regulatory coherence. */
  cancelReserva(reservaLocalizador: string): Promise<SnrhosResult>;
}
