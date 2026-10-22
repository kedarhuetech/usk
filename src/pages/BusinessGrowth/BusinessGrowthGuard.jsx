import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { FiLock, FiArrowRight } from "react-icons/fi";
import { googleProfileService } from "../../services/googleProfileService";
import { API_BASE_URL } from "../../services/apiClient";

export default function BusinessGrowthGuard() {
  // --- TEMPORARY BYPASS: Uncomment this line to allow full access to everything ---
  return <Outlet />;

  /*
  const [status, setStatus] = useState("loading"); // "loading" | "allowed" | "denied"
  const location = useLocation();

  const checkAuth = async () => {
    setStatus("loading");
    const auth = await googleProfileService.verifyGoogleBusinessAccount();
    if (auth.allowed) {
      setStatus("allowed");
    } else {
      setStatus("denied");
    }
  };

  useEffect(() => {
    checkAuth();
  }, [location.pathname]);

  // Loading indicator while checking authentication
  if (status === "loading") {
    return (
      <div className="grid min-h-[calc(100vh-184px)] place-items-center bg-slate-50 text-slate-500 text-sm">
        Checking Google Business account...
      </div>
    );
  }

  // Always allow the Google Profile Manager page itself so they can see settings/profile
  if (location.pathname.includes("google-profile-manager")) {
    return <Outlet />;
  }

  // If verified by Google, allow access to all features (WhatsApp, Store, Ads, etc.)
  if (status === "allowed") {
    return <Outlet />;
  }

  // If NOT logged in / NOT a verified business, show this banner blocking the feature
  return (
    <div className="grid min-h-[calc(100vh-184px)] place-items-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <FiLock className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">
          Please login first through Google Business account
        </h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          This feature requires an active, verified Google Business Profile to
          publish campaigns, manage reviews, or run smart tools.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              window.location.href = `${API_BASE_URL}/api/auth/google`;
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            Connect Google Business Account <FiArrowRight />
          </button>
          <button
            type="button"
            onClick={checkAuth}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Recheck Login Status
          </button>
        </div>
      </div>
    </div>
  );
  */
}
