import Link from "next/link";
import "./Button.css";
const CELLS = Array.from({ length: 36 }, (_, i) => ((i * 7919) % 36) / 36);
export default function Button({ href, children, variant = "pink" }: { href: string; children: string; variant?: "pink" | "white" | "line" | "ink" }) {
  return <Link href={href} className={`pixel brand-button brand-${variant}`}><span className="brand-fill" aria-hidden="true">{CELLS.map((delay, i) => <i key={i} style={{ transitionDelay: `${(delay * .28).toFixed(3)}s` }} />)}</span><span className="brand-label-text">{children}</span><svg className="brand-arrow" viewBox="0 0 8 8" aria-hidden="true" shapeRendering="crispEdges"><path d="M0 3h5V2h1v1h1v2H6v1H5V5H0z" fill="currentColor" /></svg></Link>;
}
