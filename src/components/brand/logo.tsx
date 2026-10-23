import { Link } from "@tanstack/react-router";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2 text-fg no-underline">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="9" fill="#1D2635" stroke="#7C6CFF" strokeWidth="1.5" />
        <path d="M13 10.5v11l9-5.5-9-5.5z" fill="#F4F7FB" />
        <circle cx="24" cy="8" r="2" fill="#32D583" />
      </svg>
      {compact ? null : (
        <span className="font-display text-xl tracking-[0.14em]">FANZONE</span>
      )}
    </Link>
  );
}
