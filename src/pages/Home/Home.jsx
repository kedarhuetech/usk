import { useState } from "react";
import { useNavigate } from "react-router-dom";
import InvoiceForm from "../../components/Invoice/InvoiceForm";
import InvoicePreview from "../../components/Invoice/InvoicePreview";
import { invoicePreviewData } from "../../constants/invoicePreviewData";

function Home() { 
  const navigate = useNavigate();
  const [form, setForm] = useState(invoicePreviewData.defaults);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="bg-slate-200 p-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_0.95fr]">
        <InvoiceForm
          invoice={invoicePreviewData}
          form={form}
          onChange={handleChange}
          onSubmit={() => navigate("/dashboard")}
        />
        <InvoicePreview invoice={invoicePreviewData} form={form} />
      </div>
    </div>
  );
}

export default Home;
