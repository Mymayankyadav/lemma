import {beforeEach,expect,test,vi} from 'vitest'
import {renderMarkdown} from '../../../src/lib/render'
import {renderInlineTex} from '../../../src/ui/Tex'

// Spy on the real renderer: assertions exercise actual KaTeX and DOMPurify,
// rather than trusting a fake HTML implementation.
vi.mock('../../../src/lib/render',async importOriginal=>{
 const actual=await importOriginal<typeof import('../../../src/lib/render')>()
 return {...actual,renderMarkdown:vi.fn(actual.renderMarkdown)}
})
beforeEach(()=>vi.mocked(renderMarkdown).mockClear())

test('FIX-659e repeated short mathematical titles reuse the same sanitized rendering',()=>{
 const source='Title $\\alpha_{659e} + \\beta$'
 const first=renderInlineTex(source)
 const second=renderInlineTex(source)
 expect(first).toBe(second)
 expect(first).toContain('katex')
 expect(renderMarkdown).toHaveBeenCalledTimes(1)
})

test('FIX-659e cache is bounded and evicts least-recently-used entries',()=>{
 for(let i=0;i<140;i++)renderInlineTex('FIX-659e title '+i)
 expect(renderMarkdown).toHaveBeenCalledTimes(140)
 renderInlineTex('FIX-659e title 0')
 expect(renderMarkdown).toHaveBeenCalledTimes(141)
})

test('FIX-659e long content bypasses the title cache and is always sanitized',()=>{
 const source='Long title '+('x'.repeat(600))+' <img src=x onerror=alert(1)>'
 const first=renderInlineTex(source)
 const second=renderInlineTex(source)
 expect(first).toBe(second)
 expect(first).not.toMatch(/onerror|<script/)
 expect(renderMarkdown).toHaveBeenCalledTimes(2)
})

test('FIX-659e does not retain oversized expanded HTML',()=>{
 const source='FIX-659e oversized cache entry'
 vi.mocked(renderMarkdown).mockImplementationOnce(()=>'<span>'+('x'.repeat(25_000))+'</span>')
 const first=renderInlineTex(source)
 const second=renderInlineTex(source)
 expect(first.length).toBeGreaterThan(24_000)
 expect(second).toContain('FIX-659e oversized cache entry')
 expect(renderMarkdown).toHaveBeenCalledTimes(2)
})
test('FIX-659e cached default title cannot inherit a previous custom macro preamble',()=>{
 const source='$\\fieldcache$'
 renderMarkdown(source,{macros:'\\newcommand{\\fieldcache}{\\mathbb{F}}',inline:true})
 const actual=renderInlineTex(source)
 const doc=new DOMParser().parseFromString(actual,'text/html')
 expect(doc.querySelector('math mtext')?.textContent).toBe('\\fieldcache')
 expect(doc.querySelector('math mi')).toBeNull()
})
