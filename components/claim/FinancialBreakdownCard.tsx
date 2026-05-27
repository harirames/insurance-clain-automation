import type { FinancialBreakdown, LineItemDecision } from "@/lib/types";

interface Props {
  breakdown: FinancialBreakdown;
  lineItems?: LineItemDecision[];
}

export function FinancialBreakdownCard({ breakdown, lineItems }: Props) {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 mb-4">
      <h3 className="font-semibold text-gray-900 mb-4 text-base">Financial Breakdown</h3>

      {lineItems && lineItems.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Line Items
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-700">{item.description}</td>
                  <td className="py-2 text-right text-gray-700">{fmt(item.amount)}</td>
                  <td className="py-2 text-right">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        item.status === "COVERED"
                          ? "bg-emerald-50 text-emerald-700"
                          : item.status === "EXCLUDED"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2 text-sm">
        <Row label="Gross Claimed" value={fmt(breakdown.gross)} />
        {breakdown.networkDiscountPercent > 0 && (
          <Row
            label={`Network Discount (${breakdown.networkDiscountPercent}%)`}
            value={`− ${fmt(breakdown.networkDiscountAmount)}`}
            highlight
          />
        )}
        {breakdown.networkDiscountPercent > 0 && (
          <Row label="After Discount" value={fmt(breakdown.afterDiscount)} />
        )}
        {breakdown.copayPercent > 0 && (
          <Row
            label={`Co-pay (${breakdown.copayPercent}%)`}
            value={`− ${fmt(breakdown.copayAmount)}`}
            highlight
          />
        )}
        <div className="border-t border-gray-200 pt-2">
          <Row label="Payable" value={fmt(breakdown.payable)} bold />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? "font-semibold text-gray-900" : "text-gray-600"}`}>{label}</span>
      <span
        className={`${bold ? "font-semibold text-gray-900" : ""} ${
          highlight ? "text-red-600" : "text-gray-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
