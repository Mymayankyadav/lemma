// Extract route declarations and mode values from the application. Keep optional route arms separate.
import ts from 'typescript';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {matchPath} from 'react-router';
import {scenes} from './catalog.mjs';

const parse=file=>ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function walk(node,visit){visit(node);ts.forEachChild(node,child=>walk(child,visit));}
function files(dir){
  return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
}
const patterns=new Set(),missing=[];
for(const file of files('src/app').filter(f=>/\.tsx?$/.test(f))){
  walk(parse(file),node=>{
    if(ts.isPropertyAssignment(node)&&node.name.getText()==='path'&&ts.isStringLiteral(node.initializer)&&node.parent.properties.some(p=>['element','children','Component','lazy'].includes(p.name?.getText())))patterns.add(node.initializer.text);
    if(!ts.isCallExpression(node)||!['lazyRoute','eagerRoute'].includes(node.expression.getText()))return;
    const path=node.arguments[0];
    if(ts.isStringLiteralLike(path)){patterns.add(path.text);return;}
    let parent=node.parent;
    while(parent&&!ts.isSourceFile(parent)){
      if(ts.isCallExpression(parent)&&ts.isPropertyAccessExpression(parent.expression)&&parent.expression.name.text==='map'){
        const list=parent.expression.expression;
        if(ts.isArrayLiteralExpression(list)&&list.elements.every(ts.isStringLiteralLike)){
          for(const literal of list.elements)patterns.add(literal.text);
          return;
        }
      }
      parent=parent.parent;
    }
    missing.push('Unresolved route '+file+' '+path.getText());
  });
}
const urls=scenes.filter(s=>!s.loading&&!s.chunkError&&!/(?:^|-)not-found$|missing-checkpoint$/.test(s.id))
  .map(s=>new URL(s.hash,'https://demo.invalid'));
function hasPath(pattern){return urls.some(url=>matchPath({path:pattern,end:true},url.pathname));}
for(const pattern of patterns){
  if(pattern==='*'){
    const fallback=scenes.find(s=>s.id==='not-found');
    if(!fallback||[...patterns].some(p=>p!=='*'&&matchPath(p,fallback.hash)))missing.push('unmatched route');
  } else if(pattern.endsWith('?')){
    for(const arm of [pattern.replace(/\/:[^/]+\?$/,''),pattern.slice(0,-1)])if(!hasPath(arm))missing.push('route '+arm);
  } else if(!hasPath(pattern))missing.push('route '+pattern);
}
function values(file,name){
  const result=[];
  walk(parse(file),node=>{
    if(!((ts.isTypeAliasDeclaration(node)||ts.isVariableDeclaration(node))&&node.name.getText()===name))return;
    walk(node.type&&ts.isTypeAliasDeclaration(node)?node.type:node.initializer,n=>{if(ts.isStringLiteral(n))result.push(n.text);});
  });
  if(!result.length)throw new Error('Could not read '+name+' in '+file);
  return result;
}
function checkMode(file,name,path,key,defaultValue){
  for(const value of values(file,name).map(v=>v.toLowerCase())){
    if(!urls.some(url=>matchPath(path,url.pathname)&&(url.searchParams.get(key)??defaultValue)===value))
      missing.push(path+' '+key+'='+value);
  }
}
checkMode('src/features/settings/v7/SettingsV7.tsx','Section','/settings','section');
checkMode('src/features/calendar/v7/viewModel.ts','CalendarView','/calendar','view','day');
checkMode('src/features/insights/v7/ProgressV7.tsx','Tab','/insights','tab','overview');
checkMode('src/features/insights/v7/progressModel.ts','ProgressRange','/insights','range','30');
checkMode('src/features/project/v7/V7Path.tsx','tabs','/p/:slug','tab','plan');
const inboxTabs=new Set();
walk(parse('src/features/proposals/v7/InboxV7.tsx'),n=>{
  if(ts.isVariableDeclaration(n)&&n.name.getText()==='tab'&&n.initializer)walk(n.initializer,item=>{
    if(ts.isConditionalExpression(item))for(const arm of [item.whenTrue,item.whenFalse])if(ts.isStringLiteral(arm))inboxTabs.add(arm.text);
  });
});
if(!inboxTabs.size)missing.push('Could not read Inbox tabs');
for(const value of inboxTabs)if(!urls.some(url=>url.pathname==='/proposals'&&(url.searchParams.get('tab')??'cards')===value))missing.push('Inbox '+value);
for(const value of values('src/data/mode.ts','DemoProfile'))if(!scenes.some(s=>(s.demo??'default')===value))missing.push('demo '+value);
const ids=new Set();
for(const scene of scenes){if(ids.has(scene.id))missing.push('duplicate scene '+scene.id);ids.add(scene.id);}
if(!patterns.size)missing.push('empty route inventory');
console.log(patterns.size+' route patterns, '+scenes.length+' unique scenes');
if(missing.length){console.error(missing.join('\n'));process.exitCode=1;}
