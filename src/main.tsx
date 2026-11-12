import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/app.css'
import {setShellRoot} from './app/shellRoot'
import {isV7Route} from './app/v7Kit'
import {loadShellFonts} from './app/shellFonts'
import {isNative} from './platform/native'
import {bootReduceEffects} from './ui/v7/effects'
if(isV7Route())setShellRoot('v7')
bootReduceEffects()
loadShellFonts(isV7Route())
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
// N123: the Android app's system surfaces load only inside the app, after the first render.
if(isNative())void import('./platform/start').then(platform=>platform.startNative()).catch(()=>undefined)
