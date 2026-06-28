import type { DocumentType } from "../../shared/enums.js";

/**
 * OCR / MRZ port — reads identity documents into structured fields.
 *
 * A concrete adapter wraps an OCR/MRZ engine (Tesseract, PaddleOCR) or a
 * commercial SDK (Regula, Microblink); a separate adapter behind the same port
 * can resolve identity via Gov.br ("Oro" level). The spec's <5s budget is an
 * adapter concern; the port is engine-agnostic.
 */

/** Identity fields extracted from a scanned document. */
export interface ExtractedIdentity {
  tipo: DocumentType;
  nombreCompleto: string;
  numeroDocumento: string;
  /** ISO-3166 issuing country. */
  paisEmision: string;
  fechaNacimiento: string;
  sexo: "M" | "F" | "X";
  /** ISO-8601 expiry date, when present on the document. */
  fechaVencimiento: string | null;
  /** CPF when resolvable (nationals / Gov.br); null otherwise. */
  cpf: string | null;
  /** Extraction confidence in [0,1]; below threshold the scan is rejected. */
  confidence: number;
  /** True when fields came from Gov.br "Oro" (name/CPF must be locked). */
  fromGovBr: boolean;
}

/** A captured document image plus a hint about how to read it. */
export interface ScanRequest {
  /** Raw image bytes (base64 in transport); opaque to the domain. */
  image: string;
  /** Expected document type, when the channel already knows it. */
  hint?: DocumentType;
}

export interface OcrPort {
  /** Read a passport / Mercosur ID via its MRZ band. */
  readMrz(req: ScanRequest): Promise<ExtractedIdentity>;

  /** Read a Brazilian CNH / RG via OCR. */
  readBrazilianId(req: ScanRequest): Promise<ExtractedIdentity>;
}
