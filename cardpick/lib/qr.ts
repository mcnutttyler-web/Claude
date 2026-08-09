import QRCode from "qrcode";

export async function locationQrSvg(code: string): Promise<string> {
  return QRCode.toString(`CARDPICK:${code}`, { type: "svg", margin: 0, width: 96 });
}
