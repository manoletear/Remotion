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

/**
 * Residential address (domicílio). Required by the FNRH and present on NO travel
 * document — it must come from the form, the PMS reservation, or Gov.br.
 */
export interface Domicilio {
  /** ISO-3166 country of residence. */
  pais: string;
  estado: string;
  municipio: string;
  /** Street/line; optional for foreign addresses with looser structure. */
  logradouro: string | null;
  /** Brazilian postal code (CEP) when applicable. */
  cep: string | null;
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
  /** Profession/occupation — required by the FNRH, not on any document. */
  profesion: string | null;
  /** Residential address — required, not on any document. */
  domicilio: Domicilio | null;
  email: string | null;
  telefono: string | null;
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
