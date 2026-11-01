import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// FIX-648b: the cold, non-creating Cards list must not evaluate the
// motion-backed Sheet module before its first interactive row.
const page=readFileSync('src/features/cards/Page.tsx','utf8');

describe('FIX-648b defer Cards create-sheet until requested',()=>{
 it('keeps Sheet out of the initial static Cards module graph',()=>{
  expect(page).not.toMatch(/import\s*\{\s*Sheet\s*\}\s*from\s*['"]\.\.\/\.\.\/ui\/Sheet['"]/);
  expect(page).toContain("lazy(()=>import('../../ui/Sheet')");
  expect(page).toContain('if(!props.open&&!activated)return null');
 });
 it('keeps the sheet mounted after first open for close animation and reopening',()=>{
  expect(page).toContain('if(props.open)setActivated(true)');
  expect(page).toContain('<LazySheet {...props}/>');
  expect(page).toContain('<CreateSheet open={creating}');
  expect(page).toContain('onClose={closeCreating}');
 });
});


describe('FIX-648b cold Cards rich-render module split',()=>{
 it('does not eagerly load Markdown/KaTeX for ordinary card fronts or project chips',()=>{
  const titles=readFileSync('src/features/cards/ProjectFilterTitle.tsx','utf8');
  expect(page).not.toContain("import {Tex} from '../../ui/Tex'");
  expect(page).toContain("import {FastTex as Tex} from '../../ui/FastTex'");
  expect(titles).not.toContain("import {Tex} from '../../ui/Tex'");
  expect(titles).toContain("import {FastTex as Tex} from '../../ui/FastTex'");
  // The existing conservative guards still send ambiguous mathematical and
  // Markdown card fronts and project titles through the canonical renderer.
  expect(page).toContain('canRenderPlainCardFront(row.front)?row.front:<Tex source={row.front}/>');
  expect(titles).toContain('needsRichTitle(title)?<Tex source={title}/>:title');
 });
});
