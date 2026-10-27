export const plans = [
  {
    id: "basic",
    name: "Basic",
    description: "For businesses getting started with USK.",
    price: "Pricing pending",
    billingPeriod: "Commercial pricing not configured",
    recommended: false,
    features: [
      { label: "Business profile and company workspace", status: "included" },
      { label: "Sales and purchase workflows", status: "included" },
      { label: "Inventory and item management", status: "included" },
      { label: "Business Growth tools", status: "planned" },
    ],
  },
  {
    id: "professional",
    name: "Professional",
    description: "For growing businesses that need more connected tools.",
    price: "Pricing pending",
    billingPeriod: "Commercial pricing not configured",
    recommended: true,
    features: [
      { label: "Everything in Basic", status: "included" },
      { label: "Online Store", status: "included" },
      { label: "WhatsApp Marketing", status: "included" },
      { label: "Advanced reports and analytics", status: "planned" },
    ],
  },
  {
    id: "business",
    name: "Business",
    description: "For teams planning a broader business operation.",
    price: "Pricing pending",
    billingPeriod: "Commercial pricing not configured",
    recommended: false,
    features: [
      { label: "Everything in Professional", status: "included" },
      { label: "Google Profile Manager", status: "included" },
      { label: "Smart Ads", status: "included" },
      { label: "Multi-user subscription controls", status: "planned" },
    ],
  },
];

export const comparisonFeatures = [
  { label: "Business profile and company workspace", basic: "Available", professional: "Available", business: "Available" },
  { label: "Sales and purchase workflows", basic: "Available", professional: "Available", business: "Available" },
  { label: "Inventory and item management", basic: "Available", professional: "Available", business: "Available" },
  { label: "Online Store", basic: "Not included", professional: "Available", business: "Available" },
  { label: "WhatsApp Marketing", basic: "Planned", professional: "Available", business: "Available" },
  { label: "Google Profile Manager", basic: "Planned", professional: "Planned", business: "Available" },
  { label: "Smart Ads", basic: "Planned", professional: "Planned", business: "Available" },
  { label: "Reports and analytics", basic: "Planned", professional: "Planned", business: "Planned" },
  { label: "Multi-user subscription controls", basic: "Planned", professional: "Planned", business: "Planned" },
];
