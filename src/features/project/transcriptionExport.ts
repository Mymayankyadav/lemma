import type {TranscribedSourcePage} from '../../data/types';

const ordered=(pages:readonly TranscribedSourcePage[])=>[...pages].sort((a,b)=>a.page-b.page);
/** Keep the tutor's literal Markdown and LaTeX; no synthetic content. */
export function sourceMarkdown(title:string,pages:readonly TranscribedSourcePage[]):string{
 return '# '+title+'\n\n'+ordered(pages).map(p=>'% page '+p.page+'\n\n'+p.body).join('\n\n')+'\n';
}

function texEscape(text:string):string{
 return text.replace(/([\\{}%#$&_~^])/g,ch=>({
  '\\':'\\textbackslash{}','{':'\\{','}':'\\}','%':'\\%','#':'\\#',
  '$':'\\$','&':'\\&','_':'\\_','~':'\\textasciitilde{}','^':'\\textasciicircum{}',
 } as Record<string,string>)[ch]);
}
function texPlain(text:string):string{
 return text.split(/\r?\n/).map(line=>{
  const heading=/^(#{1,3})\s+(.+)$/.exec(line);
  if(heading)return '\\'+(['section','subsection','subsubsection'][heading[1].length-1])+'*{'+texEscape(heading[2])+'}';
  const bullet=/^\s*[-*]\s+(.+)$/.exec(line);
  if(bullet)return '\\par\\textbullet\\ '+texEscape(bullet[1]);
  return line.trim()?texEscape(line):'\\par';
 }).join('\n');
}
/** Convert Markdown prose to LaTeX while leaving dollar-delimited maths intact. */
export function sourceTex(title:string,pages:readonly TranscribedSourcePage[]):string{
 const chunks=ordered(pages).map(p=>{
  const blocks=p.body.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
  return '% page '+p.page+'\n'+blocks.map((block,i)=>i%2?block:texPlain(block)).join('')+'\n';
 });
 return '\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n'+
  '\\title{'+texEscape(title)+'}\n\\begin{document}\n\\maketitle\n'+
  chunks.join('\n')+'\\end{document}\n';
}
