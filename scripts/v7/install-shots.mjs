#!/usr/bin/env node
/**
 * G0 (v7 UX audit r3): the install dialog's screenshots (public/screenshots/): v7 Today in Day and Night from the real
 * app, as a 360 × 640 phone at 3× (1080 × 1920, the size scripts/check-pwa.mjs requires), on the example workspace with
 * the clock fixed so the picture is stable. N157: the scenes now live in the scene camera (scripts/v7/scene-camera.mjs).
 *
 *   VITE_ALLOW_FLAG_OVERRIDES=1 npm run build && npm run preview -- --port 4173
 *   node scripts/v7/install-shots.mjs [base-url]
 */
import {shoot} from './scene-camera.mjs';

await shoot(['install-day', 'install-night'], process.argv[2]);
