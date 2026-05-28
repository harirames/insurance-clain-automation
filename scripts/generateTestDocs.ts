/**
 * Generates realistic HTML medical documents for all 12 test cases (TC001–TC012).
 * Each document can be opened in a browser and printed to PDF for upload testing.
 *
 * Usage:  npx tsx scripts/generateTestDocs.ts
 * Output: tests/fixtures/documents/
 */

import fs from "fs";
import path from "path";

const OUT = path.resolve(__dirname, "../tests/fixtures/documents");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ─── Shared styles ────────────────────────────────────────────────────────────

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #111; background: #fff; padding: 32px 40px; max-width: 700px; margin: 0 auto; }
  .letterhead { border-bottom: 3px double #333; padding-bottom: 10px; margin-bottom: 16px; }
  .lh-name { font-size: 20px; font-weight: bold; letter-spacing: 1px; }
  .lh-sub { font-size: 11px; color: #444; margin-top: 2px; }
  .lh-reg { font-size: 10px; color: #666; margin-top: 4px; }
  .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .label { font-size: 11px; color: #555; }
  .value { font-weight: bold; }
  .section { margin-top: 14px; }
  .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #666; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 8px; }
  .rx { font-size: 18px; font-style: italic; font-weight: bold; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f0f0f0; font-size: 11px; text-align: left; padding: 5px 8px; border: 1px solid #ccc; }
  td { padding: 5px 8px; border: 1px solid #ccc; font-size: 11px; }
  .total-row td { font-weight: bold; background: #f9f9f9; }
  .stamp { display: inline-block; border: 2px solid #1a5276; color: #1a5276; border-radius: 50%; width: 80px; height: 80px; line-height: 1.2; text-align: center; padding-top: 18px; font-size: 9px; font-weight: bold; margin-top: 8px; }
  .sig-block { margin-top: 24px; }
  .sig-line { border-top: 1px solid #333; width: 160px; margin-top: 32px; font-size: 10px; padding-top: 3px; }
  .footer { margin-top: 20px; font-size: 9px; color: #888; border-top: 1px solid #eee; padding-top: 6px; text-align: center; }
  .warn { background: #fff3cd; border: 1px solid #ffc107; padding: 6px 10px; font-size: 11px; border-radius: 3px; margin-top: 10px; }
  .blurry { filter: blur(3px) contrast(0.6); opacity: 0.5; }
  @media print { body { padding: 0; } button { display: none !important; } }
`;

const PRINT_BTN = `<button onclick="window.print()" style="position:fixed;top:12px;right:12px;background:#1a5276;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13px;z-index:999;">🖨 Print / Save PDF</button>`;

function page(content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${BASE_CSS}</style></head><body>${PRINT_BTN}${content}</body></html>`;
}

// ─── Document builders ────────────────────────────────────────────────────────

function prescription({
  doctorName,
  qualification = "MBBS, MD",
  registration,
  clinic,
  address,
  patientName,
  age = "",
  date,
  diagnosis,
  medicines,
  notes = "",
  testsOrdered = [],
}: {
  doctorName: string;
  qualification?: string;
  registration: string;
  clinic: string;
  address?: string;
  patientName: string;
  age?: string;
  date: string;
  diagnosis: string;
  medicines?: string[];
  notes?: string;
  testsOrdered?: string[];
}): string {
  const medRows = (medicines ?? [])
    .map(
      (m, i) =>
        `<tr><td>${i + 1}</td><td>${m}</td><td>As directed</td><td>5 days</td></tr>`,
    )
    .join("");

  const testRows = testsOrdered
    .map((t) => `<li style="margin-bottom:4px;">${t}</li>`)
    .join("");

  return page(`
    <div class="letterhead">
      <div class="row">
        <div>
          <div class="lh-name">${doctorName}</div>
          <div class="lh-sub">${qualification}</div>
          <div class="lh-reg">Reg. No: ${registration}</div>
        </div>
        <div style="text-align:right;">
          <div class="lh-name" style="font-size:15px;">${clinic}</div>
          <div class="lh-sub">${address ?? "Bengaluru, Karnataka"}</div>
          <div class="lh-sub">Timings: Mon–Sat 9:00 AM – 7:00 PM</div>
        </div>
      </div>
    </div>

    <div class="row">
      <span><span class="label">Patient Name: </span><span class="value">${patientName}${age ? ` (${age})` : ""}</span></span>
      <span><span class="label">Date: </span><span class="value">${date}</span></span>
    </div>
    <div class="row" style="margin-top:4px;">
      <span><span class="label">Diagnosis: </span><span class="value">${diagnosis}</span></span>
    </div>

    ${
      medicines?.length
        ? `
    <div class="section">
      <div class="rx">℞</div>
      <table>
        <thead><tr><th>#</th><th>Medicine</th><th>Dosage Instructions</th><th>Duration</th></tr></thead>
        <tbody>${medRows}</tbody>
      </table>
    </div>`
        : ""
    }

    ${
      testsOrdered.length
        ? `
    <div class="section">
      <div class="section-title">Tests Ordered</div>
      <ul style="padding-left:18px; list-style:disc;">${testRows}</ul>
    </div>`
        : ""
    }

    ${notes ? `<div class="warn">Note: ${notes}</div>` : ""}

    <div class="sig-block">
      <div class="row">
        <div class="stamp">${doctorName.split(" ").pop()}<br>Clinic<br>Seal</div>
        <div style="text-align:right;">
          <div class="sig-line">${doctorName}<br>Reg. ${registration}</div>
        </div>
      </div>
    </div>

    <div class="footer">Valid for 30 days from date of issue. This prescription is for medical use only.</div>
  `);
}

function hospitalBill({
  hospitalName,
  address,
  gstin = "29AABCU9603R1ZM",
  invoiceNo,
  patientName,
  uhid,
  date,
  lineItems,
  total,
  blurry = false,
}: {
  hospitalName: string;
  address?: string;
  gstin?: string;
  invoiceNo: string;
  patientName: string;
  uhid?: string;
  date: string;
  lineItems: { description: string; amount: number }[];
  total: number;
  blurry?: boolean;
}): string {
  const rows = lineItems
    .map(
      (li, i) =>
        `<tr><td>${i + 1}</td><td>${li.description}</td><td style="text-align:right;">₹${li.amount.toLocaleString("en-IN")}</td></tr>`,
    )
    .join("");

  const gst = Math.round(total * 0.05);
  const grandTotal = total + gst;

  const content = `
    <div class="letterhead" style="text-align:center;">
      <div class="lh-name">${hospitalName}</div>
      <div class="lh-sub">${address ?? "No. 12, Medical Centre Road, Bengaluru – 560 001"}</div>
      <div class="lh-reg">GSTIN: ${gstin} | Ph: 080-4567-8901</div>
    </div>

    <div style="text-align:center; font-size:14px; font-weight:bold; margin-bottom:12px;">PATIENT BILL / RECEIPT</div>

    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
      <div>
        <div><span class="label">Patient Name: </span><strong>${patientName}</strong></div>
        ${uhid ? `<div><span class="label">UHID: </span>${uhid}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div><span class="label">Invoice No: </span><strong>${invoiceNo}</strong></div>
        <div><span class="label">Date: </span><strong>${date}</strong></div>
      </div>
    </div>

    <table>
      <thead><tr><th>#</th><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>
        ${rows}
        <tr><td colspan="2" style="text-align:right; font-size:11px; color:#555;">Sub-Total</td><td style="text-align:right;">₹${total.toLocaleString("en-IN")}</td></tr>
        <tr><td colspan="2" style="text-align:right; font-size:11px; color:#555;">GST (5%)</td><td style="text-align:right;">₹${gst.toLocaleString("en-IN")}</td></tr>
      </tbody>
      <tfoot><tr class="total-row"><td colspan="2" style="text-align:right;">GRAND TOTAL</td><td style="text-align:right;">₹${grandTotal.toLocaleString("en-IN")}</td></tr></tfoot>
    </table>

    <div class="sig-block row">
      <div>
        <div class="stamp">${hospitalName.split(" ")[0]}<br>Official<br>Seal</div>
      </div>
      <div style="text-align:right;">
        <div class="sig-line">Authorised Signatory</div>
      </div>
    </div>

    <div class="footer">This is a computer-generated bill. For queries: billing@${hospitalName.toLowerCase().replace(/\s+/g, "")}.in</div>
  `;

  return page(
    blurry
      ? `<div class="blurry">${content}</div><div class="warn" style="margin-top:40px;">⚠ Document quality is poor — please re-upload a clearer scan.</div>`
      : content,
  );
}

function labReport({
  labName,
  nabl,
  patientName,
  refDoctor,
  date,
  testName,
  results,
}: {
  labName: string;
  nabl?: string;
  patientName: string;
  refDoctor: string;
  date: string;
  testName: string;
  results: {
    parameter: string;
    value: string;
    unit: string;
    reference: string;
    flag?: string;
  }[];
}): string {
  const rows = results
    .map(
      (r) =>
        `<tr>
          <td>${r.parameter}</td>
          <td style="font-weight:${r.flag ? "bold" : "normal"}; color:${r.flag === "H" ? "#c0392b" : r.flag === "L" ? "#1a5276" : "inherit"};">${r.value} ${r.flag ? `<sup>${r.flag}</sup>` : ""}</td>
          <td>${r.unit}</td>
          <td>${r.reference}</td>
        </tr>`,
    )
    .join("");

  return page(`
    <div class="letterhead" style="text-align:center;">
      <div class="lh-name">${labName}</div>
      <div class="lh-sub">NABL Accredited Laboratory${nabl ? ` — Accreditation No. ${nabl}` : ""}</div>
    </div>

    <div style="text-align:center; font-size:13px; font-weight:bold; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px;">${testName}</div>

    <div class="row" style="margin-bottom:12px;">
      <div>
        <div><span class="label">Patient: </span><strong>${patientName}</strong></div>
        <div><span class="label">Ref. Doctor: </span>${refDoctor}</div>
      </div>
      <div style="text-align:right;">
        <div><span class="label">Date: </span><strong>${date}</strong></div>
        <div><span class="label">Sample: </span>Blood (Venous)</div>
      </div>
    </div>

    <table>
      <thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference Range</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="font-size:10px; color:#888; margin-top:6px;"><sup>H</sup> = High &nbsp; <sup>L</sup> = Low</div>

    <div class="sig-block row" style="margin-top:20px;">
      <div>
        <div class="stamp">${labName.split(" ")[0]}<br>Lab<br>Seal</div>
      </div>
      <div style="text-align:right;">
        <div class="sig-line">Lab Director / Pathologist</div>
      </div>
    </div>

    <div class="footer">Results are for diagnostic purposes only. Correlate with clinical findings.</div>
  `);
}

function pharmacyBill({
  pharmacyName,
  address,
  gstin,
  patientName,
  prescriptionNo,
  date,
  items,
}: {
  pharmacyName: string;
  address?: string;
  gstin?: string;
  patientName: string;
  prescriptionNo: string;
  date: string;
  items: { name: string; qty: number; rate: number }[];
}): string {
  const rows = items
    .map(
      (item, i) =>
        `<tr>
          <td>${i + 1}</td>
          <td>${item.name}</td>
          <td style="text-align:center;">${item.qty}</td>
          <td style="text-align:right;">₹${item.rate}</td>
          <td style="text-align:right;">₹${(item.qty * item.rate).toLocaleString("en-IN")}</td>
        </tr>`,
    )
    .join("");

  const total = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const gst = Math.round(total * 0.12);

  return page(`
    <div class="letterhead" style="text-align:center;">
      <div class="lh-name">${pharmacyName}</div>
      <div class="lh-sub">${address ?? "Licensed Retail Chemist"}</div>
      ${gstin ? `<div class="lh-reg">GSTIN: ${gstin} | Drug Lic. No: KA-B-123456</div>` : ""}
    </div>

    <div style="text-align:center; font-weight:bold; margin-bottom:10px;">PHARMACY BILL / RETAIL INVOICE</div>

    <div class="row" style="margin-bottom:10px;">
      <div><span class="label">Patient: </span><strong>${patientName}</strong></div>
      <div style="text-align:right;">
        <div><span class="label">Rx No: </span>${prescriptionNo}</div>
        <div><span class="label">Date: </span><strong>${date}</strong></div>
      </div>
    </div>

    <table>
      <thead><tr><th>#</th><th>Medicine / Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>
        ${rows}
        <tr><td colspan="4" style="text-align:right; font-size:11px;">Sub-Total</td><td style="text-align:right;">₹${total.toLocaleString("en-IN")}</td></tr>
        <tr><td colspan="4" style="text-align:right; font-size:11px;">GST (12%)</td><td style="text-align:right;">₹${gst.toLocaleString("en-IN")}</td></tr>
      </tbody>
      <tfoot><tr class="total-row"><td colspan="4" style="text-align:right;">NET PAYABLE</td><td style="text-align:right;">₹${(total + gst).toLocaleString("en-IN")}</td></tr></tfoot>
    </table>

    <div class="sig-block row" style="margin-top:16px;">
      <div><div class="stamp">${pharmacyName.split(" ")[0]}<br>Pharmacy<br>Seal</div></div>
      <div style="text-align:right;"><div class="sig-line">Pharmacist (Reg. Chemist)</div></div>
    </div>

    <div class="footer">Keep this bill for your records. For returns/queries within 48 hours of purchase.</div>
  `);
}

// ─── Generate all documents ───────────────────────────────────────────────────

function write(filename: string, content: string) {
  const out = path.join(OUT, filename);
  fs.writeFileSync(out, content, "utf8");
  console.log("✓", filename);
}

// TC001 — Wrong document type: two PRESCRIPTIONs, no hospital bill
write(
  "TC001_F001_prescription.html",
  prescription({
    doctorName: "Dr. Arun Sharma",
    registration: "KA/45678/2015",
    clinic: "City Clinic",
    address: "MG Road, Bengaluru – 560 001",
    patientName: "Rajesh Kumar",
    age: "34 yrs",
    date: "2024-11-01",
    diagnosis: "Viral Fever",
    medicines: [
      "Paracetamol 650mg – 1 tab TID × 5 days",
      "Vitamin C 500mg – 1 tab OD × 5 days",
    ],
  }),
);

write(
  "TC001_F002_prescription_duplicate.html",
  prescription({
    doctorName: "Dr. Arun Sharma",
    registration: "KA/45678/2015",
    clinic: "City Clinic",
    address: "MG Road, Bengaluru – 560 001",
    patientName: "Rajesh Kumar",
    age: "34 yrs",
    date: "2024-11-01",
    diagnosis: "Viral Fever — Follow-up",
    medicines: ["Cetirizine 10mg – 1 tab HS × 3 days", "Paracetamol 500mg PRN"],
    notes: "",
  }),
);

// TC002 — Unreadable (blurry) pharmacy bill
write(
  "TC002_F003_prescription.html",
  prescription({
    doctorName: "Dr. Meena Pillai",
    registration: "KL/23456/2016",
    clinic: "HealthCare Clinic",
    address: "Anna Nagar, Chennai",
    patientName: "Neha Singh",
    age: "28 yrs",
    date: "2024-10-25",
    diagnosis: "Upper Respiratory Tract Infection",
    medicines: [
      "Azithromycin 500mg – 1 tab OD × 3 days",
      "Cetirizine 10mg – 1 tab HS × 5 days",
    ],
  }),
);

write(
  "TC002_F004_pharmacy_bill_blurry.html",
  hospitalBill({
    hospitalName: "MedPlus Pharmacy",
    address: "Anna Nagar East, Chennai – 600 040",
    invoiceNo: "RX-2024-7821",
    patientName: "Neha Singh",
    date: "2024-10-25",
    lineItems: [
      { description: "Azithromycin 500mg (3 tabs)", amount: 120 },
      { description: "Cetirizine 10mg (10 tabs)", amount: 45 },
      { description: "Vitamin C Sachets (5 pcs)", amount: 80 },
    ],
    total: 245,
    blurry: true,
  }),
);

// TC003 — Patient name mismatch
write(
  "TC003_F005_prescription_ravi.html",
  prescription({
    doctorName: "Dr. Arun Sharma",
    registration: "KA/45678/2015",
    clinic: "City Clinic",
    address: "MG Road, Bengaluru – 560 001",
    patientName: "Ravi Kumar",
    age: "34 yrs",
    date: "2024-11-01",
    diagnosis: "Viral Fever",
    medicines: ["Paracetamol 650mg TID", "Vitamin C 500mg OD"],
  }),
);

write(
  "TC003_F006_hospital_bill_priya.html",
  hospitalBill({
    hospitalName: "City Clinic, Bengaluru",
    invoiceNo: "INV-2024-1145",
    patientName: "Priya Menon", // ← different patient name — triggers TC003
    date: "2024-11-01",
    lineItems: [
      { description: "Consultation Fee", amount: 1000 },
      { description: "CBC Test", amount: 300 },
      { description: "Dengue NS1 Test", amount: 200 },
    ],
    total: 1500,
  }),
);

// TC004 — Clean consultation approval (EMP001, Rajesh Kumar, ₹1500)
write(
  "TC004_F007_prescription.html",
  prescription({
    doctorName: "Dr. Arun Sharma",
    registration: "KA/45678/2015",
    clinic: "City Clinic",
    address: "MG Road, Bengaluru – 560 001",
    patientName: "Rajesh Kumar",
    age: "34 yrs",
    date: "2024-11-01",
    diagnosis: "Viral Fever",
    medicines: [
      "Paracetamol 650mg – 1 tab TID × 5 days",
      "Vitamin C 500mg – 1 tab OD × 5 days",
    ],
  }),
);

write(
  "TC004_F008_hospital_bill.html",
  hospitalBill({
    hospitalName: "City Clinic, Bengaluru",
    address: "MG Road, Bengaluru – 560 001",
    invoiceNo: "INV-2024-1144",
    patientName: "Rajesh Kumar",
    uhid: "CC-EMP001-2024",
    date: "2024-11-01",
    lineItems: [
      { description: "Consultation Fee", amount: 1000 },
      { description: "CBC Test", amount: 300 },
      { description: "Dengue NS1 Test", amount: 200 },
    ],
    total: 1500,
  }),
);

// TC005 — Waiting period: diabetes, EMP005 Vikram Joshi, ₹3000
write(
  "TC005_F009_prescription.html",
  prescription({
    doctorName: "Dr. Sunil Mehta",
    registration: "GJ/56789/2014",
    clinic: "Mehta Diabetes Clinic",
    address: "SG Highway, Ahmedabad",
    patientName: "Vikram Joshi",
    age: "52 yrs",
    date: "2024-10-15",
    diagnosis: "Type 2 Diabetes Mellitus",
    medicines: [
      "Metformin 500mg – 1 tab BD × 30 days",
      "Glimepiride 1mg – 1 tab OD before breakfast",
    ],
    notes: "HbA1c 7.8% — dietary modification advised. Review in 30 days.",
  }),
);

write(
  "TC005_F010_hospital_bill.html",
  hospitalBill({
    hospitalName: "Mehta Diabetes Clinic",
    address: "SG Highway, Ahmedabad – 380 054",
    invoiceNo: "INV-2024-0921",
    patientName: "Vikram Joshi",
    uhid: "MDC-EMP005-2024",
    date: "2024-10-15",
    lineItems: [
      { description: "Specialist Consultation", amount: 800 },
      { description: "HbA1c Test", amount: 700 },
      { description: "Fasting Blood Sugar", amount: 200 },
      { description: "Lipid Profile", amount: 600 },
      { description: "Medications (Metformin + Glimepiride)", amount: 700 },
    ],
    total: 3000,
  }),
);

// TC006 — Dental: Root Canal (covered) + Teeth Whitening (excluded)
write(
  "TC006_F011_dental_bill.html",
  hospitalBill({
    hospitalName: "Smile Dental Clinic",
    address: "Koramangala, Bengaluru – 560 034",
    gstin: "29AABCD5678G1ZP",
    invoiceNo: "DENT-2024-0456",
    patientName: "Priya Singh",
    uhid: "SDC-EMP002-2024",
    date: "2024-10-15",
    lineItems: [
      {
        description: "Root Canal Treatment – Tooth #36 (Lower Left Molar)",
        amount: 8000,
      },
      {
        description: "Teeth Whitening (Cosmetic — Patient-elected)",
        amount: 4000,
      },
    ],
    total: 12000,
  }),
);

// TC007 — MRI without pre-auth (DIAGNOSTIC, ₹15000)
write(
  "TC007_F012_prescription.html",
  prescription({
    doctorName: "Dr. Venkat Rao",
    registration: "AP/67890/2017",
    clinic: "Spine & Neurology Centre",
    address: "Banjara Hills, Hyderabad",
    patientName: "Suresh Nair",
    age: "45 yrs",
    date: "2024-11-02",
    diagnosis: "Suspected Lumbar Disc Herniation (L4–L5)",
    medicines: [
      "Etoricoxib 90mg – 1 tab OD × 5 days",
      "Pregabalin 75mg – 1 tab HS × 7 days",
    ],
    testsOrdered: [
      "MRI Lumbar Spine (contrast + plain)",
      "X-Ray Lumbosacral (AP & Lateral)",
    ],
    notes:
      "Pre-authorisation required for MRI above ₹10,000. Patient should arrange pre-auth from insurer before scan.",
  }),
);

write(
  "TC007_F013_mri_lab_report.html",
  labReport({
    labName: "Medscans Diagnostic Centre",
    nabl: "MC-NABL-2024-0087",
    patientName: "Suresh Nair",
    refDoctor: "Dr. Venkat Rao",
    date: "2024-11-02",
    testName: "MRI LUMBAR SPINE — REPORT",
    results: [
      {
        parameter: "L4–L5 Disc",
        value:
          "Posterior broad-based disc bulge with neural foraminal narrowing",
        unit: "",
        reference: "Normal: No disc herniation",
        flag: "H",
      },
      {
        parameter: "L5–S1 Disc",
        value: "Mild disc desiccation",
        unit: "",
        reference: "Normal: Adequate disc height",
        flag: "",
      },
      {
        parameter: "Spinal Canal",
        value: "Mild central canal stenosis at L4–L5",
        unit: "",
        reference: "Normal: No stenosis",
        flag: "H",
      },
      {
        parameter: "Conus Medullaris",
        value: "Normal at L1 level",
        unit: "",
        reference: "Normal",
        flag: "",
      },
    ],
  }),
);

write(
  "TC007_F014_hospital_bill.html",
  hospitalBill({
    hospitalName: "Medscans Diagnostic Centre",
    address: "Banjara Hills, Hyderabad – 500 034",
    gstin: "36AABCE1234H1ZQ",
    invoiceNo: "DIAG-2024-0780",
    patientName: "Suresh Nair",
    uhid: "MSC-EMP007-2024",
    date: "2024-11-02",
    lineItems: [
      { description: "MRI Lumbar Spine (Plain + Contrast)", amount: 13000 },
      { description: "Radiologist Report Charges", amount: 1500 },
      { description: "Film / CD charges", amount: 500 },
    ],
    total: 15000,
  }),
);

// TC008 — Per-claim limit exceeded (₹7500 > ₹5000)
write(
  "TC008_F015_prescription.html",
  prescription({
    doctorName: "Dr. R. Gupta",
    registration: "DL/34567/2016",
    clinic: "Gupta Medical Centre",
    address: "Lajpat Nagar, New Delhi",
    patientName: "Amit Patel",
    age: "39 yrs",
    date: "2024-10-20",
    diagnosis: "Acute Gastroenteritis with Mild Dehydration",
    medicines: [
      "Norfloxacin 400mg – 1 tab BD × 5 days",
      "Probiotics (Lactobacillus) – 1 cap TID × 7 days",
      "ORS Sachets – dissolve in 1L water after each loose stool",
    ],
  }),
);

write(
  "TC008_F016_hospital_bill.html",
  hospitalBill({
    hospitalName: "Gupta Medical Centre",
    address: "Lajpat Nagar, New Delhi – 110 024",
    invoiceNo: "GMC-2024-3341",
    patientName: "Amit Patel",
    uhid: "GMC-EMP003-2024",
    date: "2024-10-20",
    lineItems: [
      { description: "Specialist Consultation", amount: 2000 },
      { description: "IV Fluids & Administration (2 Litres)", amount: 1500 },
      { description: "Antibiotic Injection (Ceftriaxone 1g)", amount: 900 },
      { description: "Medicines & Pharmacy", amount: 2000 },
      { description: "Observation Charges (4 hours)", amount: 600 },
      { description: "Stool Culture & Sensitivity", amount: 500 },
    ],
    total: 7500,
  }),
);

// TC009 — Fraud: 4th same-day claim (EMP008)
write(
  "TC009_F017_prescription.html",
  prescription({
    doctorName: "Dr. S. Khan",
    registration: "MH/78901/2018",
    clinic: "Khan Neurology Clinic",
    address: "Andheri West, Mumbai",
    patientName: "Rajiv Menon",
    age: "41 yrs",
    date: "2024-10-30",
    diagnosis: "Migraine with Aura (G43.1)",
    medicines: [
      "Sumatriptan 50mg – 1 tab at onset, repeat after 2h if needed",
      "Naproxen 500mg – 1 tab BD × 3 days",
      "Topiramate 25mg – 1 tab HS (prophylaxis)",
    ],
  }),
);

write(
  "TC009_F018_hospital_bill.html",
  hospitalBill({
    hospitalName: "Khan Neurology Clinic",
    address: "Andheri West, Mumbai – 400 058",
    invoiceNo: "KNC-2024-1030-4",
    patientName: "Rajiv Menon",
    uhid: "KNC-EMP008-2024",
    date: "2024-10-30",
    lineItems: [
      { description: "Neurology Consultation", amount: 1500 },
      {
        description: "Migraine Injection (Metoclopramide + Paracetamol IV)",
        amount: 800,
      },
      { description: "Medicines & Pharmacy", amount: 1800 },
      { description: "ECG Charges", amount: 700 },
    ],
    total: 4800,
  }),
);

// TC010 — Network hospital discount (Apollo, ₹4500)
write(
  "TC010_F019_prescription.html",
  prescription({
    doctorName: "Dr. S. Iyer",
    registration: "TN/56789/2013",
    clinic: "Apollo Hospitals",
    address: "Greams Road, Chennai – 600 006",
    patientName: "Deepak Shah",
    age: "48 yrs",
    date: "2024-11-03",
    diagnosis: "Acute Bronchitis with mild wheeze",
    medicines: [
      "Amoxicillin 500mg – 1 cap TID × 7 days",
      "Salbutamol Inhaler (100mcg) – 2 puffs QID × 5 days",
      "Bromhexine 8mg – 1 tab TID × 7 days",
    ],
  }),
);

write(
  "TC010_F020_hospital_bill.html",
  hospitalBill({
    hospitalName: "Apollo Hospitals",
    address: "Greams Road, Chennai – 600 006",
    gstin: "33AAACP1234F1ZP",
    invoiceNo: "APOL-2024-5587",
    patientName: "Deepak Shah",
    uhid: "APL-EMP010-2024",
    date: "2024-11-03",
    lineItems: [
      { description: "Outpatient Consultation (Pulmonology)", amount: 1500 },
      { description: "Chest X-Ray (PA View)", amount: 600 },
      { description: "Nebulisation Therapy", amount: 400 },
      {
        description: "Medicines (Amoxicillin + Salbutamol Inhaler)",
        amount: 1000,
      },
      { description: "Spirometry Test", amount: 1000 },
    ],
    total: 4500,
  }),
);

// TC011 — Component failure / degradation (Alternative Medicine)
write(
  "TC011_F021_prescription.html",
  prescription({
    doctorName: "Vaidya T. Krishnan",
    qualification: "BAMS, MD (Ayurveda)",
    registration: "AYUR/KL/2345/2019",
    clinic: "Ayur Wellness Centre",
    address: "Thrissur, Kerala – 680 001",
    patientName: "Kavya Reddy",
    age: "55 yrs",
    date: "2024-10-28",
    diagnosis:
      "Chronic Joint Pain — Sandhivata (Osteoarthritis, Bilateral Knee)",
    medicines: [
      "Maharasnadi Kashayam – 15ml BD before food",
      "Yogaraja Guggulu – 2 tabs TID after food",
      "Dhanwantaram Tailam — external application BD",
    ],
    notes:
      "Panchakarma therapy recommended — 5 sessions of Janu Basti. AYUSH-licensed practitioner.",
  }),
);

write(
  "TC011_F022_hospital_bill.html",
  hospitalBill({
    hospitalName: "Ayur Wellness Centre",
    address: "Thrissur, Kerala – 680 001",
    gstin: "32AABCA6789J1ZM",
    invoiceNo: "AWC-2024-0289",
    patientName: "Kavya Reddy",
    uhid: "AWC-EMP006-2024",
    date: "2024-10-28",
    lineItems: [
      {
        description: "Ayurvedic Consultation (Vaidya T. Krishnan)",
        amount: 1000,
      },
      {
        description: "Panchakarma Therapy — Janu Basti (5 sessions)",
        amount: 3000,
      },
    ],
    total: 4000,
  }),
);

// TC012 — Excluded condition (Bariatric / Obesity)
write(
  "TC012_F023_prescription.html",
  prescription({
    doctorName: "Dr. P. Banerjee",
    qualification: "MBBS, MS (Surgery), Fellowship in Bariatric Surgery",
    registration: "WB/34567/2015",
    clinic: "Banerjee Weight Management Centre",
    address: "Park Street, Kolkata – 700 016",
    patientName: "Anil Kapoor",
    age: "44 yrs",
    date: "2024-10-18",
    diagnosis: "Morbid Obesity — BMI 37 kg/m²",
    medicines: [
      "Orlistat 120mg – 1 cap TID with meals",
      "Multivitamin (Bariatric formulation) – 1 tab OD",
    ],
    notes:
      "Bariatric Consultation and Customised Diet Plan initiated. Advised surgical evaluation if BMI > 40.",
  }),
);

write(
  "TC012_F024_hospital_bill.html",
  hospitalBill({
    hospitalName: "Banerjee Weight Management Centre",
    address: "Park Street, Kolkata – 700 016",
    gstin: "19AABCB5678K1ZP",
    invoiceNo: "BWMC-2024-0781",
    patientName: "Anil Kapoor",
    uhid: "BWMC-EMP009-2024",
    date: "2024-10-18",
    lineItems: [
      {
        description: "Bariatric Consultation (Initial Assessment)",
        amount: 3000,
      },
      {
        description: "Personalised Diet & Nutrition Program (3 months)",
        amount: 5000,
      },
    ],
    total: 8000,
  }),
);

// ─── Index file ───────────────────────────────────────────────────────────────

const INDEX_HTML = page(`
  <div class="letterhead"><div class="lh-name">Test Document Index</div><div class="lh-sub">Plum Insurance Claims — Demo Documents</div></div>
  <p style="margin-bottom:16px; font-size:12px; color:#555;">Open any document in Chrome and click <strong>Print / Save PDF</strong> to export a PDF for upload.</p>
  <table>
    <thead><tr><th>File</th><th>Test Case</th><th>Document Type</th><th>Scenario</th></tr></thead>
    <tbody>
      ${[
        [
          "TC001_F001_prescription.html",
          "TC001",
          "PRESCRIPTION",
          "Wrong type — submit BOTH F001 + F002 (two prescriptions, no hospital bill)",
        ],
        [
          "TC001_F002_prescription_duplicate.html",
          "TC001",
          "PRESCRIPTION",
          "Wrong type — second prescription (should be hospital bill)",
        ],
        [
          "TC002_F003_prescription.html",
          "TC002",
          "PRESCRIPTION",
          "Unreadable — valid prescription",
        ],
        [
          "TC002_F004_pharmacy_bill_blurry.html",
          "TC002",
          "PHARMACY_BILL",
          "Unreadable — blurry pharmacy bill (triggers TC002)",
        ],
        [
          "TC003_F005_prescription_ravi.html",
          "TC003",
          "PRESCRIPTION",
          "Name mismatch — patient is 'Ravi Kumar'",
        ],
        [
          "TC003_F006_hospital_bill_priya.html",
          "TC003",
          "HOSPITAL_BILL",
          "Name mismatch — patient is 'Priya Menon' (triggers TC003)",
        ],
        [
          "TC004_F007_prescription.html",
          "TC004",
          "PRESCRIPTION",
          "Clean approval — Rajesh Kumar, Viral Fever",
        ],
        [
          "TC004_F008_hospital_bill.html",
          "TC004",
          "HOSPITAL_BILL",
          "Clean approval — City Clinic bill ₹1,500",
        ],
        [
          "TC005_F009_prescription.html",
          "TC005",
          "PRESCRIPTION",
          "Waiting period — Vikram Joshi, Type 2 Diabetes",
        ],
        [
          "TC005_F010_hospital_bill.html",
          "TC005",
          "HOSPITAL_BILL",
          "Waiting period — ₹3,000, before 90-day diabetes wait expires",
        ],
        [
          "TC006_F011_dental_bill.html",
          "TC006",
          "HOSPITAL_BILL",
          "Partial — Root Canal ₹8,000 covered + Teeth Whitening ₹4,000 excluded",
        ],
        [
          "TC007_F012_prescription.html",
          "TC007",
          "PRESCRIPTION",
          "Pre-auth missing — MRI Lumbar Spine ordered",
        ],
        [
          "TC007_F013_mri_lab_report.html",
          "TC007",
          "LAB_REPORT",
          "Pre-auth missing — MRI report",
        ],
        [
          "TC007_F014_hospital_bill.html",
          "TC007",
          "HOSPITAL_BILL",
          "Pre-auth missing — ₹15,000 diagnostic bill",
        ],
        [
          "TC008_F015_prescription.html",
          "TC008",
          "PRESCRIPTION",
          "Per-claim limit — Gastroenteritis",
        ],
        [
          "TC008_F016_hospital_bill.html",
          "TC008",
          "HOSPITAL_BILL",
          "Per-claim limit — ₹7,500 exceeds ₹5,000 ceiling",
        ],
        [
          "TC009_F017_prescription.html",
          "TC009",
          "PRESCRIPTION",
          "Fraud — 4th same-day claim, Migraine",
        ],
        [
          "TC009_F018_hospital_bill.html",
          "TC009",
          "HOSPITAL_BILL",
          "Fraud — ₹4,800 bill (3 prior same-day claims on 2024-10-30)",
        ],
        [
          "TC010_F019_prescription.html",
          "TC010",
          "PRESCRIPTION",
          "Network discount — Deepak Shah, Acute Bronchitis, Apollo Hospitals",
        ],
        [
          "TC010_F020_hospital_bill.html",
          "TC010",
          "HOSPITAL_BILL",
          "Network discount — Apollo bill ₹4,500 → after 20% + 10% copay = ₹3,240",
        ],
        [
          "TC011_F021_prescription.html",
          "TC011",
          "PRESCRIPTION",
          "Degradation — Ayurvedic prescription (AYUSH registration)",
        ],
        [
          "TC011_F022_hospital_bill.html",
          "TC011",
          "HOSPITAL_BILL",
          "Degradation — Ayur Wellness Centre ₹4,000",
        ],
        [
          "TC012_F023_prescription.html",
          "TC012",
          "PRESCRIPTION",
          "Excluded — Morbid Obesity BMI 37, Bariatric Consultation",
        ],
        [
          "TC012_F024_hospital_bill.html",
          "TC012",
          "HOSPITAL_BILL",
          "Excluded — Bariatric + Diet Plan ₹8,000",
        ],
      ]
        .map(
          ([file, tc, type, scenario]) =>
            `<tr><td><a href="${file}" target="_blank" style="color:#1a5276;">${file}</a></td><td>${tc}</td><td>${type}</td><td>${scenario}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <div class="footer" style="margin-top:24px;">To use: open a file in Chrome → Print → Destination: Save as PDF → Save. Then upload the PDF via the claim submission form.</div>
`);

write("index.html", INDEX_HTML);

console.log(`\n✅  ${24 + 1} documents written to ${OUT}`);
console.log(
  `   Open tests/fixtures/documents/index.html in Chrome to see all files.\n`,
);
