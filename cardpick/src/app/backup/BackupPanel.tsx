"use client";

import { useState } from "react";
import { createManualBackupAction, listBackupsAction, restoreBackupAction } from "./actions";

interface BackupEntry {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export default function BackupPanel({ initialBackups }: { initialBackups: BackupEntry[] }) {
  const [backups, setBackups] = useState(initialBackups);
  const [busy, setBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setBackups(await listBackupsAction());
  }

  async function onBackupNow() {
    setBusy(true);
    try {
      await createManualBackupAction();
      await refresh();
      setMessage("Backup created.");
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      await restoreBackupAction(restoreTarget, confirmText);
      setMessage(`Restored from ${restoreTarget}. A safety snapshot of the prior state was taken first.`);
      setRestoreTarget(null);
      setConfirmText("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button className="rounded bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onBackupNow}>
        Back up database now
      </button>

      {message && <p className="text-sm text-green-700">{message}</p>}

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.name} className="border-t">
                <td className="px-3 py-2">{b.name}</td>
                <td className="px-3 py-2">{new Date(b.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">{(b.sizeBytes / 1024).toFixed(0)} KB</td>
                <td className="px-3 py-2">
                  <button className="underline text-red-700" onClick={() => setRestoreTarget(b.name)}>
                    Restore
                  </button>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={4}>
                  No backups yet. One is taken automatically before every import, bulk action, reprice, and
                  fulfillment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {restoreTarget && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 space-y-3 text-sm">
          <p className="font-medium">Restore {restoreTarget}?</p>
          <p>
            This replaces the live database with this backup. A safety snapshot of the current state is taken
            first. Type <strong>RESTORE</strong> to confirm.
          </p>
          <input
            className="border rounded px-2 py-1"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="RESTORE"
          />
          <div className="flex gap-2">
            <button
              className="rounded bg-red-700 text-white px-3 py-1.5 disabled:opacity-50"
              disabled={busy || confirmText !== "RESTORE"}
              onClick={onRestore}
            >
              Restore now
            </button>
            <button className="rounded border px-3 py-1.5" onClick={() => setRestoreTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
