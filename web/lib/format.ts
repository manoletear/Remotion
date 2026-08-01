import { InvitationStatus } from "gsm-gate-access-layer";

/**
 * Spanish label + semantic badge tone per invitation status. `tone` maps to a
 * `.badge.<tone>` class in globals.css (the design-system's semantic color
 * tokens) — no per-call inline hex.
 */
export function statusBadge(
  estado: string,
): { label: string; tone: "info" | "progress" | "success" | "neutral" | "danger" } {
  switch (estado) {
    case InvitationStatus.CREATED:
      return { label: "Creada", tone: "info" };
    case InvitationStatus.PENDING_SYNC:
      return { label: "Sincronizando", tone: "progress" };
    case InvitationStatus.ACTIVE:
      return { label: "Activa", tone: "success" };
    case InvitationStatus.EXPIRED:
      return { label: "Expirada", tone: "neutral" };
    case InvitationStatus.REMOVING:
      return { label: "Quitando", tone: "progress" };
    case InvitationStatus.REMOVED:
      return { label: "Removida", tone: "neutral" };
    case InvitationStatus.ERROR:
      return { label: "Error", tone: "danger" };
    default:
      return { label: estado, tone: "info" };
  }
}

const EVENT_LABELS: Record<string, { label: string; tone: "info" | "progress" | "success" | "neutral" | "danger" }> = {
  INVITATION_CREATED: { label: "Invitación creada", tone: "info" },
  INVITATION_UPDATED: { label: "Invitación actualizada", tone: "info" },
  INVITATION_CANCELLED: { label: "Invitación cancelada", tone: "neutral" },
  INVITATION_ACTIVATED: { label: "Invitación activada", tone: "success" },
  INVITATION_EXPIRED: { label: "Invitación expirada", tone: "neutral" },
  RTU_SYNC_STARTED: { label: "Sync RTU iniciado", tone: "progress" },
  RTU_SYNC_SUCCESS: { label: "Sync RTU exitoso", tone: "success" },
  RTU_SYNC_FAILED: { label: "Sync RTU fallido", tone: "danger" },
  RTU_SECURITY_RISK: { label: "Riesgo de seguridad RTU", tone: "danger" },
  USER_CREATED: { label: "Usuario creado", tone: "info" },
  USER_UPDATED: { label: "Usuario actualizado", tone: "info" },
  PROPERTY_CREATED: { label: "Propiedad creada", tone: "info" },
  DEVICE_REGISTERED: { label: "Dispositivo registrado", tone: "info" },
};

/** Spanish label + semantic badge tone per event type (bitácora). */
export function eventBadge(
  tipo: string,
): { label: string; tone: "info" | "progress" | "success" | "neutral" | "danger" } {
  return EVENT_LABELS[tipo] ?? { label: tipo, tone: "info" };
}

/** Compact local date-time for display. */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Default parts for the date + hour/minute/AM-PM dropdown fields, offset by `hours`. */
export function defaultDateParts(
  hours = 0,
): { fecha: string; hora: string; min: string; ampm: "AM" | "PM" } {
  const d = new Date(Date.now() + hours * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const h24 = d.getHours();
  const hora12 = h24 % 12 || 12;
  const minRounded = Math.floor(d.getMinutes() / 15) * 15;
  return {
    fecha: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: String(hora12),
    min: p(minRounded === 60 ? 0 : minRounded),
    ampm: h24 < 12 ? "AM" : "PM",
  };
}
