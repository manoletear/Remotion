import { FieldSource } from "../shared/enums.js";
import type { Hospede } from "./hospede/index.js";

/**
 * The FNRH field catalog with PROVENANCE — the answer to "what does the
 * government need that isn't on the document?".
 *
 * Each field declares whether it is mandatory, where it can be sourced from,
 * and whether any identity document carries it. Fields with `onDocument: false`
 * are the hard ones: they must be supplied by the form, the PMS reservation, or
 * Gov.br before the ficha can be transmitted to SNRHos.
 */
export interface FnrhFieldSpec {
  /** Stable key, dotted path into the Hospede payload. */
  key: string;
  /** Human label for desk/UX prompts. */
  label: string;
  mandatory: boolean;
  /** Acceptable provenance(s), in preference order. */
  sources: FieldSource[];
  /** True if some identity document physically carries this field. */
  onDocument: boolean;
  /** Read the value off a Hospede; null/empty means "missing". */
  get: (h: Hospede) => unknown;
}

const present = (v: unknown): boolean =>
  v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");

/**
 * The catalog. Note how the document only ever supplies identity fields; every
 * statistical/contact/address field is off-document.
 */
export const FNRH_FIELDS: readonly FnrhFieldSpec[] = [
  // --- Identity: comes from the document (MRZ/OCR) or Gov.br ---
  {
    key: "pessoa.nombreCompleto",
    label: "Nombre completo",
    mandatory: true,
    sources: [FieldSource.DOCUMENT_MRZ, FieldSource.DOCUMENT_OCR, FieldSource.GOVBR],
    onDocument: true,
    get: (h) => h.pessoa.nombreCompleto,
  },
  {
    key: "pessoa.documento.numero",
    label: "Número de documento",
    mandatory: true,
    sources: [FieldSource.DOCUMENT_MRZ, FieldSource.DOCUMENT_OCR],
    onDocument: true,
    get: (h) => h.pessoa.documento.numero,
  },
  {
    key: "pessoa.fechaNacimiento",
    label: "Fecha de nacimiento",
    mandatory: true,
    sources: [FieldSource.DOCUMENT_MRZ, FieldSource.DOCUMENT_OCR, FieldSource.GOVBR],
    onDocument: true,
    get: (h) => h.pessoa.fechaNacimiento,
  },
  {
    key: "pessoa.nacionalidad",
    label: "Nacionalidad",
    mandatory: true,
    sources: [FieldSource.DOCUMENT_MRZ, FieldSource.DOCUMENT_OCR],
    onDocument: true,
    get: (h) => h.pessoa.nacionalidad,
  },
  // --- Off-document: the hard part. On NO travel document. ---
  {
    key: "pessoa.profesion",
    label: "Profesión",
    mandatory: true,
    sources: [FieldSource.FORM, FieldSource.PMS, FieldSource.GOVBR],
    onDocument: false,
    get: (h) => h.pessoa.profesion,
  },
  {
    key: "pessoa.domicilio",
    label: "Domicilio (país/estado/municipio)",
    mandatory: true,
    sources: [FieldSource.FORM, FieldSource.PMS, FieldSource.GOVBR],
    onDocument: false,
    get: (h) =>
      h.pessoa.domicilio &&
      present(h.pessoa.domicilio.pais) &&
      present(h.pessoa.domicilio.municipio)
        ? h.pessoa.domicilio
        : null,
  },
  {
    key: "estadisticos.motivoViaje",
    label: "Motivo del viaje",
    mandatory: true,
    sources: [FieldSource.FORM, FieldSource.PMS],
    onDocument: false,
    get: (h) => h.estadisticos.motivoViaje,
  },
  {
    key: "estadisticos.medioTransporte",
    label: "Medio de transporte",
    mandatory: true,
    sources: [FieldSource.FORM, FieldSource.PMS],
    onDocument: false,
    get: (h) => h.estadisticos.medioTransporte,
  },
  {
    key: "estadisticos.puntoOrigen",
    label: "Punto de origen",
    mandatory: true,
    sources: [FieldSource.FORM, FieldSource.PMS],
    onDocument: false,
    get: (h) => h.estadisticos.puntoOrigen,
  },
  {
    key: "estadisticos.proximoDestino",
    label: "Próximo destino",
    mandatory: false,
    sources: [FieldSource.FORM, FieldSource.PMS],
    onDocument: false,
    get: (h) => h.estadisticos.proximoDestino,
  },
];

/** Mandatory fields physically absent from any identity document. */
export const OFF_DOCUMENT_MANDATORY: readonly FnrhFieldSpec[] = FNRH_FIELDS.filter(
  (f) => f.mandatory && !f.onDocument,
);

/**
 * Mandatory FNRH fields still missing on a Hospede. An empty array means the
 * payload is complete enough to transmit to SNRHos. The desk/UX uses the
 * labels to prompt only for what's actually missing.
 */
export function missingMandatoryFields(hospede: Hospede): string[] {
  return FNRH_FIELDS.filter((f) => f.mandatory && !present(f.get(hospede))).map(
    (f) => f.label,
  );
}
