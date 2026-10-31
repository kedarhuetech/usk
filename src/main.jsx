// Starts React and loads the global application styles.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { ensureLocalTestData } from './services/localTransactionTestData.js'

ensureLocalTestData();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)


// Global helper: ensure clicking anywhere on a date input or its label/wrapper opens the calendar picker
if (typeof window !== "undefined") {
  window.addEventListener("click", (event) => {
    const target = event.target;
    if (!target) return;

    // 1. Clicked directly on a date input
    if (target instanceof HTMLInputElement && target.type === "date") {
      try {
        if (typeof target.showPicker === "function") {
          target.showPicker();
        }
      } catch {}
      return;
    }

    // 2. Clicked on a label or container wrapping a date input
    const wrapper = target.closest("label, .date-filter-box, .date-picker-box, .date-input-container");
    if (wrapper) {
      const input = wrapper.querySelector('input[type="date"]');
      if (input && !input.disabled && typeof input.showPicker === "function") {
        try {
          input.showPicker();
        } catch {}
      }
    }
  });
}
