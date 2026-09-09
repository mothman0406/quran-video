"use client";

import dynamic from "next/dynamic";

const EditorClient = dynamic(() => import("@/components/editor-client"), {
  ssr: false,
});

export default function EditorPage() {
  return <EditorClient />;
}
