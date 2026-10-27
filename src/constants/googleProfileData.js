// Defines shared google profile data application data.
export const emptyBusinessDetails = {
  businessName: "",
  primaryCategory: "",
  openingDate: "",
  description: "",
  phoneNumber: "",
  website: "",
  address: "",
  businessHours: [
    { day: "Mon", open: "", close: "", isClosed: true },
    { day: "Tue", open: "", close: "", isClosed: true },
    { day: "Wed", open: "", close: "", isClosed: true },
    { day: "Thu", open: "", close: "", isClosed: true },
    { day: "Fri", open: "", close: "", isClosed: true },
    { day: "Sat", open: "", close: "", isClosed: true },
    { day: "Sun", open: "", close: "", isClosed: true },
  ],
};

// Sample-only values keep the existing dashboard layout populated before a
// verified Google profile has been loaded. Live profile data comes from the
// Google Business API / Vyapaar Business Growth API.
export const googleProfileDateRanges = [
  "Last 7 Days",
  "Last 30 Days",
  "Last 90 Days",
];

export const googleProfileNav = [
  { id: "overview", label: "Overview" },
  { id: "reviews", label: "Reviews" },
  { id: "photos", label: "Photos" },
  { id: "qr", label: "Review QR" },
  { id: "details", label: "Business Details" },
];

export const googleProfileMock = {
  profile: {
    name: "Your Business",
    category: "Business",
    status: "Not connected",
    location: "Connect a Google Business Profile to load your location",
  },
  metrics: [
    { id: "views", label: "Profile views", value: "—", trend: "Connect Google to view insights", tone: "blue" },
    { id: "rating", label: "Rating", value: "—", trend: "Connect Google to view insights", tone: "amber" },
    { id: "reviews", label: "Reviews", value: "—", trend: "Connect Google to view insights", tone: "emerald" },
    { id: "calls", label: "Calls", value: "—", trend: "Connect Google to view insights", tone: "rose" },
    { id: "directions", label: "Directions", value: "—", trend: "Connect Google to view insights", tone: "cyan" },
  ],
  performance: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    barHeights: ["h-8", "h-12", "h-10", "h-16", "h-14", "h-20", "h-12"],
    series: [
      { label: "Search views", value: 0, widthClass: "w-0" },
      { label: "Maps views", value: 0, widthClass: "w-0" },
    ],
  },
  reputation: {
    averageRating: 0,
    totalReviews: 0,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0, widthClass: "w-0" })),
  },
  reviews: [],
  photos: [],
  qr: { businessName: "Your Business", reviewLink: "" },
  businessDetails: { ...emptyBusinessDetails, businessHours: emptyBusinessDetails.businessHours.map((day) => ({ ...day })) },
};
