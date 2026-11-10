import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/app.css'
import {setShellRoot} from './app/shellRoot'
import {isV7Kit} from './app/v7Kit'
import {loadShellFonts} from './app/shellFonts'
if(isV7Kit())setShellRoot('v7')
loadShellFonts(isV7Kit())
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
