import { useId } from "react";

/**
 * Brand mark (Ron's pick, 2026-11-17): a map location pin with a
 * head-and-shoulders person silhouette in the negative space — "a found
 * customer". Emerald -> violet gradient, the two brand colors
 * (primary hsl(160 84% 50%) -> accent hsl(262 83% 65%)).
 * Recreated as a crisp inline SVG; the concept raster is never shipped.
 * The person is a true cutout (fill-rule evenodd), so the mark sits on
 * any background.
 */
export function BrandMark({ className = "h-10 w-10" }: { className?: string }) {
  const gradientId = `brand-pin-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      viewBox="0 0 48 62"
      className={className}
      role="img"
      aria-label="AI Hidden Leads"
      fill="none"
      aria-hidden={false}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(160 84% 50%)" />
          <stop offset="55%" stopColor="hsl(196 82% 52%)" />
          <stop offset="100%" stopColor="hsl(262 83% 65%)" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        fillRule="evenodd"
        d="M24 61C24 61 6 40.6 6 24a18 18 0 1 1 36 0C42 40.6 24 61 24 61Z
           M24 11.4C28.1 11.4 31.4 15.3 31.4 20C31.4 24.7 30 26.8 27.9 27.9
           C30.6 28.9 33.3 30.6 34.2 33C34.5 34 33.9 35.1 32.7 35.3
           C29 36.9 19 36.9 15.3 35.3C14.1 35.1 13.5 34 13.8 33
           C14.7 30.6 17.4 28.9 20.1 27.9C18 26.8 16.6 24.7 16.6 20
           C16.6 15.3 19.9 11.4 24 11.4Z"
      />
    </svg>
  );
}

/**
 * The one brand lockup: pin mark + typeset wordmark
 * ("AI" foreground, "Hidden" emerald primary, "Leads" foreground).
 * Used by the CRM sidebar (expanded + collapsed) and the CRM
 * sign-in / access cards — the logo appears exactly once per surface.
 */
export function BrandLockup({
  collapsed = false,
  className = "",
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""} ${className}`}>
      <BrandMark className="h-10 w-10 shrink-0" />
      {!collapsed && (
        <span className="whitespace-nowrap text-lg font-semibold tracking-tight text-foreground">
          AI <span className="text-primary">Hidden</span> Leads
        </span>
      )}
    </span>
  );
}
