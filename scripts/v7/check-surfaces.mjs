// Runs with check-kit in the branch gate. Surface owners supply presence, focus and dismissal for every caller.
import {readFileSync, readdirSync} from 'node:fs';
import {dirname,join,normalize} from 'node:path';
import ts from 'typescript';
const issues = [];
const report = (file, desc) => issues.push(file+' – '+desc);
function files(dir) {
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);
}
const sources = files('src');
const allFiles = new Set(sources);
const directV7 = file => file.includes('/v7/') || file === 'src/app/RouteError.tsx';
// Migration roots are deliberately the settings, Pad and Sources contracts. Follow rendered
// JSX imports, not data helpers or the legacy shell dependency graph.
const sharedSurface = /^(?:src\/features\/(?:pad\/|settings\/|project\/(?:SourcesPanel|SourceTranscriptionView)))/;
const parse = file => ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
const modules = new Map();
function tree(file) {
  if (!modules.has(file)) modules.set(file,parse(file));
  return modules.get(file);
}
function resolveImport(file,specifier) {
  if (!specifier.startsWith('.')) return null;
  const path = normalize(join(dirname(file),specifier));
  return [path,path+'.tsx',path+'.ts',join(path,'index.tsx'),join(path,'index.ts')].find(candidate=>allFiles.has(candidate))??null;
}
const inspected = new Set(sources.filter(directV7));
for (const file of inspected) {
  if (!/\.tsx?$/.test(file)) continue;
  const ast = tree(file), imports = new Map();
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const target = resolveImport(file,statement.moduleSpecifier.text);
    if (!target) continue;
    if (target.endsWith('.css')) {
      if (directV7(target) || sharedSurface.test(file) || directV7(file)) inspected.add(target);
      continue;
    }
    if (!sharedSurface.test(target)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) imports.set(clause.name.text,target);
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) imports.set(clause.namedBindings.name.text,target);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) if (!element.isTypeOnly) imports.set(element.name.text,target);
    }
  }
  function findRenderedImport(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const target = imports.get(node.tagName.getText(ast).split('.')[0]);
      if (target && target.endsWith('.tsx')) inspected.add(target);
    }
    ts.forEachChild(node,findRenderedImport);
  }
  findRenderedImport(ast);
}
const legacyColor = /var\(\s*--(?:obsidian(?:-deep)?|slab|tile|well|ink(?:-[2-4])?|amber|paper(?:-2)?|edge(?:-[23])?|fill-[12]|hair|line|control-edge|glass-strong)\s*[,)]/;
const legacyClass = /(?:^|[\s:])(?:bg-(?:slab|tile|obsidian|well|fill-[12])|text-(?:ink(?:-[234])?|amber)|border-edge(?:-[23])?|btn-primary|legacy-sheet)(?=\s|$)/;
const roleOwners = new Set(['src/ui/v7/Sheet.tsx','src/ui/v7/ChoiceSurface.tsx']);
for (const file of inspected) {
  if (!/\.(?:css|tsx?)$/.test(file)) continue;
  const source = readFileSync(file,'utf8');
  if (file.endsWith('.css')) {
    const css=source.replace(/\/\*[\s\S]*?\*\//g,'');
    if (!file.endsWith('/motion.css') && /(?:^|[\s:(,])(?:\d*\.)?\d+(?:ms|s)\b/.test(css))
      report(file,'CSS durations belong in motion.css');
    if (legacyColor.test(css)) report(file,'use a v7 colour role');
    continue;
  }
  const ast=tree(file);
  function inspect(node) {
    if (directV7(file) && ts.isImportDeclaration(node) && /(?:^|\/)ui\/Sheet$/.test(node.moduleSpecifier.text))
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
    if (ts.isStringLiteralLike(node) && legacyClass.test(node.text)) report(file,'legacy colour class');
    ts.forEachChild(node,inspect);
  }
  inspect(ast);
}
const sheet=readFileSync('src/ui/v7/Sheet.tsx','utf8');
if(!sheet.includes('retainSheetExit(dialog)') || !sheet.includes('registerLayer({')) report('Sheet.tsx','conditional mounts must retain exit pixels and release their registered layer');
if (issues.length) throw new Error('Surface contract\n'+[...new Set(issues)].join('\n'));
