"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { initials } from "../../lib/display";
export function EmployeeAvatar({ accountId, name, className = "avatar" }: { accountId: string; name: string; className?: string }) {
  const [version,setVersion]=useState(0);
  const [failed,setFailed]=useState(false);
  useEffect(() => {
    const update=(event: Event) => {
      if ((event as CustomEvent<string>).detail !== accountId) return;
      setFailed(false); setVersion(Date.now());
    };
    window.addEventListener("avatar-updated",update);
    return () => window.removeEventListener("avatar-updated",update);
  },[accountId]);
  return <span className={`${className} employee-avatar-image`} aria-hidden="true">
    {failed ? initials(name) : <Image unoptimized width={256} height={256} key={`${accountId}-${version}`} src={`/api/employee/avatar?accountId=${encodeURIComponent(accountId)}&v=${version}`} alt="" onError={() => setFailed(true)} />}
  </span>;
}
