export const stateOfSupplyOptions = [
  "None",
  "Andaman & Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

export const saleTaxOptions = ["NONE", "GST 0%", "GST 3%", "GST 5%", "GST 12%", "GST 18%", "GST 28%", "IGST 3%", "IGST 5%", "IGST 12%", "IGST 18%", "IGST 28%"];
export const priceModes = ["Without Tax", "With Tax"];
export const paymentTypes = ["Cash", "Cheque", "Bank A/C"];

export const saleSettings = [
  { id: "salePrefix", label: "Sale Prefix", type: "checkbox", enabled: false },
  { id: "transactionMessage", label: "Transaction Message", type: "checkbox", enabled: true },
  { id: "addFields", label: "Add fields to invoice", type: "link" },
  { id: "quickEntry", label: "Quick Entry", type: "checkbox", enabled: false },
  { id: "linkPayment", label: "Link payment to invoices", type: "checkbox", enabled: false },
  { id: "dueDates", label: "Due dates & payment terms", type: "checkbox", enabled: false },
  { id: "additionalCharges", label: "Additional charges", type: "link" },
  { id: "printSettings", label: "Print Settings", type: "link" },
];

export const shareActions = ["Generate e-Invoice", "Generate E-Way Bill", "Share", "Print", "Save & New"];
