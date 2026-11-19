import React, { createContext, useContext, useEffect, useState } from "react";

const THEME_KEY = "ledgerly:theme";
const THEME_MIGRATION_KEY = "ledgerly:charcoal_theme_applied_v2";
const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const theme = "light";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
    try {
      localStorage.setItem(THEME_KEY, "light");
      localStorage.removeItem(THEME_MIGRATION_KEY);
      window.dispatchEvent(new Event("ledgerly:theme-changed"));
    } catch {}
  }, []);

  const toggleTheme = () => {};

  return (
    <ThemeContext.Provider value={{ theme: "light", toggleTheme, isDark: false }}>
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

