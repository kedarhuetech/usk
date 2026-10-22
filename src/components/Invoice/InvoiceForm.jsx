import { FiBox, FiFilePlus } from "react-icons/fi";
import Button from "../Common/Button";
import Input from "../Common/Input";
import InvoiceCalculation from "./InvoiceCalculation";
import InvoiceHeader from "./InvoiceHeader";

function InvoiceForm({ invoice, form, onChange, onSubmit }) {
  return (
    <section className="rounded-lg bg-white p-6">
      <div className="mb-5 border-b border-slate-200 pb-5">
        <h2 className="text-lg font-semibold text-slate-950">Enter details to make your first sale</h2>
        <p className="mt-1 text-sm text-slate-500">Create a clean invoice draft in less than a minute.</p>
      </div>

      <div className="mb-6">
        <Input
          label="Business Name"
          value={form.businessName}
          onChange={(event) => onChange("businessName", event.target.value)}
          placeholder="Enter business name"
        />
      </div>

      <div className="space-y-6">
        <InvoiceHeader invoice={invoice} form={form} onChange={onChange} />
        <button type="button" className="flex h-16 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-blue-400 bg-blue-50/40 text-sm font-medium text-blue-700">
          <FiBox /> Add Sample Item
        </button>
        <InvoiceCalculation form={form} onChange={onChange} />
        <div className="flex justify-center">
          <Button onClick={onSubmit} className="bg-rose-600 text-white shadow-sm hover:bg-rose-700">
            <FiFilePlus /> Create Your First Invoice
          </Button>
        </div>
      </div>
    </section>
  );
}

export default InvoiceForm;
