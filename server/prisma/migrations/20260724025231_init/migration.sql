-- CreateTable
CREATE TABLE "PlatformOrganization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OperatorOrganization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "messagingPolicy" TEXT NOT NULL DEFAULT '{}',
    "checkpointPolicy" TEXT NOT NULL DEFAULT '{}',
    "riskPolicy" TEXT NOT NULL DEFAULT '{}',
    "incentivePolicy" TEXT NOT NULL DEFAULT '{}',
    "shipperVisibilityPolicy" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OperatorBranch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatorBranch_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorOrganization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipperOrganization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "industry" TEXT,
    "pilotStatus" TEXT NOT NULL DEFAULT 'none',
    "reportingSettings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OperatorShipperRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "shipperId" TEXT NOT NULL,
    "contractReference" TEXT,
    "visibilitySettings" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatorShipperRelationship_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorOrganization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OperatorShipperRelationship_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "ShipperOrganization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationType" TEXT NOT NULL,
    "operatorId" TEXT,
    "shipperId" TEXT,
    "role" TEXT NOT NULL,
    "branchId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorOrganization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "ShipperOrganization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "OperatorBranch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "vehicleTypes" TEXT NOT NULL DEFAULT '[]',
    "equipment" TEXT NOT NULL DEFAULT '[]',
    "serviceAreas" TEXT NOT NULL DEFAULT '[]',
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "credentialSummary" TEXT NOT NULL DEFAULT '{}',
    "smsConsentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "smsConsentAt" DATETIME,
    "smsConsentSource" TEXT,
    "smsConsentLanguageVersion" TEXT,
    "optOutAt" DATETIME,
    "preferredContactWindow" TEXT NOT NULL DEFAULT '{}',
    "allowedChannels" TEXT NOT NULL DEFAULT '["SMS","SECURE_LINK"]',
    "quietHours" TEXT NOT NULL DEFAULT '{"start":"21:00","end":"07:00"}',
    "activeStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Driver_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorOrganization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DriverPool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchScope" TEXT NOT NULL DEFAULT '[]',
    "shipperScope" TEXT NOT NULL DEFAULT '[]',
    "routeTypeScope" TEXT NOT NULL DEFAULT '[]',
    "visibility" TEXT NOT NULL DEFAULT 'OPERATOR_PRIVATE',
    "activeStatus" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverPool_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorOrganization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DriverPoolMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poolId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "addedBy" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverPoolMembership_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "DriverPool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DriverPoolMembership_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DriverCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "issuedAt" DATETIME,
    "expiresAt" DATETIME,
    "verificationSource" TEXT,
    "verifiedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverCredential_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "shipperId" TEXT,
    "branchId" TEXT NOT NULL,
    "routeCode" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "pickupArea" TEXT NOT NULL,
    "deliveryArea" TEXT NOT NULL,
    "scheduledStart" TEXT NOT NULL,
    "estimatedCompletion" TEXT NOT NULL,
    "estimatedMileage" REAL,
    "estimatedStopCount" INTEGER,
    "vehicleRequirements" TEXT NOT NULL DEFAULT '[]',
    "equipmentRequirements" TEXT NOT NULL DEFAULT '[]',
    "commodity" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'STANDARD',
    "recurringWeekdays" TEXT NOT NULL DEFAULT '[]',
    "compensation" TEXT NOT NULL DEFAULT '{}',
    "materialNotes" TEXT,
    "customerQualifications" TEXT NOT NULL DEFAULT '[]',
    "requiredCredentials" TEXT NOT NULL DEFAULT '[]',
    "backupPolicy" TEXT NOT NULL DEFAULT '{}',
    "shipperVisibilitySettings" TEXT NOT NULL DEFAULT '{"visible":false}',
    "activeVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Route_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorOrganization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Route_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "ShipperOrganization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Route_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "OperatorBranch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RouteDetailVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "RouteDetailVersion_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RouteOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeId" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "scheduledStart" DATETIME NOT NULL,
    "scheduledEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "recoveryLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RouteOccurrence_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RouteOwnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "weekdays" TEXT NOT NULL DEFAULT '[]',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "routeStreak" INTEGER NOT NULL DEFAULT 0,
    "checkpointLevel" TEXT NOT NULL DEFAULT 'FULL',
    "plannedTimeOff" TEXT NOT NULL DEFAULT '[]',
    "temporaryReplacementDriverId" TEXT,
    "temporaryReplacementReason" TEXT,
    "temporaryReplacementReturnDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RouteOwnership_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RouteOwnership_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeOccurrenceId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFERED',
    "acceptedDetailVersion" INTEGER,
    "acceptedAt" DATETIME,
    "acceptanceChannel" TEXT,
    "responseTimeSeconds" INTEGER,
    "t24Status" TEXT NOT NULL DEFAULT 'PENDING',
    "checkpointStatus" TEXT NOT NULL DEFAULT '{}',
    "commitmentRiskTier" TEXT NOT NULL DEFAULT 'GREEN',
    "supersededByAssignmentId" TEXT,
    "originalAssignmentId" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_routeOccurrenceId_fkey" FOREIGN KEY ("routeOccurrenceId") REFERENCES "RouteOccurrence" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "checkpointType" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "response" TEXT,
    "respondedAt" DATETIME,
    "escalationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Checkpoint_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskTierEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "previousTier" TEXT NOT NULL,
    "newTier" TEXT NOT NULL,
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "recommendedAction" TEXT,
    "ruleVersion" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskTierEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskRuleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "RiskRuleVersion_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorOrganization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupArrangement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeOccurrenceId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "arrangementType" TEXT NOT NULL,
    "availabilityWindow" TEXT NOT NULL DEFAULT '{}',
    "activationDeadline" DATETIME,
    "incentive" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'OFFERED',
    "sentAt" DATETIME,
    "openedAt" DATETIME,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackupArrangement_routeOccurrenceId_fkey" FOREIGN KEY ("routeOccurrenceId") REFERENCES "RouteOccurrence" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BackupArrangement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeOccurrenceId" TEXT NOT NULL,
    "originalAssignmentId" TEXT NOT NULL,
    "backupArrangementId" TEXT,
    "replacementAssignmentId" TEXT,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dispatcherOwnerId" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "recoveryDurationSeconds" INTEGER,
    "recoveryMethod" TEXT,
    CONSTRAINT "RecoveryCase_routeOccurrenceId_fkey" FOREIGN KEY ("routeOccurrenceId") REFERENCES "RouteOccurrence" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecoveryCase_backupArrangementId_fkey" FOREIGN KEY ("backupArrangementId") REFERENCES "BackupArrangement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recoveryCaseId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONTACTED',
    "matchFactors" TEXT NOT NULL DEFAULT '{}',
    "outreachAt" DATETIME,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoveryCandidate_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CancellationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "structuredReason" TEXT NOT NULL,
    "freeTextNote" TEXT,
    "eventTimestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutesBeforeStart" INTEGER,
    "reportedBy" TEXT,
    "selfReported" BOOLEAN NOT NULL DEFAULT false,
    "backupAvailable" BOOLEAN NOT NULL DEFAULT false,
    "backupActivated" BOOLEAN NOT NULL DEFAULT false,
    "replacementNeeded" BOOLEAN NOT NULL DEFAULT false,
    "recoveryResult" TEXT,
    "finalRouteOutcome" TEXT,
    "shipperImpact" TEXT,
    "customerVisibleExplanation" TEXT,
    CONSTRAINT "CancellationEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncentiveProgram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rules" TEXT NOT NULL DEFAULT '{}',
    "amount" REAL,
    "nonCashBenefit" TEXT,
    "activeStatus" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncentiveProgram_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorOrganization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncentiveLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "programId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" REAL,
    "settlementExportStatus" TEXT NOT NULL DEFAULT 'NOT_EXPORTED',
    "operatorSettlementReference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncentiveLedgerEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IncentiveLedgerEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncentiveLedgerEntry_programId_fkey" FOREIGN KEY ("programId") REFERENCES "IncentiveProgram" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "template" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" DATETIME,
    "deliveredAt" DATETIME,
    "response" TEXT,
    "isOptOutEvent" BOOLEAN NOT NULL DEFAULT false,
    "secureToken" TEXT,
    "secureTokenExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Message_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipperCommitmentStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeOccurrenceId" TEXT NOT NULL,
    "visibleState" TEXT NOT NULL DEFAULT 'OFFER_PENDING',
    "stateReason" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextMilestone" TEXT,
    "operatorOwnerId" TEXT,
    "shipperActionRequired" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ShipperCommitmentStatus_routeOccurrenceId_fkey" FOREIGN KEY ("routeOccurrenceId") REFERENCES "RouteOccurrence" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShipperScorecard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipperId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "reportingPeriodStart" TEXT NOT NULL,
    "reportingPeriodEnd" TEXT NOT NULL,
    "metricsSnapshot" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipperScorecard_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "ShipperOrganization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "operatorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeState" TEXT,
    "afterState" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorOrganization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorShipperRelationship_operatorId_shipperId_key" ON "OperatorShipperRelationship"("operatorId", "shipperId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPoolMembership_poolId_driverId_key" ON "DriverPoolMembership"("poolId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Route_operatorId_routeCode_key" ON "Route"("operatorId", "routeCode");

-- CreateIndex
CREATE UNIQUE INDEX "RouteDetailVersion_routeId_version_key" ON "RouteDetailVersion"("routeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RouteOccurrence_routeId_serviceDate_key" ON "RouteOccurrence"("routeId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Message_secureToken_key" ON "Message"("secureToken");

-- CreateIndex
CREATE UNIQUE INDEX "ShipperCommitmentStatus_routeOccurrenceId_key" ON "ShipperCommitmentStatus"("routeOccurrenceId");
