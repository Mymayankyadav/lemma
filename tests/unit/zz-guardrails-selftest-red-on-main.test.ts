import {expect,it} from 'vitest'

// Guardrails self-test (temporary, reverted automatically by CI): this passes everywhere except on a push to
// main, so merging it turns main red once. The revert job must then open and merge a revert PR through the
// real ruleset using CI_BOT_TOKEN, and the green run after it closes the S0 incident.
it('guardrails selftest: red only on a push to main',()=>{
 const onMainPush=process.env.GITHUB_EVENT_NAME==='push'&&process.env.GITHUB_REF==='refs/heads/main'
 expect(onMainPush).toBe(false)
})
