import type { Ficha, NewFicha } from "../../domain/ficha/index.js";
import type { EventType, FichaStatus } from "../../shared/enums.js";

/**
 * Persistence port. Skills depend on these interfaces, never on a concrete
 * client — same contract as the Access Layer's `DataStore`. The real adapter is
 * Supabase/Postgres with RLS + AES-256-at-rest for the contingency rows.
 */

/** Mutable fields of a ficha after creation (immutables excluded by design). */
export type FichaPatch = Partial<
  Pick<
    Ficha,
    | "estado"
    | "hospede"
    | "protocoloSnrhos"
    | "checkinAt"
    | "checkoutAt"
    | "syncAttempts"
    | "lastError"
  >
>;

export interface FichaRepository {
  create(input: NewFicha): Promise<Ficha>;
  get(id: string): Promise<Ficha | null>;
  update(id: string, patch: FichaPatch): Promise<Ficha>;
  /** Fichas currently in a status (for the contingency drain to act on). */
  listByStatus(status: FichaStatus): Promise<Ficha[]>;
  /** Every ficha (for reporting / Excel export). */
  listAll(): Promise<Ficha[]>;
}

/** An immutable audit record — basis of the LGPD log. */
export interface AuditEvent {
  id: string;
  tipo: EventType;
  fichaId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface EventRepository {
  append(
    input: Omit<AuditEvent, "id" | "createdAt">,
  ): Promise<AuditEvent>;
  listForFicha(fichaId: string): Promise<AuditEvent[]>;
}

export interface DataStore {
  fichas: FichaRepository;
  events: EventRepository;
}
