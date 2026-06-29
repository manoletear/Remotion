import type { DataStore } from "../mcp/store/port.js";
import type { SnrhosPort } from "../mcp/snrhos/port.js";
import type { OcrPort } from "../mcp/ocr/port.js";
import type { CatalogPort } from "../mcp/catalog/port.js";

/** Retry policy for SNRHos synchronization, injectable for fast tests. */
export interface SyncRetryPolicy {
  maxAttempts: number;
  baseMs: number;
}

/**
 * Dependency bundle injected into every skill — the FNRH analogue of the Access
 * Layer's `SkillContext`. Skills are plain functions over this context plus
 * typed input: no globals, trivially testable with the in-memory/fake adapters.
 */
export interface TunnelContext {
  store: DataStore;
  snrhos: SnrhosPort;
  ocr: OcrPort;
  catalog: CatalogPort;
  /** Injectable clock for deterministic tests. */
  now: () => Date;
  /** SNRHos retry policy. Defaults to the production 2s/4s/8s/16s backoff. */
  syncRetry: SyncRetryPolicy;
  /** Minimum OCR confidence to accept a scan; below it the scan is rejected. */
  ocrConfidenceThreshold: number;
}

/** Build a context, defaulting the clock, retry policy and OCR threshold. */
export function makeContext(
  deps: Pick<TunnelContext, "store" | "snrhos" | "ocr" | "catalog"> &
    Partial<
      Pick<TunnelContext, "now" | "syncRetry" | "ocrConfidenceThreshold">
    >,
): TunnelContext {
  return {
    now: () => new Date(),
    syncRetry: { maxAttempts: 4, baseMs: 2000 },
    ocrConfidenceThreshold: 0.85,
    ...deps,
  };
}
