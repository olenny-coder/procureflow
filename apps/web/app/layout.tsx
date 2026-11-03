import type { Metadata } from "next";
import "@fontsource-variable/inter-tight";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ProcureFlow — Procurement, orchestrated",
    template: "%s · ProcureFlow",
  },
  description:
    "ProcureFlow turns purchase requests into policy-checked approvals, purchase orders and an audit trail with durable orchestration.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
