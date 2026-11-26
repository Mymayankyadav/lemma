// Runs with check-kit in the branch gate. Surface owners supply presence, focus and dismissal for every caller.
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';
const issues = [];
const report = (file, desc) => issues.push(file+' – '+desc);
function files(dir) {
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);
}
const sources = files('src');
const migrated = /^(?:src\/app\/RouteError\.tsx|src\/features\/(?:pad\/(?:PadNavigationGuard|PadMathKeyboard|OfflinePadPage|LocalPadWorkspace|LocalPadEditor|LocalPadInk)\.tsx|sources\/v7\/))/;
const legacyColor = /var\(\s*--(?:obsidian(?:-deep)?|slab|tile|well|ink(?:-[2-4])?|amber|paper(?:-2)?|edge(?:-[23])?|fill-[12]|hair|line|control-edge|glass-strong)\s*[,)]/;
const legacyClass = /(?:^|\s)(?:bg-(?:slab|tile|obsidian|well)|text-(?:ink(?:-[234])?|amber)|border-edge|btn-primary|legacy-sheet)(?=\s|$)/;
const roleOwners = new Set(['src/ui/v7/Sheet.tsx','src/ui/v7/ChoiceSurface.tsx']);
for (const file of sources.filter(file=>file.includes('/v7/') || migrated.test(file))) {
  if (!/\.(?:css|tsx?)$/.test(file)) continue;
  const source = readFileSync(file,'utf8');
  if (file.endsWith('.css')) {
    const css=source.replace(/\/\*[\s\S]*?\*\//g,'');
    if (!file.endsWith('/motion.css') && /(?:^|[\s:(,])(?:\d*\.)?\d+(?:ms|s)\b/.test(css))
      report(file,'CSS durations belong in motion.css');
    if (legacyColor.test(css)) report(file,'use a v7 colour role');
    continue;
  }
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function inspect(node) {
    if (ts.isImportDeclaration(node) && /(?:^|\/)ui\/Sheet$/.test(node.moduleSpecifier.text))
      report(file,'import the registered v7 Sheet directly');
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag=node.tagName.getText(ast);
      const attrs=node.attributes.properties.filter(ts.isJsxAttribute);
      const role=attrs.find(attr=>attr.name.getText(ast)==='role')?.initializer;
      const className=attrs.find(attr=>attr.name.getText(ast)==='className')?.initializer;
      if (className && ts.isStringLiteral(className) && legacyClass.test(className.text)) report(file,'legacy control class on '+tag);
      if ((tag==='dialog'||(role&&ts.isStringLiteral(role)&&['dialog','alertdialog'].includes(role.text)))
        && !attrs.some(attr=>attr.name.getText(ast)==='data-surface-role') && !roleOwners.has(file))
        report(file,'a new dialog must declare its surface role and use the registered owner');
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text==='showModal' && !roleOwners.has(file)) report(file,'use the presence-aware Sheet for a conditional modal');
      if (/^(?:window\.)?location\.reload$/.test(node.expression.getText(ast))) {
        let parent=node.parent;
        while(parent && !ts.isJsxAttribute(parent)) parent=parent.parent;
        if (!parent || parent.name.getText(ast)!=='onClick') report(file,'reload must be an explicit user action');
      }
    }
    if (ts.isStringLiteralLike(node) && legacyColor.test(node.text)) report(file,'legacy colour variable');
    ts.forEachChild(node,inspect);
  }
  inspect(ast);
}
const sheet=readFileSync('src/ui/v7/Sheet.tsx','utf8');
if(!sheet.includes('retainSheetExit(dialog)') || !sheet.includes('registerLayer({')) report('Sheet.tsx','conditional mounts must retain exit pixels and release their registered layer');
if (issues.length) throw new Error('Surface contract\n'+[...new Set(issues)].join('\n'));
