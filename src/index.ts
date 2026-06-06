/**
 * Access Layer for GSM Gate Openers — public entry point.
 *
 * Architecture: PERMISO -> ACTIVACION -> DISPOSITIVO. The RTU is an
 * infrastructure adapter behind the SMS Gateway. See ARCHITECTURE.md.
 */
export * from "./shared/index.js";
export * from "./domain/index.js";
export * from "./mcp/index.js";
export * from "./skills/index.js";
export * from "./orchestration/index.js";
