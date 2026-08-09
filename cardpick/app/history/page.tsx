import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { history } from "@/lib/db/schema";

export default async function HistoryPage() {
  const rows = db.select().from(history).orderBy(desc(history.createdAt)).limit(300).all();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">History</h1>
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-2 py-2">When</th>
            <th className="px-2 py-2">Entity</th>
            <th className="px-2 py-2">Action</th>
            <th className="px-2 py-2">Reason</th>
            <th className="px-2 py-2">Group</th>
            <th className="px-2 py-2">Reversed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id} className="border-b border-neutral-100">
              <td className="px-2 py-2 text-neutral-500">{h.createdAt}</td>
              <td className="px-2 py-2">
                {h.entityType} #{h.entityId}
              </td>
              <td className="px-2 py-2">{h.action}</td>
              <td className="px-2 py-2">{h.reason ?? "—"}</td>
              <td className="px-2 py-2 font-mono text-xs">{h.groupId ? h.groupId.slice(0, 8) : "—"}</td>
              <td className="px-2 py-2">{h.reversed ? "yes" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
