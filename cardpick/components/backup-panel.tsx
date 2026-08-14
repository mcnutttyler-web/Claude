"use client";

import { useState, useTransition } from "react";
import { manualBackupAction, listSnapshotsAction, restoreAction } from "@/lib/actions/backup";

interface Snapshot {
  filename: string;
  path: string;
  sizeBytes: number;
  mtime: Date;
}

export function BackupPanel({ initialSnapshots }: { initialSnapshots: Snapshot[] }) {
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [confirmation, setConfirmation] = useState("");
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await manualBackupAction();
            const fresh = await listSnapshotsAction();
            setSnapshots(fresh);
            setMessage("Backup created.");
          })
        }
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        Back up database now
      </button>

      <div>
        <h3 className="mb-1 text-sm font-semibold">Snapshots ({snapshots.length}/20 retained)</h3>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
          {snapshots.map((s) => (
            <li key={s.path} className="flex items-center gap-2">
              <input type="radio" name="snapshot" checked={selected === s.path} onChange={() => setSelected(s.path)} />
              <span>{s.filename}</span>
              <span className="text-neutral-400">({(s.sizeBytes / 1024).toFixed(0)} KB)</span>
            </li>
          ))}
        </ul>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!selected) return;
          startTransition(async () => {
            const fd = new FormData();
            fd.set("confirmation", confirmation);
            fd.set("snapshotPath", selected);
            const result = await restoreAction(fd);
            setMessage(result.error ?? "Restored. Reload the app.");
          });
        }}
        className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm"
      >
        <div className="font-semibold text-red-800">Restore from snapshot</div>
        <p className="text-red-700">Select a snapshot above, then type RESTORE to confirm. A safety snapshot of the current state is taken first.</p>
        <input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Type RESTORE"
          className="rounded border border-red-300 px-2 py-1"
        />
        <button disabled={isPending || confirmation !== "RESTORE" || !selected} className="block rounded-md bg-red-600 px-4 py-2 text-white disabled:opacity-50">
          Restore
        </button>
      </form>

      {message && <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">{message}</div>}
    </div>
  );
}
