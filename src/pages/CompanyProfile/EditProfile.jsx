// Renders the Edit Profile page allowing users to view and update company details stored in localStorage.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiCheck,
  FiChevronDown,
  FiEdit2,
  FiInfo,
  FiUploadCloud,
  FiX,
  FiMaximize2,
} from "react-icons/fi";
import {
  companyProfileUpdatedEvent,
  getCompanyProfile,
  loadAuthoritativeCompanyProfile,
  saveCompanyProfile,
} from "../../services/companyProfileStorage";
import { companyProfileApi } from "../../services/apiClient";
import { getActiveBusinessId, getScopedStorageKey } from "../../config/businessConfig";
import { useAppSettings } from "../../hooks/useAppSettings";
import { validateGstin, cleanGstin } from "../../utils/gstinUtils";

const LOGO_FIT_MODE_STORAGE_KEY = "ledgerly:companyLogoFitMode.v1";

function getStoredLogoFitMode() {
  if (typeof window === "undefined" || !window.localStorage) return "cover";
  try {
    const saved = window.localStorage.getItem(getScopedStorageKey(LOGO_FIT_MODE_STORAGE_KEY));
    return saved === "contain" ? "contain" : "cover";
  } catch {
    return "cover";
  }
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function validateImageFile(file) {
  if (!file) return { valid: false, error: "No file selected." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: "Only JPG, PNG, WEBP, and GIF images are accepted." };
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { valid: false, error: "Image must be 10 MB or smaller." };
  }
  return { valid: true };
}

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
  const appSettings = useAppSettings() || {};
  const isGstinEnabled = appSettings.enableGstin !== false;
  const [formData, setFormData] = useState(getCompanyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [clearedFields, setClearedFields] = useState(new Set());
  const [savedNotification, setSavedNotification] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [logoFitMode, setLogoFitMode] = useState(getStoredLogoFitMode);

  const handleToggleLogoFitMode = () => {
    setLogoFitMode((prev) => {
      const next = prev === "cover" ? "contain" : "cover";
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(getScopedStorageKey(LOGO_FIT_MODE_STORAGE_KEY), next);
        }
      } catch {}
      return next;
    });
  };

  const isDirtyRef = useRef(false);
  const [, setIsDirty] = useState(false);

  const markDirty = () => {
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      setIsDirty(true);
    }
  };

  const resetDirty = () => {
    isDirtyRef.current = false;
    setIsDirty(false);
  };

  const fetchAuthoritativeProfile = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const profile = await loadAuthoritativeCompanyProfile();
      setFormData(profile);
      resetDirty();
    } catch (err) {
      console.error("[EditProfile] Failed to load authoritative company profile from MySQL:", err);
      setLoadError(err.message || "Failed to load company profile from MySQL. Check that the backend is connected.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthoritativeProfile();
  }, []);

  useEffect(() => {
    const handleProfileChange = () => {
      // Prevent database hydration or external sync from clobbering active, unsaved edits
      if (isDirtyRef.current) {
        return;
      }
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
    markDirty();
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: value,
      };
      if (name === "businessName") {
        next.companyName = value;
      } else if (name === "companyName") {
        next.businessName = value;
      } else if (name === "gstin") {
        const clean = cleanGstin(value);
        next.gstin = clean;
        if (clean.length === 15) {
          const meta = validateGstin(clean);
          if (meta.valid) {
            if (!prev.pan && meta.pan) {
              next.pan = meta.pan;
            }
            if (!prev.state && meta.stateName) {
              next.state = meta.stateName;
            }
          }
        }
      } else if (name === "phoneNumber") {
        next.phone = value;
      } else if (name === "phone") {
        next.phoneNumber = value;
      } else if (name === "emailId") {
        next.email = value;
      } else if (name === "email") {
        next.emailId = value;
      } else if (name === "businessAddress") {
        next.streetAddress = value;
        next.address = value;
      } else if (name === "streetAddress") {
        next.businessAddress = value;
        next.address = value;
      }
      if (["bankName", "accountNumber", "ifscCode", "branchName", "upiId"].includes(name)) {
        next.bankDetails = {
          ...(prev.bankDetails || {}),
          [name]: value,
        };
      }
      return next;
    });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error);
      return;
    }

    markDirty();
    setErrorMessage("");
    setClearedFields((prev) => {
      const next = new Set(prev);
      next.delete("logo");
      next.delete("logoUrl");
      return next;
    });
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({
        ...prev,
        logo: reader.result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    markDirty();
    setLogoFile(null);
    setErrorMessage("");
    setClearedFields((prev) => new Set([...prev, "logo", "logoUrl"]));
    setFormData((prev) => ({ ...prev, logo: "", logoUrl: "" }));
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error);
      return;
    }

    markDirty();
    setErrorMessage("");
    setClearedFields((prev) => {
      const next = new Set(prev);
      next.delete("signature");
      next.delete("signatureUrl");
      return next;
    });
    setSignatureFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({
        ...prev,
        signature: reader.result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveSignature = () => {
    markDirty();
    setSignatureFile(null);
    setErrorMessage("");
    setClearedFields((prev) => new Set([...prev, "signature", "signatureUrl"]));
    setFormData((prev) => ({ ...prev, signature: "", signatureUrl: "" }));
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    setIsSaving(true);
    setErrorMessage("");

    const trimmedGstin = cleanGstin(formData.gstin);
    if (isGstinEnabled && trimmedGstin) {
      const gstinResult = validateGstin(trimmedGstin, { required: false });
      if (!gstinResult.valid) {
        setErrorMessage(gstinResult.error);
        setIsSaving(false);
        return;
      }
    }

    const trimmedPhone = (formData.phone || formData.mobileNumber || "").replace(/\D/g, "");
    if (formData.phone && (trimmedPhone.length < 10 || trimmedPhone.length > 13)) {
      setErrorMessage("Please enter a valid 10-digit contact phone number.");
      setIsSaving(false);
      return;
    }

    try {
      const businessId = getActiveBusinessId();
      let finalLogoUrl = formData.logoUrl || formData.logo || "";
      let finalSignatureUrl = formData.signatureUrl || formData.signature || "";

      // 1. Upload new logo if user selected a file
      if (logoFile) {
        try {
          const asset = await companyProfileApi.uploadAsset(logoFile, "company-logo");
          finalLogoUrl = asset?.url
            ? `${asset.url}?businessId=${encodeURIComponent(businessId)}`
            : "";
        } catch (uploadErr) {
          throw new Error(uploadErr?.message || "Failed to upload business logo.", { cause: uploadErr });
        }
      } else if (!formData.logo || clearedFields.has("logo") || clearedFields.has("logoUrl")) {
        finalLogoUrl = "";
      }

      // 2. Upload new signature if user selected a file
      if (signatureFile) {
        try {
          const asset = await companyProfileApi.uploadAsset(signatureFile, "company-signature");
          finalSignatureUrl = asset?.url
            ? `${asset.url}?businessId=${encodeURIComponent(businessId)}`
            : "";
        } catch (uploadErr) {
          throw new Error(uploadErr?.message || "Failed to upload signature image.", { cause: uploadErr });
        }
      } else if (!formData.signature || clearedFields.has("signature") || clearedFields.has("signatureUrl")) {
        finalSignatureUrl = "";
      }

      const profileToSave = {
        ...formData,
        logo: finalLogoUrl,
        logoUrl: finalLogoUrl,
        signature: finalSignatureUrl,
        signatureUrl: finalSignatureUrl,
      };

      const options = {
        clearFields: Array.from(clearedFields),
      };

      const updated = await saveCompanyProfile(profileToSave, options);
      setFormData(updated);
      setLogoFile(null);
      setSignatureFile(null);
      setClearedFields(new Set());
      resetDirty();
      setSavedNotification(true);
      setTimeout(() => {
        setSavedNotification(false);
      }, 3000);
    } catch (err) {
      setErrorMessage(err.message || "Failed to save company profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setLogoFile(null);
    setSignatureFile(null);
    setErrorMessage("");
    setClearedFields(new Set());
    resetDirty();
    setFormData(getCompanyProfile());
    navigate(-1);
  };

  return (
    <div className="w-full max-w-full min-h-full bg-[#f8fafc] p-3 sm:p-4 lg:p-5">
      <div className="mx-auto max-w-7xl w-full min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:p-7 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-[#1e293b]">
            Edit Profile
          </h1>
          {isLoading && (
            <span className="text-xs font-semibold text-blue-600 animate-pulse">
              Syncing from MySQL...
            </span>
          )}
        </div>

        {loadError && (
          <div className="mt-4 mb-2 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">
            <div className="flex items-center gap-2">
              <FiAlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={fetchAuthoritativeProfile}
              className="ml-4 rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 active:scale-95 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Profile Image & Logo Section */}
        <div className="mt-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative group">
            <div
              className={`relative flex h-36 w-36 items-center justify-center rounded-2xl bg-[#F8FAFC] border-2 border-slate-200 shadow-md overflow-hidden ${
                formData.logo ? "cursor-pointer ring-2 ring-[#FF5A1F]/30 hover:ring-[#FF5A1F]" : ""
              } transition-all`}
              onClick={() => formData.logo && setShowLogoModal(true)}
              title={formData.logo ? "Click to view full image in high resolution" : "Add logo"}
            >
              {formData.logo ? (
                <>
                  <img
                    src={formData.logo}
                    alt="Company Logo"
                    className={`h-full w-full ${
                      logoFitMode === "contain" ? "object-contain p-2" : "object-cover"
                    } transition-transform duration-200 group-hover:scale-105`}
                  />
                  {/* Hover overlay with zoom hint */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                    <FiMaximize2 className="h-4 w-4 text-[#FF5A1F]" />
                    <span>View HD</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-3">
                  <FiUploadCloud className="h-8 w-8 text-slate-400 mb-1" />
                  <span className="text-xs font-semibold leading-tight text-slate-500">
                    Add Logo
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    JPG, PNG, WEBP
                  </span>
                </div>
              )}
            </div>

            {/* Pencil edit badge at bottom-right */}
            <label
              htmlFor="company-logo-file-input"
              className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-[#FF5A1F] text-white shadow-lg transition hover:bg-[#EA580C] hover:scale-105"
              title="Change logo image"
            >
              <FiEdit2 className="h-3.5 w-3.5" />
            </label>
            <input
              id="company-logo-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>

          {/* Logo Actions & Fit Controls */}
          {formData.logo && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogoModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer shadow-xs"
                >
                  <FiMaximize2 className="h-3.5 w-3.5 text-[#FF5A1F]" />
                  <span>View Full Resolution</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleLogoFitMode}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 text-xs transition cursor-pointer shadow-xs"
                  title="Toggle fit mode"
                >
                  Mode: <strong className="uppercase font-bold text-slate-800">{logoFitMode}</strong>
                </button>
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold hover:underline cursor-pointer"
                >
                  Remove Logo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Full-Resolution Logo Modal */}
        {showLogoModal && formData.logo && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            onClick={() => setShowLogoModal(false)}
          >
            <div
              className="relative max-w-2xl w-full max-h-[85vh] bg-[#161921] border border-slate-700 rounded-2xl shadow-2xl p-5 flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full flex items-center justify-between pb-3 border-b border-slate-700 mb-3">
                <span className="text-sm font-bold text-white tracking-wide">
                  Business Logo — High Resolution Original
                </span>
                <button
                  type="button"
                  onClick={() => setShowLogoModal(false)}
                  className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-auto max-h-[70vh] w-full flex items-center justify-center bg-[#0d0f14] rounded-xl p-3 border border-slate-800">
                <img
                  src={formData.logo}
                  alt="Business Logo Full Resolution"
                  className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* Form Fields Grid */}
        <form onSubmit={handleSave} className="w-full min-w-0">
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-2 xl:grid-cols-3 w-full min-w-0">
            {/* Column 1: Business Details */}
            <div className="space-y-4 min-w-0">
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
                  Trade Name
                </label>
                <input
                  type="text"
                  name="tradeName"
                  value={formData.tradeName || ""}
                  onChange={handleChange}
                  placeholder="Enter Trade Name"
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

              {isGstinEnabled && (
                <div>
                  <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5">
                      GSTIN{" "}
                      <FiInfo
                        className="cursor-pointer text-xs text-slate-400"
                        title="Goods and Services Tax Identification Number (15 alphanumeric characters)"
                      />
                    </span>
                    {cleanGstin(formData.gstin).length > 0 && cleanGstin(formData.gstin).length < 15 && (
                      <span className="text-[11px] font-medium text-slate-400">
                        {cleanGstin(formData.gstin).length}/15
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    name="gstin"
                    value={formData.gstin || ""}
                    onChange={handleChange}
                    maxLength={15}
                    placeholder="e.g. 27ABCDE1234F1Z5"
                    className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm uppercase font-mono text-slate-800 placeholder:text-slate-400 placeholder:normal-case transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {(() => {
                    const clean = cleanGstin(formData.gstin);
                    if (!clean) return null;
                    const res = validateGstin(clean);
                    if (res.valid) {
                      return (
                        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <FiCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Valid GSTIN · {res.stateName} · PAN: {res.pan}</span>
                        </p>
                      );
                    }
                    if (clean.length === 15) {
                      return (
                        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500">
                          <FiAlertCircle className="w-3.5 h-3.5" />
                          <span>{res.error}</span>
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  PAN Number
                </label>
                <input
                  type="text"
                  name="pan"
                  value={formData.pan || ""}
                  onChange={handleChange}
                  maxLength={10}
                  placeholder="Enter PAN Number"
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
            <div className="space-y-4 min-w-0">
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
                  City
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city || ""}
                  onChange={handleChange}
                  placeholder="Enter City"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
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
            <div className="flex flex-col space-y-4 min-w-0">
              {/* Spacer on large screens to align with column 1 and 2 inputs */}
              <div className="hidden h-6 xl:block" />

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
                        onClick={handleRemoveSignature}
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
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleSignatureUpload}
                  className="hidden"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Terms & Conditions
                </label>
                <textarea
                  name="termsAndConditions"
                  value={formData.termsAndConditions || ""}
                  onChange={handleChange}
                  placeholder="Enter Terms and Conditions..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  style={{ minHeight: "80px" }}
                />
              </div>
            </div>
          </div>

          {/* Bank & Payment Details */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <h2 className="mb-4 text-base font-bold text-slate-800">
              Bank & Payment Details
            </h2>
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Bank Name
                </label>
                <input
                  type="text"
                  name="bankName"
                  value={formData.bankName || ""}
                  onChange={handleChange}
                  placeholder="e.g. HDFC Bank, SBI"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Account Number
                </label>
                <input
                  type="text"
                  name="accountNumber"
                  value={formData.accountNumber || ""}
                  onChange={handleChange}
                  placeholder="Enter Account Number"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  IFSC Code
                </label>
                <input
                  type="text"
                  name="ifscCode"
                  value={formData.ifscCode || ""}
                  onChange={handleChange}
                  placeholder="e.g. HDFC0001234"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Branch Name
                </label>
                <input
                  type="text"
                  name="branchName"
                  value={formData.branchName || ""}
                  onChange={handleChange}
                  placeholder="Enter Branch Name"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  UPI ID
                </label>
                <input
                  type="text"
                  name="upiId"
                  value={formData.upiId || ""}
                  onChange={handleChange}
                  placeholder="e.g. business@upi"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
            {savedNotification && (
              <span className="mr-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <FiCheck className="h-4 w-4" /> Changes saved successfully!
              </span>
            )}
            {errorMessage && (
              <span className="mr-auto flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                <FiAlertCircle className="h-4 w-4 shrink-0" /> {errorMessage}
              </span>
            )}

            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="rounded-lg bg-slate-100 px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-[#e11d48] px-7 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#be123c] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
