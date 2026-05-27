import policyData from "../../policy_terms.json";
import type { ClaimCategory, DocumentType } from "@/lib/types";

export type PolicyData = typeof policyData;

// Cached at module load time — file is read-only at runtime
const policy = policyData;

export function getPolicy() {
  return policy;
}

export function getMember(memberId: string) {
  return policy.members.find((m) => m.member_id === memberId) ?? null;
}

export function getCategory(category: ClaimCategory) {
  return (policy.opd_categories as Record<string, unknown>)[
    category.toLowerCase()
  ] as (typeof policy.opd_categories)[keyof typeof policy.opd_categories] | undefined;
}

export function getDocumentRequirements(category: ClaimCategory): {
  required: DocumentType[];
  optional: DocumentType[];
} {
  const req = (policy.document_requirements as Record<string, { required: string[]; optional: string[] }>)[category];
  if (!req) return { required: [], optional: [] };
  return {
    required: req.required as DocumentType[],
    optional: req.optional as DocumentType[],
  };
}

export function isNetworkHospital(hospitalName: string): boolean {
  return policy.network_hospitals.some(
    (h) => h.toLowerCase() === hospitalName.toLowerCase()
  );
}

export function getFraudThresholds() {
  return policy.fraud_thresholds;
}

export function getWaitingPeriods() {
  return policy.waiting_periods;
}

export function getExclusions() {
  return policy.exclusions;
}

export function getSubmissionRules() {
  return policy.submission_rules;
}

export function getPreAuthRules() {
  return policy.pre_authorization;
}

export function getPolicyCoverage() {
  return policy.coverage;
}
