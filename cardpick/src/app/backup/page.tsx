import { listBackupsAction } from "./actions";
import BackupPanel from "./BackupPanel";

export default async function BackupPage() {
  const backups = await listBackupsAction();
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Backup &amp; Restore</h1>
      <p className="text-sm text-slate-500">
        Automatic snapshots are taken before every import, bulk action, repricing apply, and fulfillment
        confirmation. The most recent 20 are retained. Nothing is ever hard-deleted from CardPick itself —
        deletion sets status to INACTIVE.
      </p>
      <BackupPanel initialBackups={backups} />
    </div>
  );
}
