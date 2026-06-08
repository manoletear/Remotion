import { sendMagicLinkAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;

  if (params.sent) {
    return (
      <main>
        <div className="panel" style={{ maxWidth: 420, margin: "80px auto" }}>
          <h1>Revisa tu correo</h1>
          <p className="muted">
            Te enviamos un enlace de acceso. Haz clic en él para ingresar.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="panel" style={{ maxWidth: 420, margin: "80px auto" }}>
        <h1>Acceso al portal</h1>
        <p className="muted">
          Ingresa tu correo y te enviaremos un enlace para entrar.
        </p>
        <form
          action={async (formData: FormData) => {
            "use server";
            const { error } = await sendMagicLinkAction(formData);
            const { redirect } = await import("next/navigation");
            if (error) redirect(`/login?error=${encodeURIComponent(error)}`);
            else redirect("/login?sent=1");
          }}
        >
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
          {params.error && (
            <p style={{ color: "var(--red, #c00)" }}>{params.error}</p>
          )}
          <button type="submit">Enviar enlace de acceso</button>
        </form>
      </div>
    </main>
  );
}
