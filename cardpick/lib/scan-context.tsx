"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SCAN_PREFIX = "CARDPICK:";
/** A keyboard-wedge scanner types fast (usually <30ms between keystrokes)
 * and terminates with Enter. Anything slower is a human typing. */
const MAX_INTERVAL_MS = 40;

type ScanHandler = (code: string) => void;

const ScanHandlerContext = createContext<{
  registerHandler: (handler: ScanHandler | null) => void;
} | null>(null);

/** Pages that want to intercept a scan (e.g. intake: assign selected rows to
 * the scanned location instead of navigating) call this with a handler.
 * Passing null/unmounting restores the default "jump to location" behavior. */
export function useScanHandler(handler: ScanHandler | null) {
  const ctx = useContext(ScanHandlerContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.registerHandler(handler);
    return () => ctx.registerHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handler]);
}

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const handlerRef = useRef<ScanHandler | null>(null);
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const registerHandler = useCallback((handler: ScanHandler | null) => {
    handlerRef.current = handler;
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTypingField =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      const now = performance.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (elapsed > MAX_INTERVAL_MS && !isTypingField) {
        bufferRef.current = "";
      }

      if (e.key === "Enter") {
        const candidate = bufferRef.current;
        bufferRef.current = "";
        if (candidate.startsWith(SCAN_PREFIX)) {
          const code = candidate.slice(SCAN_PREFIX.length).trim();
          if (code) {
            setLastScan(code);
            setTimeout(() => setLastScan(null), 2500);
            if (handlerRef.current) {
              handlerRef.current(code);
            } else {
              router.push(`/locations/${encodeURIComponent(code)}`);
            }
          }
        }
        return;
      }

      if (e.key.length === 1) {
        if (isTypingField && elapsed > MAX_INTERVAL_MS) {
          // Likely a human typing in a normal field; don't hijack their input.
          bufferRef.current = "";
          return;
        }
        bufferRef.current += e.key;
        if (bufferRef.current.length > 128) {
          bufferRef.current = bufferRef.current.slice(-128);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [router]);

  return (
    <ScanHandlerContext.Provider value={{ registerHandler }}>
      {children}
      {lastScan && (
        <div className="fixed bottom-4 right-4 z-50 rounded bg-emerald-600 px-3 py-2 text-sm text-white shadow-lg">
          Scanned: {lastScan}
        </div>
      )}
    </ScanHandlerContext.Provider>
  );
}
