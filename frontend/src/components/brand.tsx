export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand${light ? " brand-light" : ""}`}>
      <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M3 18s5.6-10 15-10 15 10 15 10-5.6 10-15 10S3 18 3 18Z" stroke="currentColor" strokeWidth="2" />
        <circle cx="18" cy="18" r="5" fill="currentColor" />
        <circle cx="20" cy="16" r="1.5" fill={light ? "#183c36" : "#fafbf8"} />
      </svg>
      <span>gaze<span className="brand-dot">.</span></span>
    </span>
  );
}
