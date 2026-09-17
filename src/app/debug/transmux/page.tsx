import { notFound } from "next/navigation";
import TransmuxClient from "./transmux-client";

export default function TransmuxDebugPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TransmuxClient />;
}
