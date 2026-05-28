"use client";

import { useActionState, useRef, useState } from "react";
import type { SubmitClaimState } from "@/lib/actions/submitClaim";
import { submitClaim } from "@/lib/actions/submitClaim";

const CLAIM_CATEGORIES = [
  "CONSULTATION",
  "DIAGNOSTIC",
  "PHARMACY",
  "DENTAL",
  "VISION",
  "ALTERNATIVE_MEDICINE",
] as const;

type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

// Mirrors policy_terms.json document_requirements exactly
const DOC_REQUIREMENTS: Record<ClaimCategory, { required: string[]; optional: string[] }> = {
  CONSULTATION:         { required: ["PRESCRIPTION", "HOSPITAL_BILL"],                    optional: ["LAB_REPORT", "DIAGNOSTIC_REPORT"] },
  DIAGNOSTIC:           { required: ["PRESCRIPTION", "LAB_REPORT", "HOSPITAL_BILL"],       optional: ["DISCHARGE_SUMMARY"] },
  PHARMACY:             { required: ["PRESCRIPTION", "PHARMACY_BILL"],                     optional: [] },
  DENTAL:               { required: ["HOSPITAL_BILL"],                                     optional: ["PRESCRIPTION", "DENTAL_REPORT"] },
  VISION:               { required: ["PRESCRIPTION", "HOSPITAL_BILL"],                     optional: [] },
  ALTERNATIVE_MEDICINE: { required: ["PRESCRIPTION", "HOSPITAL_BILL"],                     optional: [] },
};

const DOC_INFO: Record<string, { label: string; description: string }> = {
  PRESCRIPTION: {
    label: "Prescription",
    description:
      "Doctor's prescription showing diagnosis, medications prescribed, doctor's name and registration number, clinic name, and date. Must be dated on or before the treatment date.",
  },
  HOSPITAL_BILL: {
    label: "Hospital Bill",
    description:
      "Itemised bill from the hospital or clinic listing procedures, consultation fees, and total amount charged. Must clearly show patient name, date of treatment, and hospital letterhead or stamp.",
  },
  LAB_REPORT: {
    label: "Lab Report",
    description:
      "Laboratory test results with patient name, test names, values, reference ranges, and the lab's name/stamp. The referring doctor's name should also be present.",
  },
  PHARMACY_BILL: {
    label: "Pharmacy Bill",
    description:
      "Chemist or pharmacy receipt listing medication names, quantities, unit prices, batch numbers, and total amount paid. GST invoice preferred.",
  },
  DENTAL_REPORT: {
    label: "Dental Report",
    description:
      "Dentist's clinical notes or dental chart specifying the procedure performed (e.g. root canal, extraction, filling), the tooth or quadrant affected, and the treating dentist's registration number.",
  },
  DIAGNOSTIC_REPORT: {
    label: "Diagnostic Report",
    description:
      "Imaging or diagnostic report (X-ray, MRI, CT scan, ultrasound, ECG) with the radiologist's or specialist's findings, patient details, and the centre's stamp. Pre-authorisation certificate required for reports above ₹10,000.",
  },
  DISCHARGE_SUMMARY: {
    label: "Discharge Summary",
    description:
      "Hospital discharge document showing admission and discharge dates, primary diagnosis, treatment given, medications at discharge, and the treating doctor's signature.",
  },
};

const CATEGORY_NOTES: Partial<Record<ClaimCategory, string>> = {
  DIAGNOSTIC:
    "Pre-authorisation is required for MRI, CT Scan, and PET Scan above ₹10,000. Attach the pre-auth certificate along with your documents.",
  DENTAL:
    "Cosmetic procedures (teeth whitening, veneers) are excluded. Only medically necessary dental treatment is covered.",
  ALTERNATIVE_MEDICINE:
    "Only treatments from AYUSH-registered practitioners are covered. Ensure the prescription includes the practitioner's AYUSH registration number.",
};

interface Props {
  userRole: string;
  memberId?: string | null;
  memberIds: string[];
}

const initialState: SubmitClaimState = {};

export function ClaimSubmissionForm({ userRole, memberId, memberIds }: Props) {
  const [state, formAction, pending] = useActionState(submitClaim, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<ClaimCategory | "">("");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [documentTypes, setDocumentTypes] = useState<string[]>([]);

  const requirements = selectedCategory ? DOC_REQUIREMENTS[selectedCategory] : null;

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div id="form-error" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Member picker for OPS users */}
      {userRole === "OPS" && (
        <div>
          <label htmlFor="memberId" className="block text-sm font-medium text-gray-700 mb-1">
            Member
          </label>
          <select
            id="memberId"
            name="memberId"
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select member…</option>
            {memberIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Hidden member ID for MEMBER users */}
      {userRole === "MEMBER" && memberId && (
        <input type="hidden" name="memberId" value={memberId} />
      )}

      {/* Claim Category */}
      <div>
        <label htmlFor="claimCategory" className="block text-sm font-medium text-gray-700 mb-1">
          Claim Category
        </label>
        <select
          id="claimCategory"
          name="claimCategory"
          required
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as ClaimCategory | "")}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select category…</option>
          {CLAIM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {/* Document requirements panel — shown as soon as a category is chosen */}
      {requirements && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-900">Documents required for this claim</p>

          {/* Required */}
          <ul className="space-y-2">
            {requirements.required.map((type) => {
              const info = DOC_INFO[type];
              return (
                <li key={type} className="flex gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 h-4 w-4 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M1.5 5.5 4 8l4.5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {info.label} <span className="text-xs font-normal text-green-700 ml-1">required</span>
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">{info.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Optional */}
          {requirements.optional.length > 0 && (
            <ul className="space-y-2 pt-1 border-t border-blue-100">
              {requirements.optional.map((type) => {
                const info = DOC_INFO[type];
                return (
                  <li key={type} className="flex gap-2.5">
                    <span className="mt-0.5 flex-shrink-0 h-4 w-4 rounded-full border-2 border-gray-300 bg-white" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {info.label} <span className="text-xs font-normal text-gray-400 ml-1">optional</span>
                      </p>
                      <p className="text-xs text-gray-400 leading-relaxed">{info.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Category-specific notes */}
          {CATEGORY_NOTES[selectedCategory as ClaimCategory] && (
            <div className="flex gap-2 pt-1 border-t border-blue-100">
              <svg className="flex-shrink-0 h-4 w-4 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-xs text-amber-800">{CATEGORY_NOTES[selectedCategory as ClaimCategory]}</p>
            </div>
          )}

          {/* Always-on reminder */}
          <p className="text-xs text-blue-700 pt-1 border-t border-blue-100">
            All documents must show the <strong>same patient name</strong>. Accepted formats: JPEG, PNG, PDF.
          </p>
        </div>
      )}

      {/* Treatment Date + Amount */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="treatmentDate" className="block text-sm font-medium text-gray-700 mb-1">
            Treatment Date
          </label>
          <input
            id="treatmentDate"
            name="treatmentDate"
            type="date"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="claimedAmount" className="block text-sm font-medium text-gray-700 mb-1">
            Claimed Amount (₹)
          </label>
          <input
            id="claimedAmount"
            name="claimedAmount"
            type="number"
            min="1"
            step="1"
            required
            placeholder="e.g. 5000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Hospital Name */}
      <div>
        <label htmlFor="hospitalName" className="block text-sm font-medium text-gray-700 mb-1">
          Hospital / Provider Name <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="hospitalName"
          name="hospitalName"
          type="text"
          placeholder="e.g. Apollo Hospitals"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Document Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Supporting Documents
        </label>
        <div
          className="relative rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            id="documents"
            name="documents"
            type="file"
            multiple
            accept="image/jpeg,image/png,application/pdf"
            required
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setFileNames(files.map((f) => f.name));
              setDocumentTypes(new Array(files.length).fill(""));
            }}
          />
          <svg
            className="mx-auto mb-2 h-8 w-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          {fileNames.length === 0 ? (
            <>
              <p className="text-sm text-gray-600">
                Click to upload or drag &amp; drop
              </p>
              <p className="text-xs text-gray-400 mt-1">JPEG, PNG, PDF — multiple files allowed</p>
            </>
          ) : (
            <p className="text-sm text-blue-700 font-medium">
              {fileNames.length} file{fileNames.length > 1 ? "s" : ""} selected
            </p>
          )}
        </div>
      </div>

      {/* Per-file document type selectors */}
      {fileNames.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Identify each document</p>
          {fileNames.map((name, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="flex-1 truncate text-sm text-gray-600" title={name}>
                {name}
              </span>
              <select
                name={`documentType_${i}`}
                required
                value={documentTypes[i] ?? ""}
                onChange={(e) => {
                  const updated = [...documentTypes];
                  updated[i] = e.target.value;
                  setDocumentTypes(updated);
                }}
                className="w-52 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="" disabled>Select document type…</option>
                <option value="PRESCRIPTION">Prescription</option>
                <option value="HOSPITAL_BILL">Hospital Bill</option>
                <option value="LAB_REPORT">Lab Report</option>
                <option value="PHARMACY_BILL">Pharmacy Bill</option>
                <option value="DENTAL_REPORT">Dental Report</option>
                <option value="DIAGNOSTIC_REPORT">Diagnostic Report</option>
                <option value="DISCHARGE_SUMMARY">Discharge Summary</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Submit */}
      <button
        id="submit-claim"
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Processing…
          </span>
        ) : (
          "Submit Claim"
        )}
      </button>
    </form>
  );
}
