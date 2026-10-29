import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(<StrictMode><main className="ground" /></StrictMode>)
