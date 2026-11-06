// Implements the modal for importing parties from Phone or Gmail contacts.
import { useState, useEffect, useRef } from "react";
import {
  FiX,
  FiSearch,
  FiCheck,
  FiChevronDown,
  FiArrowLeft,
  FiUserCheck,
  FiPhone,
  FiMail,
  FiUpload,
  FiFileText,
  FiSmartphone,
} from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { parseVCard, parseContactsCsv } from "../../services/contactImportParser.js";

const GOOGLE_CLIENT_ID =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
  "504747130500-ofbr0e5g8ja7qoh07aefs9u7vceo6rch.apps.googleusercontent.com";

// Loads Google Identity Services client script dynamically
function loadGoogleIdentityScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Window not defined"));
    if (window.google?.accounts?.oauth2) return resolve(window.google.accounts.oauth2);

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google?.accounts?.oauth2));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google?.accounts?.oauth2);
    script.onerror = () => reject(new Error("Could not load Google Identity Services script."));
    document.head.appendChild(script);
  });
}

// Sample fallback contacts if no file or permissions are given
const DEMO_PHONE_CONTACTS = [
  { id: "c1", name: "Rajesh Traders (Pune)", phone: "9823412345", email: "rajesh.traders@gmail.com", address: "Market Yard, Pune" },
  { id: "c2", name: "Pooja Sharma & Co.", phone: "9876543210", email: "pooja.sharma@yahoo.com", address: "MG Road, Bengaluru" },
  { id: "c3", name: "Amit Patel Wholesale", phone: "9988776655", email: "amit.patel99@gmail.com", address: "GIDC Industrial Area, Surat" },
  { id: "c4", name: "Kavita General Store", phone: "9765432109", email: "kavita.store@outlook.com", address: "Sector 14, Gurugram" },
  { id: "c5", name: "Sunil Mehta Electronics", phone: "9811223344", email: "sunil.mehta@gmail.com", address: "Lamington Road, Mumbai" },
];

const DEMO_GMAIL_CONTACTS = [
  { id: "g1", name: "Ananya Gupta Agencies", phone: "9830123456", email: "ananya.gupta.agencies@gmail.com", address: "Park Street, Kolkata" },
  { id: "g2", name: "Vikram Malhotra Logistics", phone: "9820098200", email: "vikram.logistics@gmail.com", address: "Andheri East, Mumbai" },
  { id: "g3", name: "Deepak Supply Chain", phone: "9848011223", email: "deepak.supply@gmail.com", address: "Secunderabad, Hyderabad" },
  { id: "g4", name: "Meera Desai Fabrics", phone: "9727788990", email: "meera.fabrics@gmail.com", address: "Ring Road, Surat" },
];

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
];

function getInitials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ImportPartiesModal({ isOpen, onClose, onImportParties }) {
  const [step, setStep] = useState("input"); // "input" | "contacts"
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Google");

  const fileInputRef = useRef(null);

  // Check if browser natively supports Web Contact Picker API
  const hasNativeContactPicker = typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

  const handleModalClose = () => {
    setStep("input");
    setError("");
    setSearchQuery("");
    setContacts([]);
    setIsSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  // 3. Gmail Flow: Google Identity Services / People API
  const handleConnectGmail = async () => {
    setIsSubmitting(true);
    setError("");

    try {
      const oauth2 = await loadGoogleIdentityScript();
      if (!oauth2) throw new Error("Google Identity Services not initialized.");

      const client = oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/contacts.readonly",
        callback: async (resp) => {
          if (resp.error) {
            setIsSubmitting(false);
            if (resp.error === "access_denied") {
              setError(
                "Google Access Denied: Your Google Cloud project is in 'Testing' mode. Your Gmail account must be added to 'Test Users' in Google Cloud Console. Alternatively, export contacts from contacts.google.com and upload the .vcf/.csv file below."
              );
            } else {
              setError(`Google Sign-In: ${resp.error_description || resp.error}. You can also upload your contacts file below.`);
            }
            return;
          }

          try {
            let allConnections = [];
            let pageToken = "";
            let pageCount = 0;

            // Fetch all pages of contacts (up to 5,000 contacts)
            do {
              const url = new URL("https://people.googleapis.com/v1/people/me/connections");
              url.searchParams.set("personFields", "names,phoneNumbers,emailAddresses,addresses,organizations");
              url.searchParams.set("pageSize", "1000");
              if (pageToken) url.searchParams.set("pageToken", pageToken);

              const res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${resp.access_token}` },
              });

              if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error?.message || "Failed to fetch contacts from Google People API.");
              }

              const data = await res.json();
              const connections = data.connections || [];
              allConnections = allConnections.concat(connections);
              pageToken = data.nextPageToken || "";
              pageCount += 1;
            } while (pageToken && pageCount < 10);

            if (!allConnections.length) {
              setError("No contacts found in this Google account. Try uploading your contacts (.vcf) file below.");
              setIsSubmitting(false);
              return;
            }

            const parsed = allConnections
              .map((c, idx) => {
                const name =
                  c.names?.[0]?.displayName ||
                  c.names?.[0]?.givenName ||
                  c.organizations?.[0]?.name ||
                  c.phoneNumbers?.[0]?.value ||
                  c.emailAddresses?.[0]?.value ||
                  `Contact #${idx + 1}`;
                const phone = c.phoneNumbers?.[0]?.value?.replace(/[^\d+]/g, "") || "";
                const email = c.emailAddresses?.[0]?.value || "";
                const address = c.addresses?.[0]?.formattedValue || "";

                return {
                  id: `google-${idx}-${Date.now()}`,
                  name,
                  phone,
                  email,
                  address,
                  selected: false,
                };
              })
              .filter((c) => Boolean(c.name || c.phone || c.email));

            setContacts(parsed);
            setSourceLabel(`Google Contacts (${parsed.length})`);
            setIsSubmitting(false);
            setStep("contacts");
          } catch (fetchErr) {
            setIsSubmitting(false);
            setError(`Could not fetch live Google Contacts: ${fetchErr.message}. You can upload your contacts file below.`);
          }
        },
      });

      client.requestAccessToken({ prompt: "consent" });
    } catch (err) {
      setIsSubmitting(false);
      console.warn("Google OAuth initialization:", err);
      setError(`Google sign-in unavailable: ${err.message}. You can upload your exported contacts (.vcf / .csv) below.`);
    }
  };

  // 4. File Upload Handler: Imports from .vcf or .csv file
  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result || "";
      let parsed;
      if (file.name.toLowerCase().endsWith(".vcf") || content.includes("BEGIN:VCARD")) {
        parsed = parseVCard(content);
        setSourceLabel(`vCard (${file.name})`);
      } else {
        parsed = parseContactsCsv(content);
        setSourceLabel(`CSV (${file.name})`);
      }

      if (parsed.length > 0) {
        setContacts(parsed);
        setError("");
        setStep("contacts");
      } else {
        setError(`No readable contacts found in "${file.name}". Please ensure it's a valid .vcf or .csv file.`);
      }
    };
    reader.onerror = () => setError("Failed to read the selected file.");
    reader.readAsText(file);
    event.target.value = "";
  };

  // Trigger device contact picker directly
  const handlePickDeviceContacts = async () => {
    if (!hasNativeContactPicker) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const picked = await navigator.contacts.select(["name", "tel", "email", "address"], { multiple: true });
      if (picked && picked.length > 0) {
        const list = picked.map((c, i) => ({
          id: `dev-${i}-${Date.now()}`,
          name: c.name?.[0] || c.tel?.[0] || "Device Contact",
          phone: c.tel?.[0]?.replace(/[^\d+]/g, "") || "",
          email: c.email?.[0] || "",
          address: c.address?.[0]?.addressLine?.[0] || "",
          selected: false,
        }));
        setContacts(list);
        setSourceLabel("Phone Device");
        setStep("contacts");
      }
    } catch (err) {
      console.warn("Device contact pick error:", err);
    }
  };

  // Selection toggles
  const toggleContact = (id) => {
    setContacts((current) => current.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  };

  const toggleAll = () => {
    const allSelected = contacts.every((c) => c.selected);
    setContacts((current) => current.map((c) => ({ ...c, selected: !allSelected })));
  };

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  const selectedCount = contacts.filter((c) => c.selected).length;

  const handleConfirmImport = () => {
    const selected = contacts.filter((c) => c.selected);
    if (!selected.length) {
      setError("Please select at least one contact to import.");
      return;
    }
    onImportParties(selected);
    handleModalClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs transition"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleModalClose();
      }}
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-2xl bg-white shadow-2xl transition animate-in fade-in zoom-in-95 duration-200"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Hidden File Input for .vcf / .csv Contact Files */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".vcf,.vcard,.csv"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* STEP 1: Google Contacts or File Upload */}
        {step === "input" && (
          <div className="p-7">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Import Parties from Contacts
                </h2>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                  Quickly create parties using your Google Contacts or exported address book file.
                </p>
              </div>
              <button
                type="button"
                onClick={handleModalClose}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 leading-relaxed shadow-xs">
                <div className="font-bold flex items-center gap-1.5 text-rose-800 mb-1">
                  <span>⚠️</span>
                  <span>Permission Notice</span>
                </div>
                <p>{error}</p>
              </div>
            )}

            <div className="mt-5 space-y-3.5">
              {/* Option A: Google Contacts Sync */}
              <div className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-xs hover:border-blue-400 transition">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 border border-slate-100 shadow-xs">
                    <FcGoogle className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-800">Sign in with Google</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Sync parties directly from your saved Google / Gmail Contacts.
                    </p>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleConnectGmail}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#1A1F71] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#14185D] active:scale-98 transition disabled:opacity-50"
                    >
                      <FcGoogle className="h-4 w-4 bg-white rounded-full p-0.5" />
                      {isSubmitting ? "Connecting to Google..." : "Connect Google Contacts"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Option B: Upload .vcf or .csv Contacts File */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-5 text-center transition hover:border-blue-500 hover:bg-blue-50/30"
              >
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-blue-100 text-blue-600 group-hover:scale-105 transition">
                  <FiUpload className="h-5 w-5" />
                </div>
                <h4 className="mt-2 text-xs font-bold text-slate-800">
                  Upload Contacts File (.vcf or .csv)
                </h4>
                <p className="mt-1 text-[11px] text-slate-500">
                  Export from your Phone Contacts app or <a href="https://contacts.google.com" target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-600 underline font-medium">contacts.google.com</a> → Export.
                </p>
                <span className="mt-2.5 inline-block rounded-md bg-white border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-700 shadow-xs group-hover:border-blue-300">
                  Browse File
                </span>
              </div>

              {/* Native Device Contact Picker (Available on Mobile Chrome) */}
              {hasNativeContactPicker && (
                <button
                  type="button"
                  onClick={handlePickDeviceContacts}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
                >
                  <FiSmartphone className="h-4 w-4" />
                  Select Directly from Phonebook
                </button>
              )}

              {/* Quick Sample Contacts Shortcut */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setContacts(DEMO_GMAIL_CONTACTS.map((c) => ({ ...c, selected: false })));
                    setSourceLabel("Sample Contacts");
                    setStep("contacts");
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Load Sample Contacts for Testing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Contacts Selection & Import */}
        {step === "contacts" && (
          <div className="flex flex-col max-h-[85vh]">
            <header className="border-b border-slate-100 p-5 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <FiUserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Select Contacts to Import</h2>
                    <p className="text-xs text-slate-500">
                      Loaded {contacts.length} contacts ({sourceLabel})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              {/* Source & Sync Options Info */}
              <div className="mt-2.5 flex items-center justify-between rounded-lg bg-blue-50/70 px-3 py-1.5 text-[11px] text-blue-900 border border-blue-100">
                <span>
                  Source: <strong className="font-semibold">{sourceLabel}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConnectGmail}
                    className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <FcGoogle className="h-3 w-3" /> Connect Google
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <FiUpload className="h-3 w-3" /> Upload File
                  </button>
                </div>
              </div>

              {/* Search & Actions */}
              <div className="mt-3.5 flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:border-blue-400 focus-within:bg-white transition">
                  <FiSearch className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name or number..."
                    className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <FiX className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  title="Upload more contacts from .vcf or .csv"
                >
                  <FiFileText className="h-3.5 w-3.5 inline mr-1" /> Add File
                </button>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  {contacts.every((c) => c.selected) ? "Deselect All" : "Select All"}
                </button>
              </div>
            </header>

            {/* Contacts Scrollable List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[220px] max-h-[360px]">
              {filteredContacts.map((contact, index) => {
                const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];
                return (
                  <div
                    key={contact.id}
                    onClick={() => toggleContact(contact.id)}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 cursor-pointer transition ${
                      contact.selected
                        ? "border-emerald-300 bg-emerald-50/50 shadow-2xs"
                        : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Checkbox */}
                      <div
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                          contact.selected
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {contact.selected && <FiCheck className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>

                      {/* Initials Avatar */}
                      <div
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${colorClass}`}
                      >
                        {getInitials(contact.name)}
                      </div>

                      {/* Info */}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {contact.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                          {contact.phone && (
                            <span className="flex items-center gap-1">
                              <FiPhone className="h-3 w-3 text-slate-400" />
                              {contact.phone}
                            </span>
                          )}
                          {contact.email && (
                            <span className="truncate flex items-center gap-1">
                              <FiMail className="h-3 w-3 text-slate-400" />
                              {contact.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!filteredContacts.length && (
                <div className="py-8 text-center text-xs text-slate-400">
                  No matching contacts found for "{searchQuery}"
                </div>
              )}
            </div>

            {/* Sticky Bottom Actions */}
            <footer className="border-t border-slate-100 bg-slate-50 p-4 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-600">
                {selectedCount} of {contacts.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedCount === 0}
                  onClick={handleConfirmImport}
                  className={`rounded-full px-5 py-2 text-xs font-bold transition shadow-xs ${
                    selectedCount > 0
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  Import {selectedCount} {selectedCount === 1 ? "Party" : "Parties"}
                </button>
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
