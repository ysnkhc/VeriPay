"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CreateJobRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/loop");
  }, [router]);
  return null;
}
