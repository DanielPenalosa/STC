"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

/**
 * A select that applies its filter instantly on change (no Apply button).
 * Preserves all other query params; pass `clears` to reset companion
 * params (e.g. picking "All time" clears from/to).
 */
export default function AutoSubmitSelect({
  param,
  placeholder,
  options,
  icon,
  className = "",
}: {
  param: string;
  placeholder: string;
  options: { value: string; label: string }[];
  icon?: "tag" | "home" | "alert";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const current = sp.get(param) ?? "";

  function onChange(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(param, value);
    else params.delete(param);
    const s = params.toString();
    router.push(`${pathname}${s ? `?${s}` : ""}`);
  }

  const active = current !== "";

  return (
    <label
      className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition focus-within:ring-2 focus-within:ring-primary-100 ${
        active
          ? "border-primary-300 bg-primary-50 text-primary-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      } ${className}`}
    >
      {icon && (
        <Icon
          name={icon}
          size="sm"
          className={active ? "text-primary-500" : "text-slate-400"}
        />
      )}
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className={`cursor-pointer appearance-none bg-transparent pr-4 text-sm font-medium outline-none ${
          active ? "text-primary-700" : "text-slate-600"
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size="sm"
        className={`pointer-events-none absolute right-2 ${
          active ? "text-primary-400" : "text-slate-300"
        }`}
      />
    </label>
  );
}
