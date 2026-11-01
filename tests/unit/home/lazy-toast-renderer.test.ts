import {expect,test,vi} from 'vitest'

// The always-mounted ToastHost must not pull Markdown/KaTeX into the 4x-CPU
// cold Today entry when no notification is visible. Rich text still loads
// on demand when a notification actually contains mathematical markup.
vi.mock('../../../src/ui/Tex',()=>{
 throw new Error('Rich Markdown/KaTeX evaluated during empty ToastHost startup')
})

test('FIX #507 empty toast host does not eagerly import the rich renderer',async()=>{
 const module=await import('../../../src/ui/Toast')
 expect(typeof module.ToastHost).toBe('function')
 expect(typeof module.toast).toBe('function')
})
