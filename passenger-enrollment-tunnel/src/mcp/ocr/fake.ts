import { DocumentType } from "../../shared/enums.js";
import type { ExtractedIdentity, OcrPort, ScanRequest } from "./port.js";

/**
 * Deterministic fake OCR for tests and the demo. Returns canned high-confidence
 * identities so the rest of the tunnel can be exercised without an OCR engine.
 */
export class FakeOcr implements OcrPort {
  /** Override the next extraction (e.g. to force a low-confidence scan). */
  next: Partial<ExtractedIdentity> | null = null;

  private build(base: ExtractedIdentity): ExtractedIdentity {
    const merged = { ...base, ...(this.next ?? {}) };
    this.next = null;
    return merged;
  }

  async readMrz(_req: ScanRequest): Promise<ExtractedIdentity> {
    return this.build({
      tipo: DocumentType.PASSPORT,
      nombreCompleto: "ANA MARIA SILVA",
      numeroDocumento: "FH1234567",
      paisEmision: "ARG",
      fechaNacimiento: "1990-05-12",
      sexo: "F",
      fechaVencimiento: "2031-05-12",
      cpf: null,
      confidence: 0.98,
      fromGovBr: false,
    });
  }

  async readBrazilianId(_req: ScanRequest): Promise<ExtractedIdentity> {
    return this.build({
      tipo: DocumentType.CNH,
      nombreCompleto: "JOÃO PEREIRA",
      numeroDocumento: "12345678900",
      paisEmision: "BRA",
      fechaNacimiento: "1985-03-01",
      sexo: "M",
      fechaVencimiento: "2029-03-01",
      cpf: "123.456.789-00",
      confidence: 0.95,
      fromGovBr: false,
    });
  }
}
