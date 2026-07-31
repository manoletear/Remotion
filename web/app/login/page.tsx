import { LoginForm } from "./login-form";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "El enlace no es válido o expiró. Pide uno nuevo.",
  auth_failed: "No se pudo confirmar el acceso. Pide un enlace nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const initialError = params.error ? ERROR_MESSAGES[params.error] ?? params.error : undefined;

  return (
    <main>
      <LoginForm initialError={initialError} />
    </main>
  );
}
