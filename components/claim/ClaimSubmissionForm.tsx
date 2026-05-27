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

interface Props {
  userRole: string;
  memberId?: string | null;
  memberIds: string[];
}

const initialState: SubmitClaimState = {};

export function ClaimSubmissionForm({ userRole, memberId, memberIds }: Props) {
  const [state, formAction, pending] = useActionState(submitClaim, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);

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
              const names = Array.from(e.target.files ?? []).map((f) => f.name);
              setFileNames(names);
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
            <ul className="text-sm text-blue-700 space-y-1">
              {fileNames.map((name, i) => (
                <li key={i} className="font-medium">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
