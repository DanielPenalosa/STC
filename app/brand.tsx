/**
 * SCOUT — Sta. Cruz Community Observation and Unified Triage
 * An AI-Powered Computer Vision-Based System for Location-Aware
 * Classification and Automated Routing of Community Concerns
 * in Sta. Cruz, Laguna
 *
 * Central place to rebrand the system.
 * Change values here (or in the `app_settings` table / Settings page) and
 * the whole UI updates.
 *
 * Colors follow the official Santa Cruz, Laguna palette:
 *   deep navy #030B65 · royal blue #2333A0 · bright cyan #06ABEA
 *   red #DF1B2C · yellow #F5E606 · green #2E8254 · off white #F9F9F9 · black #060606
 */

export const CLIENT_NAME = "SCOUT";
export const CLIENT_SHORT_NAME = "SCOUT";
export const CITY_NAME = "Sta. Cruz, Laguna";
export const TAGLINE = "Sta. Cruz Community Observation and Unified Triage";
export const CONTACT_EMAIL = "support@example.gov";
export const CONTACT_PHONE = "(000) 000-0000";

/** Official palette — single source of truth for non-Tailwind contexts. */
export const PALETTE = {
  navy: "#030B65",
  royal: "#2333A0",
  cyan: "#06ABEA",
  red: "#DF1B2C",
  yellow: "#F5E606",
  green: "#2E8254",
  offWhite: "#F9F9F9",
  black: "#060606",
} as const;

/**
 * The SCOUT logo lives at /public/logo.png and is used everywhere.
 * Set `NEXT_PUBLIC_LOGO_URL` in .env.local to a hosted image to override it.
 */
export const LOGO_URL =
  process.env.NEXT_PUBLIC_LOGO_URL && process.env.NEXT_PUBLIC_LOGO_URL.trim() !== ""
    ? process.env.NEXT_PUBLIC_LOGO_URL
    : "/logo.png";

export function Logo({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  if (LOGO_URL) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={LOGO_URL}
        alt={CLIENT_NAME}
        width={size}
        height={size}
        className={`rounded-lg object-contain ${className}`}
      />
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label={CLIENT_NAME}
      role="img"
    >
      <rect width="24" height="24" rx="6" fill={PALETTE.royal} />
      <path
        d="M12 4l6 2.4v5.1c0 3.7-2.5 7.1-6 8.1-3.5-1-6-4.4-6-8.1V6.4L12 4z"
        fill="#fff"
        fillOpacity="0.92"
      />
      <path
        d="M12 7.2l3.2 1.3v2.7c0 2-1.3 3.8-3.2 4.4-1.9-.6-3.2-2.4-3.2-4.4V8.5L12 7.2z"
        fill={PALETTE.cyan}
      />
    </svg>
  );
}
