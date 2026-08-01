import Link from "next/link";

/** Top-right settings/profile entry point (SafeCard visual reference) — links to /perfil. */
export function SettingsGear() {
  return (
    <Link href="/perfil" className="settings-gear" aria-label="Perfil del hogar">
      ⚙
    </Link>
  );
}
