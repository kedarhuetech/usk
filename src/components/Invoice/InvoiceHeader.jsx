import { FiFileText, FiUser } from "react-icons/fi";
import Input from "../Common/Input";

function InvoiceHeader({ invoice, form, onChange }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-950">
          <span className="rounded-full bg-blue-600 p-2 text-white"><FiFileText /></span>
          Invoice Details
        </h3>
        <div className="space-y-3 text-sm text-slate-600">
          <p>Invoice Number : <span className="font-medium text-slate-900">{invoice.invoiceNumber}</span></p>
          <p>Invoice Date : <span className="font-medium text-slate-900">{invoice.invoiceDate}</span></p>
        </div>
      </div>

      <div>
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-950">
          <span className="rounded-full bg-blue-600 p-2 text-white"><FiUser /></span>
          Bill To
        </h3>
        <Input
          label="Customer Name"
          value={form.customerName}
          onChange={(event) => onChange("customerName", event.target.value)}
          placeholder="Enter customer name"
        />
      </div>
    </div>
  );
}

export default InvoiceHeader;
