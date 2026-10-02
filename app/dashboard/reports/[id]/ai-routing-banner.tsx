"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

/**
 * Shown in the narrow window right after submission while the AI pipeline
 * (analysis → auto-assignment → status flip to "assigned") is still running
 * in an after() task. Polls the server via router.refresh() so the citizen
 * sees the report flip to "Assigned" without a manual reload — usually
 * within a few seconds. The parent only renders this while the report is
 * still "submitted", so it unmounts the moment the assignment lands.
 */
export default function AiRoutingBanner() {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-medium text-primary-700">
      <Icon name="robot" size="md" className="shrink-0 animate-pulse" />
      <span>
        AI is analyzing this report and routing it to the responsible office —
        no admin approval needed. This usually takes a few seconds.
      </span>
    </div>
  );
}
