import type { Metadata } from "next";
import QuickCreateBoundary from "@/components/quick-create-boundary";

export const metadata: Metadata = { title: "Create captions | Quran AutoCaption" };

export default function CreatePage() {
  return <QuickCreateBoundary />;
}
