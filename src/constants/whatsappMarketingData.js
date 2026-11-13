// WhatsApp Marketing Categories, Subcategories, and Mock Poster Templates.

export const whatsappMarketingCategories = ["Greetings", "Trending", "Business", "Offers"];

export const whatsappMarketingCategoriesWithIcons = [
  { id: "Greetings", label: "Greetings", icon: "heart" },
  { id: "Trending", label: "Trending", icon: "trending" },
  { id: "Business", label: "Business", icon: "business" },
  { id: "Offers", label: "Offers", icon: "offers" },
];

export const whatsappMarketingSubcategoriesByCategory = {
  Greetings: [
    "All",
    "Good Morning",
    "Good Thoughts ( Suvichar )",
    "Good Night",
    "Motivation",
  ],
  Trending: [
    "All",
    "Festival",
    "Diwali",
    "Ganesh Chaturthi",
    "Holi",
    "Special Days",
    "National Days",
  ],
  Business: [
    "All",
    "Store Promotion",
    "New Arrivals",
    "Customer Review",
    "Service Guarantee",
  ],
  Offers: [
    "All",
    "Discount & Sale",
    "Weekend Deals",
    "Mega Clearance",
    "Buy 1 Get 1",
  ],
};

export const whatsappMarketingSubcategories = [
  "All",
  "Good Morning",
  "Good Thoughts ( Suvichar )",
  "Good Night",
  "Motivation",
  "Festival",
  "Store Promotion",
  "Discount & Sale",
];

export const whatsappMarketingDefaults = {
  businessName: "",
  contactPerson: "",
  contactNumber: "",
  additionalText: "",
  whatsappText: "add your text here.",
};

function svgToDataUrl(svgString) {
  return "data:image/svg+xml;utf8," + encodeURIComponent(svgString.trim());
}

// 1. Good Morning: Balanced Books & Calculator (Matches User Screenshot Card 1)
const posterGoodMorning1 = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#BAE6FD" />
      <stop offset="45%" stop-color="#FEF08A" />
      <stop offset="70%" stop-color="#FED7AA" />
      <stop offset="100%" stop-color="#FFEDD5" />
    </linearGradient>
    <linearGradient id="desk1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F1F5F9" />
      <stop offset="100%" stop-color="#CBD5E1" />
    </linearGradient>
    <linearGradient id="sunGlow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FDE047" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
    </linearGradient>
    <filter id="shadow1" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.15" />
    </filter>
  </defs>

  <!-- Sky & Sunrise Background -->
  <rect width="800" height="800" fill="url(#sky1)" />
  <circle cx="280" cy="380" r="180" fill="url(#sunGlow)" />

  <!-- City Skyline Silhouette outside window -->
  <path d="M40 500 L40 440 L70 440 L70 410 L100 410 L100 450 L140 450 L140 380 L180 380 L180 430 L220 430 L220 400 L260 400 L260 470 L300 470 L300 420 L350 420 L350 490 L420 490 L420 440 L480 440 L480 390 L520 390 L520 430 L580 430 L580 460 L640 460 L640 410 L700 410 L700 470 L760 470 L760 500 Z" fill="#93C5FD" opacity="0.45" />

  <!-- Modern White Window Frame Architecture -->
  <rect x="25" y="25" width="750" height="750" rx="16" fill="none" stroke="#FFFFFF" stroke-width="26" />
  <line x1="25" y1="460" x2="775" y2="460" stroke="#FFFFFF" stroke-width="18" />
  <line x1="400" y1="25" x2="400" y2="460" stroke="#FFFFFF" stroke-width="16" />

  <!-- Desk Surface -->
  <rect x="25" y="520" width="750" height="255" fill="url(#desk1)" />
  <line x1="25" y1="520" x2="775" y2="520" stroke="#E2E8F0" stroke-width="4" />

  <!-- Morning Items on Desk -->
  <!-- Accounting Ledger / Book -->
  <g transform="translate(230, 560)" filter="url(#shadow1)">
    <rect x="0" y="0" width="180" height="130" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2" />
    <line x1="20" y1="25" x2="160" y2="25" stroke="#93C5FD" stroke-width="4" stroke-linecap="round" />
    <line x1="20" y1="45" x2="160" y2="45" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round" />
    <line x1="20" y1="65" x2="160" y2="65" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round" />
    <line x1="20" y1="85" x2="130" y2="85" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round" />
    <line x1="20" y1="105" x2="100" y2="105" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round" />
    <line x1="90" y1="15" x2="90" y2="120" stroke="#FCA5A5" stroke-width="2" stroke-dasharray="4,3" />
  </g>

  <!-- Calculator -->
  <g transform="translate(85, 570)" filter="url(#shadow1)">
    <rect x="0" y="0" width="115" height="130" rx="12" fill="#1E293B" />
    <rect x="12" y="14" width="91" height="28" rx="4" fill="#64748B" />
    <text x="94" y="34" fill="#F8FAFC" font-family="monospace" font-size="16" font-weight="bold" text-anchor="end">88,540.00</text>
    <!-- Keys Grid -->
    <circle cx="28" cy="60" r="9" fill="#334155" />
    <circle cx="58" cy="60" r="9" fill="#334155" />
    <circle cx="87" cy="60" r="9" fill="#EA580C" />
    <circle cx="28" cy="85" r="9" fill="#334155" />
    <circle cx="58" cy="85" r="9" fill="#334155" />
    <circle cx="87" cy="85" r="9" fill="#334155" />
    <circle cx="28" cy="110" r="9" fill="#334155" />
    <circle cx="58" cy="110" r="9" fill="#334155" />
    <circle cx="87" cy="110" r="9" fill="#10B981" />
  </g>

  <!-- Steaming Coffee Cup -->
  <g transform="translate(480, 565)" filter="url(#shadow1)">
    <!-- Saucer -->
    <ellipse cx="60" cy="100" rx="60" ry="14" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2" />
    <!-- Cup -->
    <path d="M25 45 L95 45 C95 85, 80 95, 60 95 C40 95, 25 85, 25 45 Z" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2" />
    <!-- Handle -->
    <path d="M92 50 C108 50, 108 80, 90 80" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" />
    <path d="M92 50 C108 50, 108 80, 90 80" fill="none" stroke="#E2E8F0" stroke-width="2" stroke-linecap="round" />
    <!-- Coffee -->
    <ellipse cx="60" cy="48" rx="30" ry="9" fill="#78350F" />
    <!-- Steam -->
    <path d="M50 35 Q44 20, 52 10" fill="none" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" opacity="0.6" />
    <path d="M66 32 Q60 18, 68 8" fill="none" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" opacity="0.6" />
  </g>

  <!-- Reading Glasses -->
  <g transform="translate(340, 680)" opacity="0.85">
    <circle cx="25" cy="15" r="14" fill="none" stroke="#0F172A" stroke-width="3" />
    <circle cx="65" cy="15" r="14" fill="none" stroke="#0F172A" stroke-width="3" />
    <line x1="39" y1="15" x2="51" y2="15" stroke="#0F172A" stroke-width="3" />
    <path d="M11 15 L-5 25" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round" />
    <path d="M79 15 L95 25" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round" />
  </g>

  <!-- Typography Card Header -->
  <text x="400" y="220" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="62" font-weight="900" fill="#0F172A" text-anchor="middle" letter-spacing="-1">Good Morning</text>
  <text x="400" y="275" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="600" fill="#334155" text-anchor="middle">Start your day with balanced</text>
  <text x="400" y="308" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="600" fill="#334155" text-anchor="middle">books and bright prospects.</text>
</svg>
`);

// 2. Good Morning: Suprabhat (Matches User Screenshot Card 2)
const posterSuprabhat = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="terraceSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FDE68A" />
      <stop offset="30%" stop-color="#FED7AA" />
      <stop offset="65%" stop-color="#FFEDD5" />
      <stop offset="100%" stop-color="#FEF3C7" />
    </linearGradient>
    <linearGradient id="warmSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFFBEB" />
      <stop offset="40%" stop-color="#FCD34D" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#terraceSky)" />
  <circle cx="240" cy="380" r="220" fill="url(#warmSun)" />

  <!-- Distant City & Domes Silhouette -->
  <path d="M0 480 Q120 440, 240 450 T480 430 Q600 440, 800 460 L800 520 L0 520 Z" fill="#FDBA74" opacity="0.35" />
  <path d="M180 450 Q200 410, 220 450 Z" fill="#FDBA74" opacity="0.5" />
  <path d="M580 435 Q600 395, 620 435 Z" fill="#FDBA74" opacity="0.5" />

  <!-- Modern Glass Window Architecture -->
  <rect x="25" y="25" width="750" height="750" rx="16" fill="none" stroke="#FFFFFF" stroke-width="26" />
  <line x1="25" y1="500" x2="775" y2="500" stroke="#FFFFFF" stroke-width="18" />
  <line x1="430" y1="25" x2="430" y2="500" stroke="#FFFFFF" stroke-width="16" />

  <!-- Desk Surface -->
  <rect x="25" y="550" width="750" height="225" fill="#F8FAFC" />

  <!-- Desk Items -->
  <!-- Open Diary -->
  <g transform="translate(230, 580)">
    <rect x="0" y="0" width="170" height="115" rx="6" fill="#FDFBF7" stroke="#CBD5E1" stroke-width="2" />
    <line x1="85" y1="0" x2="85" y2="115" stroke="#94A3B8" stroke-width="2" />
    <line x1="15" y1="25" x2="75" y2="25" stroke="#E2E8F0" stroke-width="3" stroke-linecap="round" />
    <line x1="15" y1="45" x2="75" y2="45" stroke="#E2E8F0" stroke-width="3" stroke-linecap="round" />
    <line x1="15" y1="65" x2="75" y2="65" stroke="#E2E8F0" stroke-width="3" stroke-linecap="round" />
    <line x1="95" y1="25" x2="155" y2="25" stroke="#E2E8F0" stroke-width="3" stroke-linecap="round" />
    <line x1="95" y1="45" x2="155" y2="45" stroke="#E2E8F0" stroke-width="3" stroke-linecap="round" />
    <circle cx="140" cy="85" r="8" fill="#F59E0B" opacity="0.6" />
  </g>

  <!-- Cup of Chai / Coffee -->
  <g transform="translate(450, 585)">
    <ellipse cx="40" cy="75" rx="40" ry="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5" />
    <path d="M15 35 L65 35 C65 65, 55 72, 40 72 C25 72, 15 65, 15 35 Z" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5" />
    <ellipse cx="40" cy="37" rx="22" ry="7" fill="#92400E" />
    <path d="M35 24 Q30 12, 38 4" fill="none" stroke="#94A3B8" stroke-width="2" opacity="0.7" />
  </g>

  <!-- Mini Calculator -->
  <g transform="translate(560, 600)">
    <rect x="0" y="0" width="80" height="95" rx="8" fill="#334155" />
    <rect x="8" y="8" width="64" height="20" rx="3" fill="#64748B" />
  </g>

  <!-- Hindi Suprabhat Typography -->
  <text x="400" y="260" font-family="'Nirmala UI', 'Segoe UI', 'Devanagari MT', sans-serif" font-size="74" font-weight="900" fill="#B45309" text-anchor="middle">सुप्रभात</text>
  <text x="400" y="325" font-family="'Nirmala UI', 'Segoe UI', 'Devanagari MT', sans-serif" font-size="28" font-weight="700" fill="#78350F" text-anchor="middle">सफलता का एक नया अध्याय</text>
</svg>
`);

// 3. Motivation: Apne Sapno Ko Pankh Do (Matches User Screenshot Card 3)
const posterMotivation1 = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="cloudSunrise" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FEF08A" />
      <stop offset="35%" stop-color="#FED7AA" />
      <stop offset="70%" stop-color="#FFF7ED" />
      <stop offset="100%" stop-color="#FFFFFF" />
    </linearGradient>
    <radialGradient id="sunBurst" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" />
      <stop offset="40%" stop-color="#F97316" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#EA580C" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="800" height="800" fill="url(#cloudSunrise)" />
  <circle cx="400" cy="540" r="280" fill="url(#sunBurst)" />

  <!-- Soft Dreamy Clouds -->
  <path d="M-50 680 C40 620, 160 630, 240 670 C320 620, 480 610, 560 660 C640 610, 780 630, 850 680 L850 850 L-50 850 Z" fill="#FFFFFF" opacity="0.85" />
  <path d="M-50 720 C80 670, 220 680, 340 715 C440 670, 600 665, 720 705 C800 675, 850 690, 850 730 L850 850 L-50 850 Z" fill="#FFF7ED" opacity="0.9" />

  <!-- Mountain Peak with Victorious Person Silhouette -->
  <!-- Mountain Summit -->
  <path d="M220 800 L400 600 L580 800 Z" fill="#9A3412" opacity="0.6" />
  <path d="M280 800 L400 630 L520 800 Z" fill="#7C2D12" opacity="0.85" />

  <!-- Person on Peak Silhouette with Arms Open Wide to Sky -->
  <g transform="translate(400, 570)" fill="#7C2D12">
    <!-- Head -->
    <circle cx="0" cy="-35" r="14" />
    <!-- Body -->
    <path d="M-8 -18 L8 -18 L10 25 L-10 25 Z" />
    <!-- Arms Spread Triumphant -->
    <path d="M-8 -12 L-45 -35 L-40 -42 L-6 -16 Z" />
    <path d="M8 -12 L45 -35 L40 -42 L6 -16 Z" />
    <!-- Legs -->
    <path d="M-8 25 L-18 60 L-10 60 L-2 25 Z" />
    <path d="M8 25 L18 60 L10 60 L2 25 Z" />
  </g>

  <!-- Hindi Motivational Typography -->
  <text x="400" y="240" font-family="'Nirmala UI', 'Segoe UI', 'Devanagari MT', sans-serif" font-size="48" font-weight="900" fill="#C2410C" text-anchor="middle" letter-spacing="1">अपने सपनों को</text>
  <text x="400" y="305" font-family="'Nirmala UI', 'Segoe UI', 'Devanagari MT', sans-serif" font-size="48" font-weight="900" fill="#EA580C" text-anchor="middle" letter-spacing="1">पंख दो,</text>
  <text x="400" y="375" font-family="'Nirmala UI', 'Segoe UI', 'Devanagari MT', sans-serif" font-size="52" font-weight="900" fill="#C2410C" text-anchor="middle" letter-spacing="1">और उड़ चलो</text>
</svg>
`);

// 4. Good Thoughts: Nayi Subah, Nayi Ummeedein (Matches User Screenshot Card 4)
const posterGoodThoughts1 = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="warmDawn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFEDD5" />
      <stop offset="50%" stop-color="#FED7AA" />
      <stop offset="100%" stop-color="#BAE6FD" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#warmDawn)" />

  <!-- Huge Modern Window Mullions -->
  <rect x="20" y="20" width="760" height="760" rx="16" fill="none" stroke="#FFFFFF" stroke-width="22" />
  <line x1="560" y1="20" x2="560" y2="780" stroke="#FFFFFF" stroke-width="20" />
  <line x1="20" y1="520" x2="780" y2="520" stroke="#FFFFFF" stroke-width="16" />

  <!-- Person standing near window looking out with confidence -->
  <g transform="translate(620, 360)" fill="#475569">
    <!-- Head with hair bun -->
    <circle cx="35" cy="0" r="24" fill="#334155" />
    <!-- Upper body / shirt -->
    <path d="M10 30 Q35 25, 55 35 L65 190 L5 190 Z" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2" />
    <!-- Arm resting forward -->
    <path d="M20 40 L-10 110 L15 110 L35 55 Z" fill="#F8FAFC" />
  </g>

  <!-- Inspiring Hindi Typography on Left Glass Pane -->
  <g transform="translate(290, 260)">
    <text x="0" y="0" font-family="'Nirmala UI', 'Segoe UI', 'Devanagari MT', sans-serif" font-size="52" font-weight="900" fill="#C2410C" text-anchor="middle">नई सुबह,</text>
    <text x="0" y="70" font-family="'Nirmala UI', 'Segoe UI', 'Devanagari MT', sans-serif" font-size="52" font-weight="900" fill="#EA580C" text-anchor="middle">नई उम्मीदें,</text>
    <text x="0" y="145" font-family="'Nirmala UI', 'Segoe UI', 'Devanagari MT', sans-serif" font-size="54" font-weight="900" fill="#C2410C" text-anchor="middle">नई शुरुआत।</text>
  </g>
</svg>
`);

// 5. Motivation: Small Steps Giant Leaps
const posterMotivation2 = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="indigoGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E1B4B" />
      <stop offset="50%" stop-color="#312E81" />
      <stop offset="100%" stop-color="#4338CA" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#indigoGrad)" />
  <circle cx="700" cy="150" r="260" fill="#6366F1" opacity="0.15" />
  <circle cx="100" cy="700" r="200" fill="#818CF8" opacity="0.12" />

  <g transform="translate(400, 280)">
    <rect x="-60" y="-60" width="120" height="120" rx="30" fill="#4F46E5" />
    <path d="M-20 15 L0 -15 L20 15" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <text x="400" y="440" font-family="'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="900" fill="#FFFFFF" text-anchor="middle">Every Small Step</text>
  <text x="400" y="500" font-family="'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="900" fill="#FBBF24" text-anchor="middle">Counts Every Day.</text>
  <text x="400" y="560" font-family="'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="500" fill="#C7D2FE" text-anchor="middle">Keep building, keep moving forward.</text>
</svg>
`);

// 6. Good Night: Shubh Ratri
const posterGoodNight1 = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="nightSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#020617" />
      <stop offset="60%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#nightSky)" />

  <!-- Stars -->
  <circle cx="120" cy="100" r="2" fill="#FFFFFF" opacity="0.9" />
  <circle cx="280" cy="140" r="3" fill="#FFFFFF" opacity="0.8" />
  <circle cx="680" cy="90" r="2.5" fill="#FFFFFF" opacity="0.85" />
  <circle cx="520" cy="220" r="2" fill="#FFFFFF" opacity="0.7" />
  <circle cx="190" cy="300" r="3" fill="#FFFFFF" opacity="0.9" />
  <circle cx="720" cy="340" r="2" fill="#FFFFFF" opacity="0.8" />

  <!-- Glowing Crescent Moon -->
  <g transform="translate(400, 240)">
    <circle cx="0" cy="0" r="90" fill="#FEF08A" opacity="0.15" />
    <path d="M-20 -60 A70 70 0 0 0 50 60 A85 85 0 0 1 -20 -60 Z" fill="#FDE047" />
  </g>

  <text x="400" y="440" font-family="'Nirmala UI', 'Segoe UI', sans-serif" font-size="64" font-weight="900" fill="#FDE047" text-anchor="middle">शुभ रात्रि</text>
  <text x="400" y="510" font-family="'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="600" fill="#E2E8F0" text-anchor="middle">Rest well, recharge your energy,</text>
  <text x="400" y="545" font-family="'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="600" fill="#E2E8F0" text-anchor="middle">and wake up ready to conquer tomorrow.</text>
</svg>
`);

// 7. Festival: Shubh Diwali
const posterDiwali = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="diwaliGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#450A0A" />
      <stop offset="50%" stop-color="#7F1D1D" />
      <stop offset="100%" stop-color="#991B1B" />
    </linearGradient>
    <radialGradient id="diyaGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FEF08A" />
      <stop offset="40%" stop-color="#F59E0B" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#DC2626" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="800" height="800" fill="url(#diwaliGrad)" />
  <circle cx="400" cy="520" r="220" fill="url(#diyaGlow)" />

  <!-- Diya Illustration -->
  <g transform="translate(400, 560)">
    <ellipse cx="0" cy="30" rx="140" ry="25" fill="#78350F" />
    <path d="M-130 20 Q0 80, 130 20 Q0 10, -130 20 Z" fill="#D97706" />
    <path d="M-120 18 Q0 40, 120 18 Q0 12, -120 18 Z" fill="#F59E0B" />
    <!-- Flame -->
    <path d="M0 -70 C-30 -20, -35 15, 0 15 C35 15, 30 -20, 0 -70 Z" fill="#FEF08A" />
    <path d="M0 -50 C-15 -15, -18 10, 0 10 C18 10, 15 -15, 0 -50 Z" fill="#EF4444" />
    <circle cx="0" cy="-5" r="12" fill="#FEF08A" />
  </g>

  <text x="400" y="240" font-family="'Nirmala UI', 'Segoe UI', sans-serif" font-size="68" font-weight="900" fill="#FDE047" text-anchor="middle">शुभ दीपावली</text>
  <text x="400" y="315" font-family="'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="700" fill="#FFFFFF" text-anchor="middle">Happy Diwali &amp; Prosperous New Year</text>
  <text x="400" y="365" font-family="'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="500" fill="#FED7AA" text-anchor="middle">May this festival of lights illuminate your life and business.</text>
</svg>
`);

// 8. Festival: Ganesh Chaturthi
const posterGanesh = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="ganeshGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7C2D12" />
      <stop offset="60%" stop-color="#EA580C" />
      <stop offset="100%" stop-color="#F59E0B" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#ganeshGrad)" />

  <text x="400" y="240" font-family="'Nirmala UI', 'Segoe UI', sans-serif" font-size="58" font-weight="900" fill="#FEF08A" text-anchor="middle">गणपति बाप्पा मोरया</text>
  <text x="400" y="310" font-family="'Nirmala UI', 'Segoe UI', sans-serif" font-size="32" font-weight="700" fill="#FFFFFF" text-anchor="middle">विघ्नहर्ता मंगलकर्ता</text>

  <!-- Ganesha Aura Emblem -->
  <g transform="translate(400, 480)" fill="#FFFBEB">
    <circle cx="0" cy="0" r="110" fill="#FEF08A" opacity="0.25" />
    <circle cx="0" cy="-55" r="35" opacity="0.9" />
    <path d="M-60 10 Q0 -30, 60 10 Q50 90, 0 100 Q-50 90, -60 10 Z" opacity="0.85" />
    <path d="M0 10 Q25 40, 20 80 Q0 60, 0 10 Z" fill="#F59E0B" />
  </g>

  <text x="400" y="680" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#FFFBEB" text-anchor="middle">Wishing you prosperity, peace, and good health!</text>
</svg>
`);

// 9. Festival: Happy Holi
const posterHoli = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="holiGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#EC4899" />
      <stop offset="50%" stop-color="#8B5CF6" />
      <stop offset="100%" stop-color="#3B82F6" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#holiGrad)" />

  <!-- Splashes of Gulal Color -->
  <circle cx="200" cy="220" r="140" fill="#FBBF24" opacity="0.75" />
  <circle cx="620" cy="260" r="120" fill="#10B981" opacity="0.7" />
  <circle cx="340" cy="620" r="160" fill="#EF4444" opacity="0.65" />
  <circle cx="580" cy="580" r="130" fill="#F59E0B" opacity="0.8" />

  <text x="400" y="380" font-family="'Segoe UI', Roboto, sans-serif" font-size="76" font-weight="900" fill="#FFFFFF" text-anchor="middle">Happy Holi!</text>
  <text x="400" y="445" font-family="'Nirmala UI', 'Segoe UI', sans-serif" font-size="34" font-weight="700" fill="#FEF08A" text-anchor="middle">रंगों का पावन त्यौहार</text>
  <text x="400" y="500" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#FFFFFF" text-anchor="middle">May your life be painted with endless happiness &amp; love.</text>
</svg>
`);

// 10. Business: Store Promotion
const posterStore = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="bizGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#bizGrad)" />

  <!-- Store Badge -->
  <g transform="translate(400, 240)">
    <circle cx="0" cy="0" r="90" fill="#FF5A1F" />
    <path d="M-40 20 L-40 -15 L0 -45 L40 -15 L40 20 Z" fill="#FFFFFF" />
    <rect x="-15" y="-5" width="30" height="25" fill="#FF5A1F" />
  </g>

  <text x="400" y="420" font-family="'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="900" fill="#FFFFFF" text-anchor="middle">Welcome to Our Store</text>
  <text x="400" y="480" font-family="'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="700" fill="#FF5A1F" text-anchor="middle">Quality Products &amp; Best Customer Service</text>
  <text x="400" y="540" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="500" fill="#94A3B8" text-anchor="middle">Wholesale &amp; Retail Available. Visit Us Today!</text>
</svg>
`);

// 11. Business: New Arrivals
const posterNewArrivals = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="newGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#047857" />
      <stop offset="100%" stop-color="#065F46" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#newGrad)" />

  <g transform="translate(400, 240)">
    <rect x="-180" y="-40" width="360" height="80" rx="40" fill="#F59E0B" />
    <text x="0" y="14" font-family="'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="900" fill="#047857" text-anchor="middle" letter-spacing="3">NEW ARRIVALS</text>
  </g>

  <text x="400" y="420" font-family="'Segoe UI', Roboto, sans-serif" font-size="58" font-weight="900" fill="#FFFFFF" text-anchor="middle">Fresh Stock Just In!</text>
  <text x="400" y="480" font-family="'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="600" fill="#A7F3D0" text-anchor="middle">Check out our latest premium collection.</text>
  <text x="400" y="530" font-family="'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="500" fill="#FFFFFF" text-anchor="middle">Special introductory prices on select items.</text>
</svg>
`);

// 12. Offers: Mega Sale Up to 50% Off
const posterMegaSale = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="saleGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#DC2626" />
      <stop offset="100%" stop-color="#991B1B" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#saleGrad)" />

  <g transform="translate(400, 280)">
    <rect x="-240" y="-80" width="480" height="160" rx="28" fill="#FBBF24" />
    <text x="0" y="24" font-family="'Segoe UI', Roboto, sans-serif" font-size="82" font-weight="900" fill="#7F1D1D" text-anchor="middle" letter-spacing="2">MEGA SALE</text>
  </g>

  <text x="400" y="460" font-family="'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="900" fill="#FFFFFF" text-anchor="middle">UP TO 50% OFF</text>
  <text x="400" y="525" font-family="'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="700" fill="#FDE047" text-anchor="middle">Limited Time Store Offer</text>
  <text x="400" y="575" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="500" fill="#FFFFFF" text-anchor="middle">Hurry! Offer valid until stocks last.</text>
</svg>
`);

// 13. Offers: Buy 1 Get 1 Free
const posterBogo = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="bogoGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7C3AED" />
      <stop offset="100%" stop-color="#C026D3" />
    </linearGradient>
  </defs>

  <rect width="800" height="800" fill="url(#bogoGrad)" />

  <text x="400" y="280" font-family="'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="800" fill="#FDE047" text-anchor="middle" letter-spacing="4">WEEKEND SPECIAL</text>
  <text x="400" y="380" font-family="'Segoe UI', Roboto, sans-serif" font-size="78" font-weight="900" fill="#FFFFFF" text-anchor="middle">BUY 1 GET 1</text>
  <text x="400" y="470" font-family="'Segoe UI', Roboto, sans-serif" font-size="78" font-weight="900" fill="#FDE047" text-anchor="middle">FREE!</text>
  <text x="400" y="550" font-family="'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="600" fill="#FFFFFF" text-anchor="middle">Applicable on selected branded items this weekend.</text>
</svg>
`);

// 14. Offers: Weekend Dhamaka Deals
const posterWeekendDeals = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="wkndGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#EA580C" />
      <stop offset="60%" stop-color="#C2410C" />
      <stop offset="100%" stop-color="#7C2D12" />
    </linearGradient>
    <filter id="softGlow">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.3" />
    </filter>
  </defs>
  <rect width="800" height="800" fill="url(#wkndGrad)" />
  <circle cx="400" cy="240" r="160" fill="#FDE047" opacity="0.12" />
  <rect x="50" y="50" width="700" height="700" rx="32" fill="none" stroke="#FDBA74" stroke-width="4" stroke-dasharray="12 8" opacity="0.6" />
  <g transform="translate(400, 200)" filter="url(#softGlow)">
    <rect x="-190" y="-36" width="380" height="72" rx="36" fill="#FDE047" />
    <text x="0" y="14" font-family="'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="900" fill="#9A3412" text-anchor="middle" letter-spacing="3">SATURDAY &amp; SUNDAY</text>
  </g>
  <text x="400" y="340" font-family="'Segoe UI', Roboto, sans-serif" font-size="68" font-weight="900" fill="#FFFFFF" text-anchor="middle" filter="url(#softGlow)">WEEKEND DHAMAKA</text>
  <text x="400" y="420" font-family="'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="900" fill="#FDE047" text-anchor="middle">EXCLUSIVE DEALS</text>
  <g transform="translate(400, 500)">
    <rect x="-240" y="-32" width="480" height="64" rx="20" fill="#FFFFFF" opacity="0.15" />
    <text x="0" y="10" font-family="'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="700" fill="#FFFFFF" text-anchor="middle">Extra Savings on All Orders</text>
  </g>
  <text x="400" y="580" font-family="'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="500" fill="#FED7AA" text-anchor="middle">Valid in-store and online while stocks last.</text>
</svg>
`);

// 15. Offers: Mega Clearance Sale
const posterMegaClearance = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="clrGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#clrGrad)" />
  <rect x="0" y="60" width="800" height="24" fill="#F59E0B" />
  <rect x="0" y="716" width="800" height="24" fill="#F59E0B" />
  <g transform="translate(400, 220)">
    <rect x="-220" y="-45" width="440" height="90" rx="16" fill="#DC2626" />
    <text x="0" y="16" font-family="'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">CLEARANCE</text>
  </g>
  <text x="400" y="370" font-family="'Segoe UI', Roboto, sans-serif" font-size="76" font-weight="900" fill="#FBBF24" text-anchor="middle">FLAT 60% OFF</text>
  <text x="400" y="450" font-family="'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="800" fill="#FFFFFF" text-anchor="middle">EVERYTHING MUST GO</text>
  <text x="400" y="520" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#94A3B8" text-anchor="middle">Massive discounts on end-of-season stock.</text>
  <text x="400" y="565" font-family="'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#F87171" text-anchor="middle">First come, first served. Limited quantities available!</text>
</svg>
`);

// 16. Business: 5-Star Customer Review
const posterCustomerReview = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="revGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E3A8A" />
      <stop offset="100%" stop-color="#1E1B4B" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#revGrad)" />
  <rect x="60" y="60" width="680" height="680" rx="36" fill="#FFFFFF" fill-opacity="0.05" stroke="#60A5FA" stroke-width="2" />
  <!-- 5 Gold Stars -->
  <g transform="translate(400, 190)">
    <text x="0" y="0" font-size="52" fill="#FBBF24" text-anchor="middle" letter-spacing="8">★★★★★</text>
  </g>
  <text x="400" y="270" font-family="'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="900" fill="#FFFFFF" text-anchor="middle">TRUSTED BY 10,000+ CUSTOMERS</text>
  <g transform="translate(400, 400)">
    <rect x="-300" y="-90" width="600" height="180" rx="24" fill="#FFFFFF" fill-opacity="0.1" />
    <text x="0" y="-30" font-family="Georgia, serif" font-size="56" fill="#93C5FD" text-anchor="middle">“</text>
    <text x="0" y="10" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-style="italic" font-weight="600" fill="#E2E8F0" text-anchor="middle">Best quality, honest pricing, and friendly service</text>
    <text x="0" y="42" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-style="italic" font-weight="600" fill="#E2E8F0" text-anchor="middle">every single time. Highly recommended!</text>
  </g>
  <text x="400" y="555" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700" fill="#93C5FD" text-anchor="middle">Thank you for making us your first choice!</text>
</svg>
`);

// 17. Business: 100% Quality & Service Guarantee
const posterServiceGuarantee = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="grntGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#064E3B" />
      <stop offset="100%" stop-color="#022C22" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#grntGrad)" />
  <circle cx="400" cy="230" r="85" fill="#047857" stroke="#F59E0B" stroke-width="6" />
  <text x="400" y="220" font-family="'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="900" fill="#FFFFFF" text-anchor="middle">100%</text>
  <text x="400" y="255" font-family="'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="900" fill="#FDE047" text-anchor="middle" letter-spacing="2">VERIFIED</text>
  <text x="400" y="375" font-family="'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="900" fill="#FFFFFF" text-anchor="middle">OUR PROMISE TO YOU</text>
  <text x="400" y="435" font-family="'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="800" fill="#34D399" text-anchor="middle">Genuine Quality • Honest Rates • Reliable Support</text>
  <g transform="translate(400, 510)">
    <rect x="-270" y="-35" width="540" height="70" rx="35" fill="#047857" opacity="0.6" stroke="#10B981" stroke-width="2" />
    <text x="0" y="9" font-family="'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF" text-anchor="middle">We stand 100% behind every product we sell.</text>
  </g>
</svg>
`);

// 18. Trending: National Days (Independence & Republic Day)
const posterNationalDays = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="tricolor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FF9933" />
      <stop offset="35%" stop-color="#FF9933" />
      <stop offset="45%" stop-color="#FFFFFF" />
      <stop offset="55%" stop-color="#FFFFFF" />
      <stop offset="65%" stop-color="#138808" />
      <stop offset="100%" stop-color="#138808" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#tricolor)" />
  <circle cx="400" cy="400" r="55" fill="none" stroke="#000080" stroke-width="4" />
  <circle cx="400" cy="400" r="8" fill="#000080" />
  <text x="400" y="210" font-family="'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="900" fill="#FFFFFF" text-anchor="middle">PROUD TO BE INDIAN</text>
  <text x="400" y="265" font-family="'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="800" fill="#78350F" text-anchor="middle">Warm Greetings on this Historic National Day</text>
  <text x="400" y="550" font-family="'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="900" fill="#FFFFFF" text-anchor="middle">HONORING OUR HEROES</text>
  <text x="400" y="605" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700" fill="#DCFCE7" text-anchor="middle">Together building a stronger, brighter tomorrow.</text>
</svg>
`);

// 19. Trending: Festival Celebration
const posterFestivalGeneral = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="festGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#581C87" />
      <stop offset="50%" stop-color="#7C2D12" />
      <stop offset="100%" stop-color="#831843" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#festGrad)" />
  <circle cx="400" cy="220" r="140" fill="#F59E0B" opacity="0.15" />
  <text x="400" y="210" font-family="'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="900" fill="#FDE047" text-anchor="middle" letter-spacing="4">FESTIVE CELEBRATIONS</text>
  <text x="400" y="320" font-family="'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="900" fill="#FFFFFF" text-anchor="middle">Joy, Health &amp; Success</text>
  <text x="400" y="390" font-family="'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="700" fill="#FDE68A" text-anchor="middle">Warm festive greetings to you and your loved ones!</text>
  <g transform="translate(400, 480)">
    <rect x="-240" y="-30" width="480" height="60" rx="30" fill="#FFFFFF" opacity="0.12" />
    <text x="0" y="8" font-family="'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF" text-anchor="middle">Special festive discounts available all week.</text>
  </g>
</svg>
`);

// 20. Trending: Special Days
const posterSpecialDays = svgToDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="spcGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0284C7" />
      <stop offset="100%" stop-color="#0369A1" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#spcGrad)" />
  <circle cx="400" cy="230" r="130" fill="#FFFFFF" opacity="0.08" />
  <text x="400" y="220" font-family="'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="900" fill="#BAE6FD" text-anchor="middle" letter-spacing="3">SPECIAL MOMENT</text>
  <text x="400" y="330" font-family="'Segoe UI', Roboto, sans-serif" font-size="62" font-weight="900" fill="#FFFFFF" text-anchor="middle">Celebrating Today</text>
  <text x="400" y="400" font-family="'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="700" fill="#E0F2FE" text-anchor="middle">Wishing you happiness, peace, and good health.</text>
  <g transform="translate(400, 490)">
    <rect x="-220" y="-30" width="440" height="60" rx="30" fill="#FFFFFF" opacity="0.18" />
    <text x="0" y="9" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700" fill="#FFFFFF" text-anchor="middle">Honoring Every Cherished Milestone</text>
  </g>
</svg>
`);

export const defaultWhatsAppMarketingTemplates = [
  {
    id: "wm-gm-1",
    title: "Good Morning - Balanced Books",
    category: "Greetings",
    subcategory: "Good Morning",
    image: posterGoodMorning1,
    overlayConfig: {},
  },
  {
    id: "wm-gm-2",
    title: "सुप्रभात - सफलता का अध्याय",
    category: "Greetings",
    subcategory: "Good Morning",
    image: posterSuprabhat,
    overlayConfig: {},
  },
  {
    id: "wm-mot-1",
    title: "अपने सपनों को पंख दो",
    category: "Greetings",
    subcategory: "Motivation",
    image: posterMotivation1,
    overlayConfig: {},
  },
  {
    id: "wm-gt-1",
    title: "नई सुबह, नई उम्मीदें",
    category: "Greetings",
    subcategory: "Good Thoughts ( Suvichar )",
    image: posterGoodThoughts1,
    overlayConfig: {},
  },
  {
    id: "wm-mot-2",
    title: "Every Step Counts",
    category: "Greetings",
    subcategory: "Motivation",
    image: posterMotivation2,
    overlayConfig: {},
  },
  {
    id: "wm-gn-1",
    title: "शुभ रात्रि - शांति और विश्राम",
    category: "Greetings",
    subcategory: "Good Night",
    image: posterGoodNight1,
    overlayConfig: {},
  },
  {
    id: "wm-diwali",
    title: "शुभ दीपावली - Festival of Lights",
    category: "Trending",
    subcategory: "Diwali",
    image: posterDiwali,
    overlayConfig: {},
  },
  {
    id: "wm-ganesh",
    title: "गणपति बाप्पा मोरया",
    category: "Trending",
    subcategory: "Ganesh Chaturthi",
    image: posterGanesh,
    overlayConfig: {},
  },
  {
    id: "wm-holi",
    title: "Happy Holi - Colors of Joy",
    category: "Trending",
    subcategory: "Holi",
    image: posterHoli,
    overlayConfig: {},
  },
  {
    id: "wm-fest-gen",
    title: "Festive Season Celebration",
    category: "Trending",
    subcategory: "Festival",
    image: posterFestivalGeneral,
    overlayConfig: {},
  },
  {
    id: "wm-nat-days",
    title: "Proud to Be Indian - National Day",
    category: "Trending",
    subcategory: "National Days",
    image: posterNationalDays,
    overlayConfig: {},
  },
  {
    id: "wm-spc-days",
    title: "Celebrating Today - Joy & Health",
    category: "Trending",
    subcategory: "Special Days",
    image: posterSpecialDays,
    overlayConfig: {},
  },
  {
    id: "wm-biz-store",
    title: "Welcome to Our Store",
    category: "Business",
    subcategory: "Store Promotion",
    image: posterStore,
    overlayConfig: {},
  },
  {
    id: "wm-biz-arrivals",
    title: "New Arrivals - Fresh Stock",
    category: "Business",
    subcategory: "New Arrivals",
    image: posterNewArrivals,
    overlayConfig: {},
  },
  {
    id: "wm-biz-reviews",
    title: "Customer Trust - 5-Star Reviews",
    category: "Business",
    subcategory: "Customer Review",
    image: posterCustomerReview,
    overlayConfig: {},
  },
  {
    id: "wm-biz-guarantee",
    title: "100% Quality & Service Guarantee",
    category: "Business",
    subcategory: "Service Guarantee",
    image: posterServiceGuarantee,
    overlayConfig: {},
  },
  {
    id: "wm-offer-sale",
    title: "Mega Sale - 50% Off",
    category: "Offers",
    subcategory: "Discount & Sale",
    image: posterMegaSale,
    overlayConfig: {},
  },
  {
    id: "wm-offer-bogo",
    title: "Buy 1 Get 1 Free",
    category: "Offers",
    subcategory: "Buy 1 Get 1",
    image: posterBogo,
    overlayConfig: {},
  },
  {
    id: "wm-offer-wknd",
    title: "Weekend Dhamaka Exclusive Deals",
    category: "Offers",
    subcategory: "Weekend Deals",
    image: posterWeekendDeals,
    overlayConfig: {},
  },
  {
    id: "wm-offer-clr",
    title: "Mega Clearance Sale - Flat 60% Off",
    category: "Offers",
    subcategory: "Mega Clearance",
    image: posterMegaClearance,
    overlayConfig: {},
  },
];
