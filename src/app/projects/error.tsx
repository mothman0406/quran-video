"use client";
import RouteError from "@/components/route-error";
export default function ProjectsError(props: { error: Error & { digest?: string }; retry: () => void }) { return <RouteError {...props} destination="/projects" />; }
