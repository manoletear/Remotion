import type { Ficha, NewFicha } from "../../domain/ficha/index.js";
import { FichaStatus, type EventType } from "../../shared/enums.js";
import { NotFoundError } from "../../shared/errors.js";
import { newId, nowIso } from "../../shared/utils.js";
import type {
  AuditEvent,
  DataStore,
  EventRepository,
  FichaPatch,
  FichaRepository,
} from "./port.js";

/** In-memory DataStore for tests and the demo (no DB required). */
export class InMemoryStore implements DataStore {
  readonly fichas = new InMemoryFichas();
  readonly events = new InMemoryEvents();
}

class InMemoryFichas implements FichaRepository {
  private readonly rows = new Map<string, Ficha>();

  async create(input: NewFicha): Promise<Ficha> {
    const now = nowIso();
    const ficha: Ficha = {
      id: newId(),
      reservaLocalizador: input.reservaLocalizador,
      contactoTitular: input.contactoTitular,
      estado: FichaStatus.DRAFT,
      hospede: null,
      protocoloSnrhos: null,
      checkinAt: null,
      checkoutAt: null,
      syncAttempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(ficha.id, ficha);
    return { ...ficha };
  }

  async get(id: string): Promise<Ficha | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async update(id: string, patch: FichaPatch): Promise<Ficha> {
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError("Ficha", id);
    const updated: Ficha = { ...row, ...patch, updatedAt: nowIso() };
    this.rows.set(id, updated);
    return { ...updated };
  }

  async listByStatus(status: FichaStatus): Promise<Ficha[]> {
    return [...this.rows.values()]
      .filter((f) => f.estado === status)
      .map((f) => ({ ...f }));
  }

  async listAll(): Promise<Ficha[]> {
    return [...this.rows.values()].map((f) => ({ ...f }));
  }
}

class InMemoryEvents implements EventRepository {
  private readonly rows: AuditEvent[] = [];

  async append(
    input: Omit<AuditEvent, "id" | "createdAt">,
  ): Promise<AuditEvent> {
    const event: AuditEvent = { id: newId(), createdAt: nowIso(), ...input };
    this.rows.push(event);
    return { ...event };
  }

  async listForFicha(fichaId: string): Promise<AuditEvent[]> {
    return this.rows.filter((e) => e.fichaId === fichaId).map((e) => ({ ...e }));
  }
}

export type { EventType };
