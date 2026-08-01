import { z } from "zod";

export const unloadResponsibilityOptions = [
  { value: "receiver", label: "Receiver will unload" },
  { value: "driver-assist", label: "Driver assistance required" },
  { value: "driver-unload", label: "Full driver unload required" },
  { value: "lumper", label: "Lumper service required" },
  { value: "crew-available", label: "Unloading crew is available" },
  { value: "not-sure", label: "Not sure" },
] as const;

export const yesNoUnsureOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
] as const;

export const deliveryPointOptions = [
  { value: "dock", label: "Dock" },
  { value: "curb", label: "Curb" },
  { value: "job-site", label: "Job site" },
  { value: "final-placement", label: "Final placement area (inside delivery)" },
] as const;

export const loadTypeOptions = [
  { value: "palletized", label: "Palletized" },
  { value: "floor-loaded", label: "Floor loaded" },
  { value: "mixed", label: "Mixed / both" },
] as const;

export const stackableOptions = [
  { value: "stackable", label: "Stackable" },
  { value: "non-stackable", label: "Non-stackable" },
  { value: "unsure", label: "Not sure" },
] as const;

export const preferredContactOptions = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
] as const;

const yesNoUnsure = z.enum(["yes", "no", "unsure"]);
const requiresDriverLabor = new Set(["driver-assist", "driver-unload"]);

export const quoteFormSchema = z
  .object({
    // Route information
    pickupCity: z.string().min(1, "Pickup city is required"),
    pickupState: z.string().min(2, "Pickup state is required").max(2),
    deliveryCity: z.string().min(1, "Delivery city is required"),
    deliveryState: z.string().min(2, "Delivery state is required").max(2),
    pickupDate: z.string().min(1, "Pickup date is required"),
    deliveryDate: z.string().optional(),
    appointmentRequired: yesNoUnsure,
    appointmentDetails: z.string().optional(),
    stopCount: z.string().regex(/^\d+$/, "Enter a whole number"),

    // Freight information
    commodity: z.string().min(1, "Commodity is required"),
    weight: z.string().min(1, "Approximate weight is required"),
    dimensions: z.string().optional(),
    palletCount: z.string().optional(),
    pieceOrRollCount: z.string().optional(),
    equipmentType: z.string().optional(),
    packagingType: z.string().optional(),
    loadType: z.enum(["palletized", "floor-loaded", "mixed"]),
    stackable: z.enum(["stackable", "non-stackable", "unsure"]),
    isHazmat: yesNoUnsure,
    hazmatDetails: z.string().optional(),
    isOversized: yesNoUnsure,
    oversizedDetails: z.string().optional(),
    tempControlled: yesNoUnsure,
    tempControlledDetails: z.string().optional(),

    // Unloading requirements
    unloadResponsibility: z.enum([
      "receiver",
      "driver-assist",
      "driver-unload",
      "lumper",
      "crew-available",
      "not-sure",
    ]),
    // Conditional block, required when unloadResponsibility is driver-assist or driver-unload
    driverPhysicalTasks: z.string().optional(),
    unitsToUnload: z.string().optional(),
    estimatedUnloadTime: z.string().optional(),
    facilityAssistanceAvailable: yesNoUnsure.optional(),
    palletJackAvailable: yesNoUnsure.optional(),
    forkliftAvailable: yesNoUnsure.optional(),
    driverExpectedToOperateEquipment: yesNoUnsure.optional(),
    stairsRampsLongCarries: yesNoUnsure.optional(),
    insideDeliveryRequired: yesNoUnsure.optional(),
    deliveryPointType: z.enum(["dock", "curb", "job-site", "final-placement"]).optional(),
    liftingRequirements: z.string().optional(),
    ppeRequirements: z.string().optional(),
    siteSafetyRules: z.string().optional(),
    unloadingAppointmentRequired: yesNoUnsure.optional(),
    additionalLaborAvailableIfNeeded: yesNoUnsure.optional(),

    // Contact information
    contactName: z.string().min(1, "Name is required"),
    company: z.string().min(1, "Company is required"),
    email: z.string().email("Enter a valid email address"),
    phone: z.string().min(7, "Enter a valid phone number"),
    preferredContactMethod: z.enum(["phone", "email", "text"]),

    // Notes / attachments metadata (actual files are handled client-side; only
    // names/sizes are summarized in the structured lead until a document
    // storage adapter is connected)
    additionalNotes: z.string().optional(),
    attachmentNames: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (requiresDriverLabor.has(data.unloadResponsibility)) {
      const required: Array<[keyof typeof data, string]> = [
        ["driverPhysicalTasks", "Describe what the driver would be expected to do"],
        ["unitsToUnload", "Approximate piece/roll/unit count is required"],
        ["estimatedUnloadTime", "Estimated unloading time is required"],
        ["facilityAssistanceAvailable", "Let us know if facility staff will assist"],
        ["palletJackAvailable", "Let us know if a pallet jack is available"],
        ["forkliftAvailable", "Let us know if a forklift is available"],
        ["driverExpectedToOperateEquipment", "Let us know if the driver is expected to operate equipment"],
        ["deliveryPointType", "Select the delivery point type"],
        ["unloadingAppointmentRequired", "Let us know if an unloading appointment is required"],
      ];
      for (const [field, message] of required) {
        if (!data[field]) {
          ctx.addIssue({ code: "custom", path: [field as string], message });
        }
      }
    }
    if (data.isHazmat === "yes" && !data.hazmatDetails) {
      ctx.addIssue({
        code: "custom",
        path: ["hazmatDetails"],
        message: "Describe the hazard class / commodity",
      });
    }
    if (data.isOversized === "yes" && !data.oversizedDetails) {
      ctx.addIssue({
        code: "custom",
        path: ["oversizedDetails"],
        message: "Provide dimensions that exceed standard legal limits",
      });
    }
  });

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;

export function unloadRequiresDriverLabor(value: string) {
  return requiresDriverLabor.has(value);
}
