"use client";

import { useActionState, useEffect, useRef } from "react";

import { defaultDateParts } from "@/lib/format";
import { SubmitButton } from "./components/submit-button";
import { crearInvitacionAction, type ActionState } from "./actions";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = ["00", "15", "30", "45"];

function TimeFields({ prefix, offsetHours }: { prefix: "inicio" | "fin"; offsetHours: number }) {
  const d = defaultDateParts(offsetHours);
  return (
    <div className="field">
      <label htmlFor={`${prefix}_fecha`}>{prefix === "inicio" ? "Desde" : "Hasta"}</label>
      <div className="time-row">
        <input
          id={`${prefix}_fecha`}
          name={`${prefix}_fecha`}
          type="date"
          defaultValue={d.fecha}
          required
        />
        <select name={`${prefix}_hora`} defaultValue={d.hora} aria-label="Hora">
          {HOURS.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <select name={`${prefix}_min`} defaultValue={d.min} aria-label="Minutos">
          {MINUTES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select name={`${prefix}_ampm`} defaultValue={d.ampm} aria-label="AM/PM">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

const initialState: ActionState = {};

/** "Nueva invitación" form: client component so it can show a busy state
 *  while pending and an inline error on failure (FR-002, FR-003). */
export function NewInvitationForm() {
  const [state, formAction] = useActionState(crearInvitacionAction, initialState);
  const tzOffsetRef = useRef<HTMLInputElement>(null);

  // Set on mount, not via defaultValue: SSR runs in the server's timezone
  // (UTC on Vercel), so a value baked into the initial render would be wrong
  // until hydration — and defaultValue on an uncontrolled input doesn't
  // update on hydration anyway.
  useEffect(() => {
    if (tzOffsetRef.current) tzOffsetRef.current.value = String(new Date().getTimezoneOffset());
  }, []);

  return (
    <form action={formAction}>
      <input ref={tzOffsetRef} type="hidden" name="tz_offset_minutes" defaultValue="0" />
      <div className="grid2">
        <div className="field">
          <label htmlFor="nombre">Visitante</label>
          <input id="nombre" name="nombre" placeholder="Nombre" required />
        </div>
        <div className="field">
          <label htmlFor="telefono">Teléfono</label>
          <input id="telefono" name="telefono" placeholder="+56 9 1111 2222" required />
        </div>
        <TimeFields prefix="inicio" offsetHours={0} />
        <TimeFields prefix="fin" offsetHours={2} />
      </div>
      {state.error && <p className="field-error">{state.error}</p>}
      <div className="btn-circle-row">
        <SubmitButton className="btn-circle large success">Crear invitación</SubmitButton>
      </div>
    </form>
  );
}
