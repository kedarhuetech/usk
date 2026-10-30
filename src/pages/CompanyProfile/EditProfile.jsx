// Renders the Edit Profile page allowing users to view and update company details stored in localStorage.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiCheck,
  FiChevronDown,
  FiEdit2,
  FiInfo,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import {
  companyProfileUpdatedEvent,
  getCompanyProfile,
  saveCompanyProfile,
} from "../../services/companyProfileStorage";

const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
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

const BUSINESS_TYPES = [
  "Retail",
  "Wholesale",
  "Distributor",
  "Manufacturer",
  "Services",
  "Trader",
  "Other",
];

const BUSINESS_CATEGORIES = [
  "Kirana / Grocery",
  "FMCG",
  "Electronics & Hardware",
  "Apparel & Clothing",
  "Pharmacy & Medical",
  "Restaurant & Cafe",
  "Automobile & Parts",
  "Books & Stationery",
  "Construction Materials",
  "Jewellery",
  "Services",
  "Other",
];

export default function EditProfile() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(getCompanyProfile);
  const [savedNotification, setSavedNotification] = useState(false);

  useEffect(() => {
    const handleProfileChange = () => {
      setFormData(getCompanyProfile());
    };
    window.addEventListener(companyProfileUpdatedEvent, handleProfileChange);
    window.addEventListener("storage", handleProfileChange);
    return () => {
      window.removeEventListener(companyProfileUpdatedEvent, handleProfileChange);
      window.removeEventListener("storage", handleProfileChange);
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({
        ...prev,
        logo: reader.result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({
        ...prev,
        signature: reader.result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e) => {
    e?.preventDefault?.();
    const updated = saveCompanyProfile(formData);
    setFormData(updated);
    setSavedNotification(true);
    setTimeout(() => {
      setSavedNotification(false);
    }, 3000);
  };

  const handleCancel = () => {
    setFormData(getCompanyProfile());
    navigate(-1);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#f8fafc] p-3 lg:p-5">
      <div className="mx-auto max-w-7xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:p-7">
        <h1 className="text-xl font-bold tracking-tight text-[#1e293b]">
          Edit Profile
        </h1>

        {/* Circular Logo Area */}
        <div className="relative mt-3 mb-6 inline-block">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-[#eef5fc]">
            {/* Blue arc progress indicator */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
              viewBox="0 0 100 100"
            >
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="transparent"
                strokeWidth="3.5"
              />
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="#0084ff"
                strokeWidth="3.5"
                strokeDasharray="289"
                strokeDashoffset="216"
                strokeLinecap="round"
              />
            </svg>

            {formData.logo ? (
              <img
                src={formData.logo}
                alt="Company Logo"
                className="h-full w-full rounded-full object-cover p-1"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center">
                <span className="text-sm font-semibold leading-tight text-slate-400">
                  Add
                </span>
                <span className="text-sm font-semibold leading-tight text-slate-400">
                  Logo
                </span>
              </div>
            )}

            {/* Pencil edit badge at bottom-right */}
            <label
              htmlFor="company-logo-file-input"
              className="absolute bottom-0 right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition hover:bg-slate-50"
              title="Add or edit logo"
            >
              <FiEdit2 className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold leading-none -ml-0.5">+</span>
            </label>
            <input
              id="company-logo-file-input"
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
          {formData.logo && (
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, logo: "" }))}
              className="mt-1 block w-full text-center text-xs text-rose-500 hover:underline"
            >
              Remove Logo
            </button>
          )}
        </div>

        {/* Form Fields Grid */}
        <form onSubmit={handleSave}>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
            {/* Column 1: Business Details */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-slate-800">
                Business Details
              </h2>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Business Name<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="businessName"
                  value={formData.businessName || ""}
                  onChange={handleChange}
                  placeholder="Enter Business Name"
                  required
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber || ""}
                  onChange={handleChange}
                  placeholder="Enter Phone Number"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  GSTIN{" "}
                  <FiInfo
                    className="cursor-pointer text-xs text-slate-400"
                    title="Goods and Services Tax Identification Number"
                  />
                </label>
                <input
                  type="text"
                  name="gstin"
                  value={formData.gstin || ""}
                  onChange={handleChange}
                  placeholder="Enter GSTIN"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Email ID
                </label>
                <input
                  type="email"
                  name="emailId"
                  value={formData.emailId || ""}
                  onChange={handleChange}
                  placeholder="Enter Email ID"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Column 2: More Details */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-slate-800">
                More Details
              </h2>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Business Type
                </label>
                <div className="relative">
                  <select
                    name="businessType"
                    value={formData.businessType || ""}
                    onChange={handleChange}
                    className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white px-3.5 pr-8 text-sm text-slate-700 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select Business Type</option>
                    {BUSINESS_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Business Category
                </label>
                <div className="relative">
                  <select
                    name="businessCategory"
                    value={formData.businessCategory || ""}
                    onChange={handleChange}
                    className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white px-3.5 pr-8 text-sm text-slate-700 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select Business Category</option>
                    {BUSINESS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  State
                </label>
                <div className="relative">
                  <select
                    name="state"
                    value={formData.state || ""}
                    onChange={handleChange}
                    className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white px-3.5 pr-8 text-sm text-slate-700 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Pincode
                </label>
                <input
                  type="text"
                  name="pincode"
                  value={formData.pincode || ""}
                  onChange={handleChange}
                  maxLength={6}
                  placeholder="Enter Pincode"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Column 3: Business Address & Signature */}
            <div className="flex flex-col space-y-4">
              {/* Spacer on large screens to align with column 1 and 2 inputs */}
              <div className="hidden h-6 lg:block" />

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Business Address
                </label>
                <textarea
                  name="businessAddress"
                  value={formData.businessAddress || ""}
                  onChange={handleChange}
                  placeholder="Enter Business Address"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  style={{ minHeight: "105px" }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Add Signature
                </label>
                {formData.signature ? (
                  <div className="relative flex min-h-[110px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <img
                      src={formData.signature}
                      alt="Signature Preview"
                      className="max-h-20 max-w-full object-contain"
                    />
                    <div className="mt-2 flex gap-3 text-xs">
                      <label
                        htmlFor="company-signature-file-input"
                        className="cursor-pointer font-medium text-blue-600 hover:underline"
                      >
                        Change
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, signature: "" }))
                        }
                        className="font-medium text-rose-500 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor="company-signature-file-input"
                    className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300/80 bg-slate-50/50 p-6 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-center text-slate-500">
                      <FiUploadCloud className="h-7 w-7 text-slate-400" />
                    </div>
                    <span className="mt-1 text-xs font-medium text-slate-500">
                      Upload Signature
                    </span>
                  </label>
                )}
                <input
                  id="company-signature-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleSignatureUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
            {savedNotification && (
              <span className="mr-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <FiCheck className="h-4 w-4" /> Changes saved successfully to local storage!
              </span>
            )}

            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg bg-slate-100 px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-[#e11d48] px-7 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#be123c] active:scale-[0.98]"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
