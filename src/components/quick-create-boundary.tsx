"use client";

import dynamic from "next/dynamic";

const QuickCreate = dynamic(() => import("@/components/quick-create"), {
  ssr: false,
});

export default function QuickCreateBoundary() {
  return <QuickCreate />;
}
