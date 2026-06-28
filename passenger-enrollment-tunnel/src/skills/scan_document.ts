import type { Ficha } from "../domain/ficha/index.js";
import { assertTransition } from "../domain/ficha/index.js";
import type {
  DatosEstadisticos,
  Dependiente,
  Hospede,
} from "../domain/hospede/index.js";
import type { ExtractedIdentity, ScanRequest } from "../mcp/ocr/port.js";
import { DocumentType, EventType, FichaStatus } from "../shared/enums.js";
import { DocumentScanError, NotFoundError } from "../shared/errors.js";
import { auditEvent } from "./audit_event.js";
import type { TunnelContext } from "./context.js";

export interface ScanDocumentInput {
  fichaId: string;
  scan: ScanRequest;
  estadisticos: DatosEstadisticos;
  dependientes?: Dependiente[];
}

/** Route to the MRZ or OCR reader by document family. */
function isMrzDocument(type: DocumentType | undefined): boolean {
  return type === DocumentType.PASSPORT || type === DocumentType.MERCOSUR_ID;
}

/** Assemble the SNRHos `Hospede` from an extracted identity + form fields. */
function toHospede(
  identity: ExtractedIdentity,
  estadisticos: DatosEstadisticos,
  dependientes: Dependiente[],
): Hospede {
  return {
    pessoa: {
      nombreCompleto: identity.nombreCompleto,
      cpf: identity.cpf,
      fechaNacimiento: identity.fechaNacimiento,
      sexo: identity.sexo,
      nacionalidad: identity.paisEmision,
      documento: {
        tipo: identity.tipo,
        numero: identity.numeroDocumento,
        paisEmision: identity.paisEmision,
        fechaVencimiento: identity.fechaVencimiento,
      },
      identidadVerificadaGovBr: identity.fromGovBr,
    },
    estadisticos,
    dependientes,
  };
}

/**
 * Scan Document skill — the OCR/MRZ capture step.
 *
 * Reads the identity document, rejects low-confidence scans, assembles the
 * `Hospede` payload with the complementary statistical fields, and moves the
 * ficha DRAFT -> CAPTURED. The actual SNRHos transmission is deferred to the
 * sync engine, mirroring how the Access Layer separates capture from device I/O.
 */
export async function scanDocument(
  ctx: TunnelContext,
  input: ScanDocumentInput,
): Promise<Ficha> {
  const ficha = await ctx.store.fichas.get(input.fichaId);
  if (!ficha) throw new NotFoundError("Ficha", input.fichaId);

  const identity = isMrzDocument(input.scan.hint)
    ? await ctx.ocr.readMrz(input.scan)
    : await ctx.ocr.readBrazilianId(input.scan);

  if (identity.confidence < ctx.ocrConfidenceThreshold) {
    throw new DocumentScanError("Lectura de documento de baja confianza", {
      confidence: identity.confidence,
      threshold: ctx.ocrConfidenceThreshold,
    });
  }

  await auditEvent(ctx, {
    tipo: EventType.DOCUMENT_SCANNED,
    fichaId: ficha.id,
    payload: { tipo: identity.tipo, fromGovBr: identity.fromGovBr },
  });

  const hospede = toHospede(
    identity,
    input.estadisticos,
    input.dependientes ?? [],
  );

  assertTransition(ficha.estado, FichaStatus.CAPTURED);
  const captured = await ctx.store.fichas.update(ficha.id, {
    estado: FichaStatus.CAPTURED,
    hospede,
  });

  await auditEvent(ctx, {
    tipo: EventType.FICHA_CAPTURED,
    fichaId: ficha.id,
    payload: { reservaLocalizador: ficha.reservaLocalizador },
  });

  return captured;
}
