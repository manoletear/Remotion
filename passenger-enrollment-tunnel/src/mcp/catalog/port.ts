/**
 * Catalog port — the closed-domain "dictionary" between what a human says and
 * the exact code SNRHos demands.
 *
 * Two jobs:
 *  - `options()` feeds the UI dropdowns. Because the dropdown stores the CODE
 *    (not the label), a guest can never submit free text that SNRHos rejects.
 *  - `resolve()` is the fallback translator for data that did NOT come from a
 *    dropdown (e.g. free text carried by the PMS reservation): it maps a
 *    synonym/loose string to the official code, or null when it can't.
 */

export type CatalogDomain = "MOTIVO_VIAJE" | "MEDIO_TRANSPORTE";

export interface CatalogOption {
  /** Official SNRHos code stored in the payload. */
  code: string;
  /** Human label shown in the dropdown. */
  label: string;
}

export interface CatalogPort {
  /** Options for a closed domain, to render a dropdown bound to codes. */
  options(domain: CatalogDomain): Promise<CatalogOption[]>;

  /**
   * Map a loose/free-text value (from the PMS, an agency, etc.) to the official
   * code. Returns null when no confident match exists, so the desk can prompt.
   */
  resolve(domain: CatalogDomain, freeText: string): Promise<string | null>;
}
