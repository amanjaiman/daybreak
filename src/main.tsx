import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SettingsProvider } from './lib/settings.tsx'
import { CustomWidgetsProvider } from './lib/customWidgets.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <CustomWidgetsProvider>
        <App />
      </CustomWidgetsProvider>
    </SettingsProvider>
  </StrictMode>,
)
