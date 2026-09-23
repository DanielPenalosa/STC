"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/** Small copy-to-clipboard button for coordinates/refs. */
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center text-slate-400 hover:text-primary-600"
      title="Copy"
    >
      <Icon name={copied ? "check-circle" : "clipboard"} size="sm" />
    </button>
  );
}
