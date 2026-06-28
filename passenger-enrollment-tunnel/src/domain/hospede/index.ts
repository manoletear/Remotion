import type {
  DocumentType,
  MedioTransporte,
  MotivoViaje,
} from "../../shared/enums.js";

/**
 * Guest-identity domain types — the TypeScript mirror of the official SNRHos
 * `.cs` classes referenced in the spec (`Pessoa.cs`, `Documento.cs`,
 * `Hospede.cs`, ...). No I/O here; these are plain data shapes.
 */

/** Mirror of `Documento.cs` / `PessoaDocumento.cs`. */
export interface Documento {
  tipo: DocumentType;
  /** Document number as read by OCR/MRZ. */
  numero: string;
  /** ISO-3166 issuing country (e.g. "BRA", "ARG"). */
  paisEmision: string;
  /** ISO-8601 expiry date, when present on the document. */
  fechaVencimiento: string | null;
}

/** Mirror of `Pessoa.cs` — identity + sociodemographic classification. */
export interface Pessoa {
  nombreCompleto: string;
  /** CPF for nationals; null for foreigners identified by passport. */
  cpf: string | null;
  fechaNacimiento: string;
  sexo: "M" | "F" | "X";
  nacionalidad: string;
  documento: Documento;
  /**
   * True when the identity came from Gov.br at "Oro" level: name and CPF are
   * state-validated and must be locked against edition to deter fraud.
   */
  identidadVerificadaGovBr: boolean;
}

/** A minor/dependent traveling with the holder (LGPD Art. 14). */
export interface Dependiente {
  nombreCompleto: string;
  fechaNacimiento: string;
  /** CPF of the minor, when it exists. */
  cpf: string | null;
  /** CPF of the legal guardian this dependent is associated to. */
  cpfTutor: string;
}

/** The FNRH statistical fields not present on identity documents. */
export interface DatosEstadisticos {
  motivoViaje: MotivoViaje;
  medioTransporte: MedioTransporte;
  /** Origin city/address (autocompleted from CEP in the UI). */
  puntoOrigen: string;
  /** Next destination (validated against the geopolitical catalog). */
  proximoDestino: string;
}

/** Mirror of `Hospede.cs` — the guest as occupying a unit. */
export interface Hospede {
  pessoa: Pessoa;
  estadisticos: DatosEstadisticos;
  dependientes: Dependiente[];
}
