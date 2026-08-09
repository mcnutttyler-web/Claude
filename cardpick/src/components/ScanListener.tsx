"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { parseLocationScan } from "@/lib/qr";
import { emitScan } from "@/lib/scanBus";

const BURST_GAP_MS = 40;
const MIN_SCAN_LENGTH = 4;

/**
 * A $20-30 USB/Bluetooth QR scanner types the payload as a fast keystroke
 * burst terminated by Enter. That's indistinguishable from human typing
 * except by speed, so we buffer characters and only treat the buffer as a
 * "scan" if it arrived faster than a human could type and ends in Enter.
 * This intentionally ignores camera scanning (getUserMedia needs a secure
 * context — see spec) and is the documented default input method.
 */
export default function ScanListener() {
  const router = useRouter();
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      const now = performance.now();
      const gap = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (gap > BURST_GAP_MS) {
        bufferRef.current = "";
      }

      if (e.key === "Enter") {
        const buffered = bufferRef.current;
        bufferRef.current = "";
        if (buffered.length < MIN_SCAN_LENGTH) return;
        const code = parseLocationScan(buffered);
        if (!code) return;
        if (isEditable) e.preventDefault();
        const consumed = emitScan(code);
        if (!consumed) router.push(`/locations/${encodeURIComponent(code)}`);
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [router]);

  return null;
}
