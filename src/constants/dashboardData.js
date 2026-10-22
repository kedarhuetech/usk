export const dashboardData = {
  stats: [
    {
      id: "receivable",
      label: "Total Receivable",
      value: "Rs 0",
      note: "No receivables as of now",
      tone: "emerald",
    },
    {
      id: "payable",
      label: "Total Payable",
      value: "Rs 0",
      note: "No payables as of now",
      tone: "rose",
    },
  ],
  reports: [
    "Sale Report",
    "All Transactions",
    "Daybook Report",
    "Party Statement",
  ],
  actions: ["Add Sale", "Add Purchase", "Add Party", "Add Item"],
  widgets: [
    {
      id: "whatsapp",
      title: "WhatsApp Connect",
      status: "Logged Out",
      text: "Digital invoices reduce disputes by 40%",
    },
    {
      id: "google",
      title: "Google Profile Manager",
      status: "No Reviews",
      text: "Businesses that respond to reviews earn more revenue",
    },
  ],
};
