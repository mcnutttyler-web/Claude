// Centralized string-enum vocabularies. SQLite has no native enum type, so
// these are the single source of truth for valid values, enforced with zod
// at the API boundary and used directly by domain services.

export const OrgType = ['PLATFORM', 'OPERATOR', 'SHIPPER'] as const;

export const Role = [
  'PLATFORM_ADMIN',
  'OPERATOR_ADMIN',
  'BRANCH_MANAGER',
  'DISPATCHER',
  'SHIPPER_ADMIN',
  'SHIPPER_VIEWER',
] as const;
export type RoleT = (typeof Role)[number];

export const Criticality = ['STANDARD', 'IMPORTANT', 'CRITICAL', 'STAT'] as const;

export const OwnershipStatus = [
  'PROPOSED',
  'TRIAL',
  'ACTIVE',
  'TEMP_COVERED',
  'PAUSED',
  'ENDED',
] as const;

export const AssignmentType = ['PRIMARY', 'BACKUP', 'REPLACEMENT'] as const;

export const AssignmentStatus = [
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'ACK_REQUIRED',
  'CONFIRMED_T24',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
  'EXPIRED',
] as const;

export const CheckpointType = [
  'FULL_DISCLOSURE',
  'T24_RECONFIRM',
  'EVENING_READINESS',
  'PRE_DEPARTURE',
] as const;

export const CheckpointResponse = ['YES', 'LATE', 'PROBLEM', 'CANNOT_COMPLETE', 'NO_RESPONSE'] as const;

export const RiskTier = ['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const;
export type RiskTierT = (typeof RiskTier)[number];

export const BackupArrangementType = [
  'NAMED_UNPAID',
  'PRIORITY_ACCESS',
  'ACTIVATION_BONUS',
  'OPERATOR_FUNDED_STANDBY',
  'OPERATOR_DEFINED',
] as const;

export const BackupStatus = [
  'OFFERED',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'INTERESTED_FUTURE',
  'UNAVAILABLE_TODAY',
  'EXPIRED',
  'ACTIVATED',
] as const;

export const RecoveryStatus = [
  'OPEN',
  'BACKUP_ACTIVATED',
  'SOURCING',
  'REPLACEMENT_SECURED',
  'RESOLVED',
  'UNRESOLVED',
] as const;

export const CancellationClass = ['AVOIDABLE', 'UNAVOIDABLE'] as const;

export const CancellationCategory = [
  'ECONOMIC',
  'INFORMATIONAL',
  'LOGISTICAL',
  'BEHAVIORAL',
  'UNAVOIDABLE_EVENT',
] as const;

// Shipper-safe vocabulary. Never expose RiskTier or raw driver data to shippers.
export const ShipperVisibleState = [
  'OFFER_PENDING',
  'DRIVER_ACCEPTED',
  'COMMITTED_T24',
  'BACKUP_PREPARED',
  'INTERVENTION_UNDERWAY',
  'REPLACEMENT_SECURED',
  'READY_FOR_PICKUP',
] as const;
export type ShipperVisibleStateT = (typeof ShipperVisibleState)[number];

export const CandidateStatus = [
  'NOT_CONTACTED',
  'OFFER_SENT',
  'VIEWED',
  'INTERESTED',
  'UNAVAILABLE_TODAY',
  'INTERESTED_FUTURE',
  'REQUESTED_DIFFERENT_COMP',
  'DECLINED',
  'UNREACHABLE',
  'ACCEPTED',
  'DISQUALIFIED',
] as const;

export const InboundKeywords = {
  OPT_OUT: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'],
  OPT_IN: ['START'],
  HELP: ['HELP'],
};
