// Defines shared dashboard data application data.
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
    "Party Statement",
  ],
  actions: ["Add Sale", "Add Purchase", "Add Party", "Add Item"],
  widgets: [],
};
