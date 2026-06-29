/**
 * Canonical enumerations for the FNRH validation tunnel.
 *
 * These values are the single source of truth and would be mirrored by the
 * Supabase schema (Postgres enums / check constraints), exactly as the Access
 * Layer mirrors `src/shared/enums.ts`.
 */

/** Lifecycle states of a Ficha (registro FNRH de un huésped). */
export enum FichaStatus {
  /** Reservation created; pre-check-in link sent, awaiting guest data. */
  DRAFT = "DRAFT",
  /** Guest data captured and validated locally (OCR/MRZ + formulario). */
  CAPTURED = "CAPTURED",
  /** Ready to be transmitted to SNRHos. */
  PENDING_SYNC = "PENDING_SYNC",
  /** Successfully registered in SNRHos (check-in legalizado). */
  REGISTERED = "REGISTERED",
  /** SNRHos unreachable (5xx/timeout): stored in the local encrypted queue. */
  CONTINGENCY = "CONTINGENCY",
  /** Check-out transmitted; ficha closed in the federal base. */
  CHECKED_OUT = "CHECKED_OUT",
  /** No-show or cancellation. */
  CANCELLED = "CANCELLED",
  /** SNRHos rejected the payload (4xx) — needs review, not blind retry. */
  ERROR = "ERROR",
}

/** Identity document types accepted by the tunnel. */
export enum DocumentType {
  /** International passport (read via MRZ). */
  PASSPORT = "PASSPORT",
  /** Mercosur identity card (read via MRZ). */
  MERCOSUR_ID = "MERCOSUR_ID",
  /** Brazilian driver's license (read via OCR). */
  CNH = "CNH",
  /** Brazilian general registry (read via OCR). */
  RG = "RG",
}

/** Source channel that captured the guest. */
export enum CaptureChannel {
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
  EMAIL = "EMAIL",
  KIOSK = "KIOSK",
}

/** Result of a call to the SNRHos REST API, as reported by the adapter. */
export enum SnrhosResultStatus {
  /** 2xx — registration accepted. */
  SUCCESS = "SUCCESS",
  /** 5xx — server-side failure; eligible for contingency + retry. */
  SERVER_ERROR = "SERVER_ERROR",
  /** Network latency / no response; eligible for contingency + retry. */
  TIMEOUT = "TIMEOUT",
  /** 4xx — payload rejected by validation; needs correction, not retry. */
  REJECTED = "REJECTED",
}

/**
 * Auditable event types. Every meaningful state change emits one via the audit
 * trail — the basis of the LGPD-mandated immutable log.
 */
export enum EventType {
  FICHA_CREATED = "FICHA_CREATED",
  FICHA_CAPTURED = "FICHA_CAPTURED",
  FICHA_CONFIRMED = "FICHA_CONFIRMED",
  FICHA_CANCELLED = "FICHA_CANCELLED",
  FICHA_CHECKED_OUT = "FICHA_CHECKED_OUT",
  FICHA_INCOMPLETE = "FICHA_INCOMPLETE",
  SNRHOS_SYNC_STARTED = "SNRHOS_SYNC_STARTED",
  SNRHOS_SYNC_SUCCESS = "SNRHOS_SYNC_SUCCESS",
  SNRHOS_SYNC_REJECTED = "SNRHOS_SYNC_REJECTED",
  CONTINGENCY_ENQUEUED = "CONTINGENCY_ENQUEUED",
  CONTINGENCY_DRAINED = "CONTINGENCY_DRAINED",
  DOCUMENT_SCANNED = "DOCUMENT_SCANNED",
}

/**
 * Where each FNRH field comes from. The crux of the tunnel: most mandatory
 * fields are NOT on the identity document and must be sourced elsewhere.
 */
export enum FieldSource {
  /** Read from the passport/ID MRZ band (ICAO 9303). */
  DOCUMENT_MRZ = "DOCUMENT_MRZ",
  /** Read by OCR from a non-MRZ document (CNH/RG). */
  DOCUMENT_OCR = "DOCUMENT_OCR",
  /** Typed by the guest in the complementary form. */
  FORM = "FORM",
  /** Carried by the PMS reservation. */
  PMS = "PMS",
  /** Imported from Gov.br at "Oro" level (state-validated). */
  GOVBR = "GOVBR",
}

/** FNRH statistical fields (dominio cerrado del catálogo SNRHos). */
export enum MotivoViaje {
  TURISMO = "TURISMO",
  NEGOCIOS = "NEGOCIOS",
  EVENTOS = "EVENTOS",
  SALUD = "SALUD",
  OTROS = "OTROS",
}

/** Means of transport (dominio cerrado del catálogo SNRHos). */
export enum MedioTransporte {
  AVION = "AVION",
  AUTOMOVIL = "AUTOMOVIL",
  AUTOBUS = "AUTOBUS",
  BARCO = "BARCO",
  OTRO = "OTRO",
}
