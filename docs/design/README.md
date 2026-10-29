# Design references

Approved by the owner on 29 Oct 2026. Precedence: `docs/spec/design.md`, then these boards, then the reference image.

- `reference-amber-on-obsidian.png`: the direction the owner chose.
- `canvas/*.dc.html`: boards exported from the design canvas. Phone screens are 390 px wide; system boards are 1,280 px. They were written for the canvas runtime (`support.js`, `<x-dc>`, `<sc-if>`, `<sc-for>`, `{{holes}}`), so they do not run on their own. Read them for exact sizes, colours, shadows, gradients and the CSS keyframes of each animation; the logic at the bottom of interactive boards shows the intended behaviour.

| Board | Screen | Task |
| --- | --- | --- |
| `Main.dc.html` | Home | SCR-HOME |
| `Projects.dc.html` | Projects | SCR-PROJ |
| `NewProject.dc.html` | New project with PDF reading | SCR-PROJ |
| `Path.dc.html` | Project path, sessions, sources | SCR-PATH |
| `Session.dc.html` | Session record | SCR-SESS |
| `Proposals.dc.html` | Approve (cards, plan changes) | SCR-PROP |
| `PlanReview.dc.html` | Plan proposal | SCR-PROP |
| `Review.dc.html` | Review hub | SCR-REV |
| `Card.dc.html` | Card review | SCR-REV |
| `Done.dc.html` | Review complete | SCR-REV |
| `CardDetail.dc.html` | Card detail and notes for the tutor | SCR-CARD |
| `Atlas.dc.html` | Atlas | SCR-ATLAS |
| `Insights.dc.html` | Insights | SCR-INS |
| `Connect.dc.html` | Settings and connector | SCR-SET |
| `Chat.dc.html` | How a resume looks inside a chat app (illustration, not an app screen) | MCP-1 reference |
| `Foundations.dc.html` | Colours, type, depth, radius, spacing, icons, components | UI-1 |
| `Motion.dc.html` | Every animation with timing | UI-1, UI-2 |
| `States.dc.html` | Empty, loading, offline and error states | UI-2 and every screen |

Numbers on the boards match the demo dataset in `docs/spec/data.md` §10.
