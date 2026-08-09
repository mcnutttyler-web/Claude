import { notFound } from "next/navigation";
import { getOrderDetail, getReversibleFulfillmentBatch } from "@/lib/orderQueries";
import PickList from "./PickList";

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const orderId = Number(id);
  const detail = getOrderDetail(orderId);
  if (!detail) notFound();

  const reversibleBatchGroupId =
    detail.order.status === "FULFILLED" ? getReversibleFulfillmentBatch(orderId) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        Order {detail.order.tcgplayerOrderId} <span className="text-slate-400 font-normal">({detail.order.status})</span>
      </h1>
      <PickList
        orderId={orderId}
        lines={detail.lines}
        orderStatus={detail.order.status}
        reversibleBatchGroupId={reversibleBatchGroupId}
      />
    </div>
  );
}
