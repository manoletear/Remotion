import type { Ficha } from "../domain/ficha/index.js";
import type { Hospede } from "../domain/hospede/index.js";
import { EventType, MedioTransporte, MotivoViaje } from "../shared/enums.js";
import { NotFoundError, ValidationError } from "../shared/errors.js";
import { auditEvent } from "./audit_event.js";
import type { TunnelContext } from "./context.js";

/**
 * The corrections a human makes on the "confirm and correct" screen. Every field
 * is optional: the machine pre-filled everything, the guest only touches what's
 * wrong. `motivo`/`transporte` accept either an official code (picked from a
 * dropdown) or loose text (e.g. carried by the PMS) — the latter is run through
 * the catalog `resolve()` so it still lands on a valid code.
 */
export interface ConfirmFichaInput {
  fichaId: string;
  /** Corrected legal name (e.g. restoring accents lost by the MRZ). */
  nombreCompleto?: string;
  /** Profession captured/edited in the form. */
  profesion?: string;
  /** Motivo de viaje: official code OR free text to resolve. */
  motivo?: string;
  /** Medio de transporte: official code OR free text to resolve. */
  transporte?: string;
}

const MOTIVO_CODES = new Set<string>(Object.values(MotivoViaje));
const TRANSPORTE_CODES = new Set<string>(Object.values(MedioTransporte));

/**
 * Confirm & Correct skill — the human-in-the-loop step that makes automatic
 * name reconciliation unnecessary: the guest is the authority on their own name,
 * and the dropdowns guarantee valid catalog codes. Applies the corrections to
 * the captured Hospede and records the confirmation in the audit trail.
 */
export async function confirmFicha(
  ctx: TunnelContext,
  input: ConfirmFichaInput,
): Promise<Ficha> {
  const ficha = await ctx.store.fichas.get(input.fichaId);
  if (!ficha) throw new NotFoundError("Ficha", input.fichaId);
  if (!ficha.hospede) {
    throw new ValidationError("Ficha sin captura previa", ["hospede"]);
  }

  const hospede: Hospede = structuredClone(ficha.hospede);
  const changed: string[] = [];

  if (input.nombreCompleto && input.nombreCompleto !== hospede.pessoa.nombreCompleto) {
    // Gov.br "Oro" names are state-validated and locked against edition.
    if (hospede.pessoa.identidadVerificadaGovBr) {
      throw new ValidationError("Nombre verificado por Gov.br no editable", [
        "nombreCompleto",
      ]);
    }
    hospede.pessoa.nombreCompleto = input.nombreCompleto.trim();
    changed.push("nombreCompleto");
  }

  if (input.profesion && input.profesion !== hospede.pessoa.profesion) {
    hospede.pessoa.profesion = input.profesion.trim();
    changed.push("profesion");
  }

  if (input.motivo !== undefined) {
    const code = MOTIVO_CODES.has(input.motivo)
      ? input.motivo
      : await ctx.catalog.resolve("MOTIVO_VIAJE", input.motivo);
    if (!code) {
      throw new ValidationError("Motivo de viaje no reconocido", ["motivo"]);
    }
    hospede.estadisticos.motivoViaje = code as MotivoViaje;
    changed.push("motivoViaje");
  }

  if (input.transporte !== undefined) {
    const code = TRANSPORTE_CODES.has(input.transporte)
      ? input.transporte
      : await ctx.catalog.resolve("MEDIO_TRANSPORTE", input.transporte);
    if (!code) {
      throw new ValidationError("Medio de transporte no reconocido", ["transporte"]);
    }
    hospede.estadisticos.medioTransporte = code as MedioTransporte;
    changed.push("medioTransporte");
  }

  const updated = await ctx.store.fichas.update(ficha.id, { hospede });
  await auditEvent(ctx, {
    tipo: EventType.FICHA_CONFIRMED,
    fichaId: ficha.id,
    payload: { changed },
  });
  return updated;
}
