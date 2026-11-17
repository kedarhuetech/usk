import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiInfo } from "react-icons/fi";
import { getAppSettings, APP_SETTINGS_UPDATED_EVENT } from "../../services/appSettingsStorage";

export default function FeatureRouteGuard({ featureKey, children }) {
  const [settings, setSettings] = useState(getAppSettings);

  useEffect(() => {
    const handleUpdate = () => setSettings(getAppSettings());
    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const isEnabled = !featureKey || Boolean(settings[featureKey]);

  return (
    <>
      {!isEnabled && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <FiInfo className="h-4 w-4 text-amber-600 shrink-0" />
            <span>This feature is currently hidden from main navigation in Settings.</span>
          </div>
          <Link
            to="/settings?tab=transaction"
            className="font-semibold text-amber-800 underline hover:text-amber-950 transition"
          >
            Enable in Settings
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
