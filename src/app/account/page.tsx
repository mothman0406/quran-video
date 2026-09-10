import type { Metadata } from "next";
import AccountSettings from "@/components/account-settings";

export const metadata: Metadata = { title: "Account settings | Quran Video" };
export default function AccountPage() { return <AccountSettings />; }
