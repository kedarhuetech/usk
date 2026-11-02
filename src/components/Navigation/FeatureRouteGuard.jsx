import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getAppSettings, APP_SETTINGS_UPDATED_EVENT } from "../../services/appSettingsStorage";

export default function FeatureRouteGuard({ featureKey, fallback = "/sales/sale-invoices", children }) {
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

  if (featureKey && !settings[featureKey]) {
    return <Navigate to={fallback} replace />;
  }

  return children;
}

