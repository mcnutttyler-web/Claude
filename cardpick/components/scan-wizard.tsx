"use client";

import { useState } from "react";
import Link from "next/link";
import { startScanAction, commitScanAction } from "@/lib/actions/scan";
import type { StartScanResult, CommitScanResult } from "@/lib/recognition/scan";
import type { ReferenceCardCandidate } from "@/lib/recognition/pokemontcg";

const CONDITION_LABELS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged", "Unopened"];

type Step =
  | { name: "capture" }
  | { name: "confirm"; started: StartScanResult }
  | { name: "details"; started: StartScanResult; identity: { referenceCardId: number | null; name: string; setName: string; cardNumber: string; printing: string | null } }
  | { name: "done"; result: CommitScanResult };

export function ScanWizard({ locations }: { locations: { id: number; code: string }[] }) {
  const [step, setStep] = useState<Step>({ name: "capture" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCapture(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const result = await startScanAction(fd);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStep({ name: "confirm", started: result });
  }

  function pickCandidate(started: StartScanResult, candidate: ReferenceCardCandidate) {
    setStep({
      name: "details",
      started,
      identity: { referenceCardId: candidate.id, name: candidate.name, setName: candidate.setName, cardNumber: candidate.cardNumber, printing: candidate.printingCode },
    });
  }

  function enterManually(started: StartScanResult) {
    setStep({
      name: "details",
      started,
      identity: {
        referenceCardId: null,
        name: started.guess.name ?? "",
        setName: started.guess.setNameGuess ?? "",
        cardNumber: started.guess.cardNumberGuess ?? "",
        printing: started.guess.printingGuess,
      },
    });
  }

  if (step.name === "capture") {
    return (
      <div className="max-w-xl space-y-4">
        {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleCapture} className="space-y-3">
          <input type="file" name="photo" accept="image/*" capture="environment" required className="block text-sm" />
          <p className="text-xs text-neutral-500">
            Opens your phone&apos;s camera directly (no live-scanning secure-context requirement — this is a plain photo upload).
            Each scan calls a paid vision API, so this works best for cards worth identifying quickly rather than bulk commons.
          </p>
          <button disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Identifying card…" : "Identify card"}
          </button>
        </form>
      </div>
    );
  }

  if (step.name === "confirm") {
    const { started } = step;
    return (
      <div className="max-w-2xl space-y-4">
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div className="font-medium">Vision read: {started.guess.name ?? "(couldn't read a name)"}</div>
          <div className="text-neutral-500">
            {started.guess.setNameGuess ?? "unknown set"} · {started.guess.cardNumberGuess ?? "unknown #"} · {started.guess.printingGuess ?? "unknown printing"} · confidence: {started.guess.confidence}
          </div>
          {started.guess.notes && <div className="mt-1 text-xs text-amber-700">{started.guess.notes}</div>}
        </div>

        {started.candidates.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-neutral-500">Confirm which reference card this is:</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {started.candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCandidate(started, c)}
                  className="rounded-lg border border-neutral-200 bg-white p-2 text-left text-xs hover:border-neutral-900"
                >
                  {c.smallImageUrl && (
                    // Reference images come from pokemontcg.io's external CDN at
                    // arbitrary sizes in a small thumbnail grid — plain <img> avoids
                    // next/image's remotePatterns config for a non-performance-critical spot.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.smallImageUrl} alt={c.name} className="mb-1 w-full rounded" />
                  )}
                  <div className="font-medium">{c.name}</div>
                  <div className="text-neutral-500">
                    {c.setName} #{c.cardNumber}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-700">No reference matches found — enter the card details manually.</p>
        )}

        <button onClick={() => enterManually(started)} className="text-sm text-blue-600 hover:underline">
          {started.candidates.length > 0 ? "None of these — enter manually" : "Enter manually"}
        </button>
      </div>
    );
  }

  if (step.name === "details") {
    return <DetailsForm step={step} locations={locations} busy={busy} setBusy={setBusy} setError={setError} error={error} onDone={(result) => setStep({ name: "done", result })} />;
  }

  return <DoneSummary result={step.result} onScanAnother={() => setStep({ name: "capture" })} />;
}

function DetailsForm({
  step,
  locations,
  busy,
  setBusy,
  setError,
  error,
  onDone,
}: {
  step: Extract<Step, { name: "details" }>;
  locations: { id: number; code: string }[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  error: string | null;
  onDone: (result: CommitScanResult) => void;
}) {
  const [name, setName] = useState(step.identity.name);
  const [setName2, setSetName2] = useState(step.identity.setName);
  const [cardNumber, setCardNumber] = useState(step.identity.cardNumber);
  const [condition, setCondition] = useState("Near Mint");
  const [printing, setPrinting] = useState(step.identity.printing ?? "Normal");
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState("");
  const [sellPrice, setSellPrice] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await commitScanAction({
      scanId: step.started.scanId,
      referenceCardId: step.identity.referenceCardId,
      manualIdentity: step.identity.referenceCardId ? null : { name, setName: setName2, cardNumber },
      conditionLabel: condition,
      printingLabel: printing,
      quantity,
      locationId: locationId ? Number(locationId) : null,
      sellPriceCents: sellPrice ? Math.round(Number(sellPrice) * 100) : null,
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onDone(result);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-3">
      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!step.identity.referenceCardId && (
        <>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded border border-neutral-300 px-2 py-1" />
          </Field>
          <Field label="Set name">
            <input value={setName2} onChange={(e) => setSetName2(e.target.value)} required className="w-full rounded border border-neutral-300 px-2 py-1" />
          </Field>
          <Field label="Card number">
            <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="w-full rounded border border-neutral-300 px-2 py-1" />
          </Field>
        </>
      )}
      <Field label="Condition">
        <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full rounded border border-neutral-300 px-2 py-1">
          {CONDITION_LABELS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Printing">
        <input value={printing} onChange={(e) => setPrinting(e.target.value)} className="w-full rounded border border-neutral-300 px-2 py-1" />
      </Field>
      <Field label="Quantity">
        <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full rounded border border-neutral-300 px-2 py-1" />
      </Field>
      <Field label="Location (optional — leave unassigned to assign later)">
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full rounded border border-neutral-300 px-2 py-1">
          <option value="">Unassigned</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.code}</option>
          ))}
        </select>
      </Field>
      <Field label="Sell price (optional — leave blank to price later via Pricing → Reprice)">
        <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="$0.00" className="w-full rounded border border-neutral-300 px-2 py-1" />
      </Field>
      <button disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? "Saving…" : "Save to inventory"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-neutral-500">{label}</label>
      {children}
    </div>
  );
}

function DoneSummary({ result, onScanAnother }: { result: CommitScanResult; onScanAnother: () => void }) {
  if (result.status === "AMBIGUOUS") {
    return (
      <div className="max-w-xl space-y-3">
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          This matched more than one existing inventory item — resolve it manually rather than risk a wrong auto-match.
          <ul className="mt-2 list-inside list-disc">
            {result.candidateItemIds.map((id) => (
              <li key={id}>
                <Link href={`/inventory/${id}`} className="text-blue-700 hover:underline">
                  Inventory item #{id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <button onClick={onScanAnother} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
          Scan another card
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-3">
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
        {result.status === "CREATED" ? "Created a new inventory item." : "Updated the existing inventory item."}{" "}
        <Link href={`/inventory/${result.inventoryItemId}`} className="text-emerald-900 underline">
          View it
        </Link>
      </div>
      <button onClick={onScanAnother} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
        Scan another card
      </button>
    </div>
  );
}
