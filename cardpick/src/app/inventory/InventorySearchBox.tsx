"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DEBOUNCE_MS = 150;

export default function InventorySearchBox({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      router.push(value ? `/inventory?q=${encodeURIComponent(value)}` : "/inventory");
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      className="w-full max-w-md border rounded px-3 py-2 text-sm"
      placeholder="Search by name, set, card number, or SKU…"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
