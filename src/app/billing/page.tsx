import type { Metadata } from "next";
import BillingPlans from "@/components/billing-plans";
import DashboardShell from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Billing & plans | Quran AutoCaption" };

export default function BillingPage() {
  return <DashboardShell current="billing"><BillingPlans /></DashboardShell>;
}
