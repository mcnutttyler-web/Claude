/**
 * A page that wants to handle a keyboard-wedge scan itself (e.g. intake,
 * assigning selected rows to whatever location is scanned) registers a
 * consumer here. Absent a consumer, ScanListener falls back to jumping to
 * that location's view.
 */
type ScanConsumer = (code: string) => void;

let consumer: ScanConsumer | null = null;

export function registerScanConsumer(fn: ScanConsumer): () => void {
  consumer = fn;
  return () => {
    if (consumer === fn) consumer = null;
  };
}

export function emitScan(code: string): boolean {
  if (consumer) {
    consumer(code);
    return true;
  }
  return false;
}
