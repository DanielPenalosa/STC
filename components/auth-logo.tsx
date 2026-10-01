/**
 * Auth-only seal — the SCOUT-modified municipal seal shown on the sign-in
 * and sign-up pages. The global `Logo` in @/app/brand is unchanged, so the
 * landing page and dashboard keep their original logo.
 */

export const AUTH_LOGO_URL = "/scout-seal.png";

export function AuthLogo({
  size = 88,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={AUTH_LOGO_URL}
      alt="Seal of Santa Cruz, Laguna"
      width={size}
      height={size}
      className={`rounded-full object-contain ${className}`}
    />
  );
}
