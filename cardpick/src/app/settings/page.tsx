import { getAppSettingsAction } from "./actions";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const settings = await getAppSettingsAction();
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForm initialHours={settings.lateOrderThresholdHours} />

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-2">
        <h2 className="font-medium">Scanning</h2>
        <p className="text-slate-600">
          The documented default is a $20–30 USB or Bluetooth QR scanner, which types scans as a fast keystroke
          burst — works anywhere in the app with zero setup.
        </p>
        <p className="text-slate-600">
          Phone camera scanning is deferred: browser camera access (getUserMedia) requires a secure context, and
          plain <code>http://192.168.x.x:3000</code> on a LAN is not one. If added later, it needs Tailscale or
          an equivalent HTTPS path.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-2">
        <h2 className="font-medium">Not built in this MVP</h2>
        <ul className="list-disc list-inside text-slate-600 space-y-1">
          <li>Full-text search infrastructure — indexed LIKE is fast enough at this scale.</li>
          <li>User accounts, roles, or sessions.</li>
          <li>Charts or graphs of any kind.</li>
          <li>Image handling or card photos.</li>
          <li>Any TCGplayer API call.</li>
          <li>Any LLM call.</li>
          <li>Docker, containers, or a separate API server.</li>
          <li>Real-time updates, websockets, or optimistic UI.</li>
        </ul>
      </div>
    </div>
  );
}
