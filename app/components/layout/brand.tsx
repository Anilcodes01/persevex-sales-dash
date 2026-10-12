import Link from "next/link";
export function Brand({
  href = "/",
  label = "Persevex home",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link className="brand" href={href} aria-label={label}>
      <span className="brand-mark">P</span>persevex
      <span className="brand-dot">.</span>
    </Link>
  );
}
