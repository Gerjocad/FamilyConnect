/** App-Symbol in der Farbe des gewählten Farbschemas (wie public/icon.svg) */
export function Logo({ size }: { size: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <path d="M32 15 13 31h5v17h11V38h6v10h11V31h5z" fill="#fff" />
      <path d="M32 33.5c-1.6-2.7-6.5-2.3-6.5 1.4 0 2.6 3.3 4.6 6.5 7.1 3.2-2.5 6.5-4.5 6.5-7.1 0-3.7-4.9-4.1-6.5-1.4z" fill="var(--accent)" />
    </svg>
  );
}
