import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { BottomNav } from "./components/bottom-nav";

export const metadata: Metadata = {
  title: "Acceso — Portón",
  description: "Gestión de invitaciones de acceso para residentes",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="container">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
