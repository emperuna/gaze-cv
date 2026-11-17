export function Brand({ light = false }: { light?: boolean }) {
  return <span className={`brand${light ? " brand-light" : ""}`}><img src="/brand/ocular-logo-128.png" width={40} height={40} alt="" aria-hidden="true" /><span>ocular</span></span>;
}
