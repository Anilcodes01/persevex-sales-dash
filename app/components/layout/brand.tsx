import Image from "next/image";
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
      <Image src={"/logo/lms-logo.png"} alt="LMS Logo" width={100} height={100} />
    </Link>
  );
}
