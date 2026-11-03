import React, { createContext, useContext, useEffect, useState } from "react";

const THEME_KEY = "ledgerly:theme";
const THEME_MIGRATION_KEY = "ledgerly:charcoal_theme_applied_v2";
const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const migrated = localStorage.getItem(THEME_MIGRATION_KEY);
      if (!migrated) {
        localStorage.setItem(THEME_MIGRATION_KEY, "true");
        localStorage.setItem(THEME_KEY, "dark");
        return "dark";
      }
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch {}
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
      window.dispatchEvent(new Event("ledgerly:theme-changed"));
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: "light",
      toggleTheme: () => {},
      isDark: false,
    };
  }
  return context;
}

