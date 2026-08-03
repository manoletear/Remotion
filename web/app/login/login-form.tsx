"use client";

import { useActionState } from "react";

import { SubmitButton } from "../components/submit-button";
import { sendMagicLinkAction, type LoginState } from "./actions";

export function LoginForm({ initialError, next }: { initialError?: string; next?: string }) {
  const [state, formAction] = useActionState(sendMagicLinkAction, {
    error: initialError,
  });

  if (state.sent) {
    return (
      <div className="panel auth-panel">
        <h1>Revisa tu correo</h1>
        <p className="muted">
          Te enviamos un enlace de acceso. Haz clic en él para ingresar.
        </p>
      </div>
    );
  }

  return (
    <div className="panel auth-panel">
      <h1>Acceso al portal</h1>
      <p className="muted">Ingresa tu correo y te enviaremos un enlace para entrar.</p>
      <form action={formAction}>
        {next && <input type="hidden" name="next" value={next} />}
        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="tu@correo.com"
            required
            autoFocus
          />
        </div>
        {state.error && <p className="field-error">{state.error}</p>}
        <SubmitButton>Enviar enlace de acceso</SubmitButton>
      </form>
    </div>
  );
}
