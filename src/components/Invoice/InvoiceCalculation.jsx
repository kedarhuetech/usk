import { FiShield } from "react-icons/fi";
import Input from "../Common/Input";

function InvoiceCalculation({ form, onChange }) {
  return (
    <div>
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-950">
        <span className="rounded-full bg-blue-600 p-2 text-white"><FiShield /></span>
        Invoice Calculation
      </h3>
      <div className="space-y-4">
        <Input label="Invoice Amount" prefix="Rs" value={form.amount} onChange={(event) => onChange("amount", event.target.value)} placeholder="0.00" />
        <Input label="Received" prefix="Rs" value={form.received} onChange={(event) => onChange("received", event.target.value)} placeholder="0.00" />
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-4 text-slate-700">
          <span>Balance</span>
          <span className="font-semibold text-emerald-600">Rs {form.amount || "0.00"}</span>
        </div>
      </div>
    </div>
  );
}

export default InvoiceCalculation;
