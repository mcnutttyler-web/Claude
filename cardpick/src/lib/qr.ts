import QRCode from "qrcode";

export function locationQrPayload(code: string): string {
  return `CARDPICK:${code}`;
}

export async function locationQrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(locationQrPayload(code), { margin: 0, width: 200 });
}

/** Parses a scanned "CARDPICK:<CODE>" payload back into the location code. */
export function parseLocationScan(payload: string): string | null {
  const match = /^CARDPICK:(.+)$/.exec(payload.trim());
  return match ? match[1] : null;
}
