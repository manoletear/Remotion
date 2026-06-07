import { InvitationStatus } from "gsm-gate-access-layer";

/** Spanish label + badge color per invitation status. */
export function statusBadge(estado: string): { label: string; bg: string; fg: string } {
  switch (estado) {
    case InvitationStatus.CREATED:
      return { label: "Creada", bg: "#27324a", fg: "#aab8d4" };
    case InvitationStatus.PENDING_SYNC:
      return { label: "Sincronizando", bg: "#3a3158", fg: "#c4b5fd" };
    case InvitationStatus.ACTIVE:
      return { label: "Activa", bg: "#13402c", fg: "#6ee7b7" };
    case InvitationStatus.EXPIRED:
      return { label: "Expirada", bg: "#2a2f3a", fg: "#9aa6bd" };
    case InvitationStatus.REMOVING:
      return { label: "Quitando", bg: "#3a3158", fg: "#c4b5fd" };
    case InvitationStatus.REMOVED:
      return { label: "Removida", bg: "#2a2f3a", fg: "#9aa6bd" };
    case InvitationStatus.ERROR:
      return { label: "Error", bg: "#4a1f25", fg: "#fca5a5" };
    default:
      return { label: estado, bg: "#27324a", fg: "#aab8d4" };
  }
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

/** `YYYY-MM-DDTHH:mm` for a datetime-local input default, offset by `hours`. */
export function localInputValue(hours = 0): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
