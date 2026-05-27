-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MEMBER', 'OPS');

-- CreateEnum
CREATE TYPE "ClaimCategory" AS ENUM ('CONSULTATION', 'DIAGNOSTIC', 'PHARMACY', 'DENTAL', 'VISION', 'ALTERNATIVE_MEDICINE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PRESCRIPTION', 'HOSPITAL_BILL', 'LAB_REPORT', 'PHARMACY_BILL', 'DENTAL_REPORT', 'DIAGNOSTIC_REPORT', 'DISCHARGE_SUMMARY');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('HALTED', 'APPROVED', 'PARTIAL', 'REJECTED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "DocumentQuality" AS ENUM ('GOOD', 'POOR', 'UNREADABLE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "memberId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "claimCategory" "ClaimCategory" NOT NULL,
    "treatmentDate" TIMESTAMP(3) NOT NULL,
    "claimedAmount" DECIMAL(12,2) NOT NULL,
    "hospitalName" TEXT,
    "submittedBy" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL,
    "approvedAmount" DECIMAL(12,2),
    "decisionTrace" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "actualType" "DocumentType" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT NOT NULL,
    "cloudinaryUrl" TEXT NOT NULL,
    "quality" "DocumentQuality",
    "patientNameOnDoc" TEXT,
    "extractedContent" JSONB,
    "confidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_memberId_key" ON "User"("memberId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Claim_memberId_createdAt_idx" ON "Claim"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_submittedBy_createdAt_idx" ON "Claim"("submittedBy", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_status_createdAt_idx" ON "Claim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Document_claimId_idx" ON "Document"("claimId");

-- CreateIndex
CREATE INDEX "Document_uploadedBy_idx" ON "Document"("uploadedBy");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("memberId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
