"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  quoteFormSchema,
  type QuoteFormValues,
  unloadResponsibilityOptions,
  yesNoUnsureOptions,
  deliveryPointOptions,
  loadTypeOptions,
  stackableOptions,
  preferredContactOptions,
  unloadRequiresDriverLabor,
} from "@/lib/quote-schema";
import { submitQuoteRequest } from "@/app/quote/actions";
import { Field, FieldsetLegend, inputClasses } from "@/components/quote/FormField";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

function RadioRow({
  name,
  options,
  register,
}: {
  name: keyof QuoteFormValues;
  options: ReadonlyArray<{ value: string; label: string }>;
  register: ReturnType<typeof useForm<QuoteFormValues>>["register"];
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-brand-200 px-3 py-2 text-sm font-medium text-brand-800 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
        >
          <input type="radio" value={opt.value} {...register(name)} className="accent-brand-700" />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export function QuoteForm() {
  const [result, setResult] = useState<{ status: "success" | "error"; message?: string; flags?: string[] } | null>(
    null
  );
  const [fileNames, setFileNames] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      stopCount: "1",
      appointmentRequired: "unsure",
      loadType: "palletized",
      stackable: "unsure",
      isHazmat: "no",
      isOversized: "no",
      tempControlled: "no",
      preferredContactMethod: "phone",
    },
  });

  const unloadResponsibility = watch("unloadResponsibility");
  const appointmentRequired = watch("appointmentRequired");
  const isHazmat = watch("isHazmat");
  const isOversized = watch("isOversized");
  const tempControlled = watch("tempControlled");
  const showDriverLaborBlock = unloadRequiresDriverLabor(unloadResponsibility ?? "");

  async function onSubmit(values: QuoteFormValues) {
    const result = await submitQuoteRequest({ ...values, attachmentNames: fileNames });
    if (result.success) {
      setResult({ status: "success", flags: result.flags });
      reset();
      setFileNames([]);
    } else {
      setResult({ status: "error", message: result.error });
    }
  }

  if (result?.status === "success") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-green-900">
        <h2 className="text-xl font-bold">Quote request received</h2>
        <p className="mt-2">
          Thanks for the details. We&apos;ll review the shipment, follow up if anything is missing, and get
          back to you with next steps. For anything urgent, call 937-661-2340.
        </p>
        {result.flags && result.flags.length > 0 && (
          <div className="mt-4 rounded-md bg-white/60 p-4 text-sm text-green-800">
            <p className="font-semibold">Flagged for extra review:</p>
            <ul className="mt-1 list-disc pl-5">
              {result.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-12" noValidate>
      {/* Route Information */}
      <fieldset>
        <FieldsetLegend title="Route Information" description="Where the shipment starts and ends." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Pickup city" htmlFor="pickupCity" required error={errors.pickupCity?.message}>
            <input id="pickupCity" className={inputClasses} {...register("pickupCity")} />
          </Field>
          <Field label="Pickup state" htmlFor="pickupState" required error={errors.pickupState?.message}>
            <select id="pickupState" className={inputClasses} {...register("pickupState")}>
              <option value="">Select</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Delivery city" htmlFor="deliveryCity" required error={errors.deliveryCity?.message}>
            <input id="deliveryCity" className={inputClasses} {...register("deliveryCity")} />
          </Field>
          <Field label="Delivery state" htmlFor="deliveryState" required error={errors.deliveryState?.message}>
            <select id="deliveryState" className={inputClasses} {...register("deliveryState")}>
              <option value="">Select</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pickup date" htmlFor="pickupDate" required error={errors.pickupDate?.message}>
            <input id="pickupDate" type="date" className={inputClasses} {...register("pickupDate")} />
          </Field>
          <Field label="Required delivery date" htmlFor="deliveryDate" hint="If flexible, leave blank.">
            <input id="deliveryDate" type="date" className={inputClasses} {...register("deliveryDate")} />
          </Field>
          <Field label="Number of stops" htmlFor="stopCount" required error={errors.stopCount?.message}>
            <input id="stopCount" type="number" min={1} max={50} className={inputClasses} {...register("stopCount")} />
          </Field>
          <Field label="Is a delivery appointment required?" htmlFor="appointmentRequired" required>
            <select id="appointmentRequired" className={inputClasses} {...register("appointmentRequired")}>
              {yesNoUnsureOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {appointmentRequired === "yes" && (
          <div className="mt-5">
            <Field label="Appointment details" htmlFor="appointmentDetails" hint="Window, scheduling system, contact, etc.">
              <textarea id="appointmentDetails" rows={2} className={inputClasses} {...register("appointmentDetails")} />
            </Field>
          </div>
        )}
      </fieldset>

      {/* Freight Information */}
      <fieldset>
        <FieldsetLegend title="Freight Information" description="What's shipping and how it's packaged." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Commodity" htmlFor="commodity" required error={errors.commodity?.message}>
            <input id="commodity" placeholder="e.g. Carpet padding" className={inputClasses} {...register("commodity")} />
          </Field>
          <Field label="Approximate weight" htmlFor="weight" required error={errors.weight?.message}>
            <input id="weight" placeholder="e.g. 22,000 lbs" className={inputClasses} {...register("weight")} />
          </Field>
          <Field label="Dimensions" htmlFor="dimensions" hint="L x W x H, per unit or total">
            <input id="dimensions" className={inputClasses} {...register("dimensions")} />
          </Field>
          <Field label="Pallet count" htmlFor="palletCount">
            <input id="palletCount" className={inputClasses} {...register("palletCount")} />
          </Field>
          <Field label="Piece / roll count" htmlFor="pieceOrRollCount">
            <input id="pieceOrRollCount" className={inputClasses} {...register("pieceOrRollCount")} />
          </Field>
          <Field label="Equipment type, if known" htmlFor="equipmentType" hint="Dry van, flatbed, step deck, reefer, etc.">
            <input id="equipmentType" className={inputClasses} {...register("equipmentType")} />
          </Field>
          <Field label="Packaging type" htmlFor="packagingType" hint="Cartons, rolls, crated, loose, etc.">
            <input id="packagingType" className={inputClasses} {...register("packagingType")} />
          </Field>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Floor-loaded or palletized?" htmlFor="loadType" required>
            <RadioRow name="loadType" options={loadTypeOptions} register={register} />
          </Field>
          <Field label="Stackable?" htmlFor="stackable" required>
            <RadioRow name="stackable" options={stackableOptions} register={register} />
          </Field>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <div>
            <Field label="Hazmat?" htmlFor="isHazmat" required>
              <RadioRow name="isHazmat" options={yesNoUnsureOptions} register={register} />
            </Field>
            {isHazmat === "yes" && (
              <div className="mt-3">
                <textarea
                  placeholder="Hazard class, UN/NA number, packing group"
                  rows={2}
                  className={inputClasses}
                  {...register("hazmatDetails")}
                />
                {errors.hazmatDetails && <p className="mt-1 text-sm text-red-600">{errors.hazmatDetails.message}</p>}
              </div>
            )}
          </div>
          <div>
            <Field label="Oversized / over-dimensional?" htmlFor="isOversized" required>
              <RadioRow name="isOversized" options={yesNoUnsureOptions} register={register} />
            </Field>
            {isOversized === "yes" && (
              <div className="mt-3">
                <textarea
                  placeholder="Dimensions exceeding standard legal limits"
                  rows={2}
                  className={inputClasses}
                  {...register("oversizedDetails")}
                />
                {errors.oversizedDetails && (
                  <p className="mt-1 text-sm text-red-600">{errors.oversizedDetails.message}</p>
                )}
              </div>
            )}
          </div>
          <div>
            <Field label="Temperature controlled?" htmlFor="tempControlled" required>
              <RadioRow name="tempControlled" options={yesNoUnsureOptions} register={register} />
            </Field>
            {tempControlled === "yes" && (
              <div className="mt-3">
                <input
                  placeholder="Required temperature range"
                  className={inputClasses}
                  {...register("tempControlledDetails")}
                />
              </div>
            )}
          </div>
        </div>
      </fieldset>

      {/* Unloading Requirements */}
      <fieldset className="rounded-xl border border-brand-200 bg-brand-50 p-6">
        <FieldsetLegend
          title="Unloading Requirements"
          description="Who will unload the freight? This is one of the most important details we use to source the right carrier."
        />
        <Field label="Who will unload the freight?" htmlFor="unloadResponsibility" required error={errors.unloadResponsibility?.message}>
          <select id="unloadResponsibility" className={inputClasses} {...register("unloadResponsibility")}>
            <option value="">Select</option>
            {unloadResponsibilityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        {showDriverLaborBlock && (
          <div className="mt-6 space-y-5 border-t border-brand-200 pt-6">
            <p className="rounded-md bg-white p-4 text-sm text-brand-700">
              Driver assistance is subject to carrier and driver approval and must be confirmed before
              dispatch. The details below help us match your shipment with a carrier and driver who can
              actually take this on.
            </p>
            <Field
              label="What must the driver physically do?"
              htmlFor="driverPhysicalTasks"
              required
              error={errors.driverPhysicalTasks?.message}
            >
              <textarea
                id="driverPhysicalTasks"
                rows={3}
                className={inputClasses}
                placeholder="e.g. Carry rolls of carpet padding from the trailer to a garage"
                {...register("driverPhysicalTasks")}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Approx. pieces, rolls or units to unload"
                htmlFor="unitsToUnload"
                required
                error={errors.unitsToUnload?.message}
              >
                <input id="unitsToUnload" className={inputClasses} {...register("unitsToUnload")} />
              </Field>
              <Field
                label="Estimated unloading time"
                htmlFor="estimatedUnloadTime"
                required
                error={errors.estimatedUnloadTime?.message}
              >
                <input id="estimatedUnloadTime" placeholder="e.g. 2 hours" className={inputClasses} {...register("estimatedUnloadTime")} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Will someone at the facility assist?" htmlFor="facilityAssistanceAvailable" required>
                <select id="facilityAssistanceAvailable" className={inputClasses} {...register("facilityAssistanceAvailable")}>
                  {yesNoUnsureOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Is a pallet jack available?" htmlFor="palletJackAvailable" required>
                <select id="palletJackAvailable" className={inputClasses} {...register("palletJackAvailable")}>
                  {yesNoUnsureOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Is a forklift available?" htmlFor="forkliftAvailable" required>
                <select id="forkliftAvailable" className={inputClasses} {...register("forkliftAvailable")}>
                  {yesNoUnsureOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label="Is the driver expected to operate any equipment?"
              htmlFor="driverExpectedToOperateEquipment"
              required
              hint="Powered equipment requires specific authorization and an approved, qualified operator — never assumed."
            >
              <select
                id="driverExpectedToOperateEquipment"
                className={inputClasses}
                {...register("driverExpectedToOperateEquipment")}
              >
                {yesNoUnsureOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Are stairs, ramps or long carries involved?" htmlFor="stairsRampsLongCarries">
                <select id="stairsRampsLongCarries" className={inputClasses} {...register("stairsRampsLongCarries")}>
                  {yesNoUnsureOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Is inside delivery required?" htmlFor="insideDeliveryRequired">
                <select id="insideDeliveryRequired" className={inputClasses} {...register("insideDeliveryRequired")}>
                  {yesNoUnsureOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Delivery point" htmlFor="deliveryPointType" required error={errors.deliveryPointType?.message}>
              <select id="deliveryPointType" className={inputClasses} {...register("deliveryPointType")}>
                <option value="">Select</option>
                {deliveryPointOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Lifting requirements" htmlFor="liftingRequirements" hint="Max weight per lift, etc.">
                <input id="liftingRequirements" className={inputClasses} {...register("liftingRequirements")} />
              </Field>
              <Field label="PPE requirements" htmlFor="ppeRequirements" hint="Steel toes, hi-vis, hard hat, etc.">
                <input id="ppeRequirements" className={inputClasses} {...register("ppeRequirements")} />
              </Field>
            </div>
            <Field label="Site-specific safety rules" htmlFor="siteSafetyRules">
              <textarea id="siteSafetyRules" rows={2} className={inputClasses} {...register("siteSafetyRules")} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Is an unloading appointment required?" htmlFor="unloadingAppointmentRequired" required>
                <select id="unloadingAppointmentRequired" className={inputClasses} {...register("unloadingAppointmentRequired")}>
                  {yesNoUnsureOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Is additional labor available if needed?" htmlFor="additionalLaborAvailableIfNeeded">
                <select
                  id="additionalLaborAvailableIfNeeded"
                  className={inputClasses}
                  {...register("additionalLaborAvailableIfNeeded")}
                >
                  {yesNoUnsureOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        )}
      </fieldset>

      {/* Contact Information */}
      <fieldset>
        <FieldsetLegend title="Contact Information" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="contactName" required error={errors.contactName?.message}>
            <input id="contactName" className={inputClasses} {...register("contactName")} />
          </Field>
          <Field label="Company" htmlFor="company" required error={errors.company?.message}>
            <input id="company" className={inputClasses} {...register("company")} />
          </Field>
          <Field label="Email" htmlFor="email" required error={errors.email?.message}>
            <input id="email" type="email" className={inputClasses} {...register("email")} />
          </Field>
          <Field label="Phone" htmlFor="phone" required error={errors.phone?.message}>
            <input id="phone" type="tel" className={inputClasses} {...register("phone")} />
          </Field>
        </div>
        <div className="mt-5">
          <Field label="Preferred contact method" htmlFor="preferredContactMethod" required>
            <RadioRow name="preferredContactMethod" options={preferredContactOptions} register={register} />
          </Field>
        </div>
      </fieldset>

      {/* File Uploads */}
      <fieldset>
        <FieldsetLegend
          title="Documents & Photos"
          description="Bills of lading, product/loading/delivery-site photos, dimensions, routing instructions, or safety requirements."
        />
        <input
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={(e) => {
            const names = Array.from(e.target.files ?? []).map((f) => f.name);
            setFileNames(names);
            setValue("attachmentNames", names);
          }}
          className="block w-full text-sm text-brand-700 file:mr-4 file:rounded-md file:border-0 file:bg-brand-900 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
        />
        {fileNames.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-brand-600">
            {fileNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-brand-500">
          Selected files are listed with your request. If we need the actual documents to finalize a quote,
          we&apos;ll follow up with a secure way to send them.
        </p>
        <div className="mt-5">
          <Field label="Additional notes" htmlFor="additionalNotes">
            <textarea id="additionalNotes" rows={3} className={inputClasses} {...register("additionalNotes")} />
          </Field>
        </div>
      </fieldset>

      <div className="rounded-lg border border-brand-200 bg-brand-50 p-5 text-sm text-brand-700">
        Submitting this form does not create a binding freight quote or guarantee capacity. Rates and
        availability are subject to review of the complete shipment, handling, equipment, labor and
        delivery requirements. Driver-assisted services must be confirmed before dispatch.
      </div>

      {result?.status === "error" && <p className="text-sm text-red-600">{result.message}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-full items-center justify-center rounded-md bg-accent-500 px-6 py-4 text-lg font-semibold text-brand-950 transition-colors hover:bg-accent-400 disabled:opacity-60 sm:w-auto"
      >
        {isSubmitting ? "Submitting…" : "Submit Quote Request"}
      </button>
    </form>
  );
}
