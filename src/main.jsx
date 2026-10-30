// Starts React and loads the global application styles.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ensureLocalTestData } from './services/localTransactionTestData.js'

ensureLocalTestData();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
