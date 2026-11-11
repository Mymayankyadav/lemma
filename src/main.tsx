import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/app.css'
import {setShellRoot} from './app/shellRoot'
import {isV7Route} from './app/v7Kit'
import {loadShellFonts} from './app/shellFonts'
if(isV7Route())setShellRoot('v7')
loadShellFonts(isV7Route())
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
