import { useEffect, useState } from "react";
import { getAppSettings, APP_SETTINGS_UPDATED_EVENT } from "../services/appSettingsStorage";

export function useAppSettings() {
  const [settings, setSettings] = useState(getAppSettings);

  useEffect(() => {
    const handleUpdate = (e) => {
      setSettings(e?.detail || getAppSettings());
    };
    const handleStorage = (e) => {
      if (!e.key || e.key.includes("appSettings")) {
        setSettings(getAppSettings());
      }
    };

    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return settings;
}

export default useAppSettings;
