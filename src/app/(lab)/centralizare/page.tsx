import { CentralizarePageClient } from "@/components/lab/centralizare-page-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Centralizare — Presiometrie Lab",
  description: "Listă centralizată teste presiometrice pe proiecte.",
};

export default function CentralizarePage() {
  return <CentralizarePageClient />;
}
