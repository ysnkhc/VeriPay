"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function JobDetailRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/loop");
  }, [router]);
  return null;
}
