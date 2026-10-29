import Page0 from '../features/home/Page'
import Page1 from '../features/projects/Page'
import Page2 from '../features/new-project/Page'
import Page3 from '../features/project/Page'
import Page4 from '../features/checkpoint/Page'
import Page5 from '../features/session/Page'
import Page6 from '../features/proposals/Page'
import Page7 from '../features/plan-proposal/Page'
import Page8 from '../features/review/Page'
import Page9 from '../features/review-run/Page'
import Page10 from '../features/review-done/Page'
import Page11 from '../features/cards/Page'
import Page12 from '../features/card/Page'
import Page13 from '../features/atlas/Page'
import Page14 from '../features/insights/Page'
import Page15 from '../features/settings/Page'
import Page16 from '../features/sign-in/Page'
import Page17 from '../features/kit/Page'
/** The canonical route inventory from design.md §6. */
export const screenRoutes = [
 {path: '/', element: <Page0 /> },
 {path: '/projects', element: <Page1 /> },
 {path: '/projects/new', element: <Page2 /> },
 {path: '/p/:slug', element: <Page3 /> },
 {path: '/p/:slug/cp/:code', element: <Page4 /> },
 {path: '/s/:slug/:n', element: <Page5 /> },
 {path: '/proposals', element: <Page6 /> },
 {path: '/proposals/:id', element: <Page7 /> },
 {path: '/review', element: <Page8 /> },
 {path: '/review/run', element: <Page9 /> },
 {path: '/review/done', element: <Page10 /> },
 {path: '/cards', element: <Page11 /> },
 {path: '/cards/:no', element: <Page12 /> },
 {path: '/atlas', element: <Page13 /> },
 {path: '/insights', element: <Page14 /> },
 {path: '/settings', element: <Page15 /> },
 {path: '/sign-in', element: <Page16 /> },
 {path: '/kit', element: <Page17 /> },
]
