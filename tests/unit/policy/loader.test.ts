import { describe, it, expect } from "vitest";
import {
  getPolicy,
  getMember,
  getDocumentRequirements,
  isNetworkHospital,
  getCategory,
} from "@/lib/policy/loader";

describe("policy loader", () => {
  it("loads the policy without throwing", () => {
    const policy = getPolicy();
    expect(policy.policy_id).toBe("PLUM_GHI_2024");
    expect(policy.members.length).toBeGreaterThan(0);
  });

  it("resolves a known member", () => {
    const member = getMember("EMP001");
    expect(member).not.toBeNull();
    expect(member?.name).toBe("Rajesh Kumar");
  });

  it("returns null for an unknown member", () => {
    expect(getMember("UNKNOWN")).toBeNull();
  });

  it("returns document requirements for CONSULTATION", () => {
    const req = getDocumentRequirements("CONSULTATION");
    expect(req.required).toContain("PRESCRIPTION");
    expect(req.required).toContain("HOSPITAL_BILL");
  });

  it("recognises a network hospital", () => {
    expect(isNetworkHospital("Apollo Hospitals")).toBe(true);
    expect(isNetworkHospital("Some Random Clinic")).toBe(false);
  });

  it("resolves a coverage category", () => {
    const cat = getCategory("CONSULTATION");
    expect(cat).toBeDefined();
    expect((cat as { covered: boolean }).covered).toBe(true);
  });
});
