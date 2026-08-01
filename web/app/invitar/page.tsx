import Link from "next/link";

import { SettingsGear } from "../components/settings-gear";
import { NewInvitationForm } from "../new-invitation-form";

export default function Invitar() {
  return (
    <main>
      <div className="toolbar">
        <div>
          <p className="muted"><Link href="/">← Invitaciones enviadas</Link></p>
          <h1>Invitar</h1>
        </div>
        <SettingsGear />
      </div>

      <section className="panel">
        <NewInvitationForm />
      </section>
    </main>
  );
}
