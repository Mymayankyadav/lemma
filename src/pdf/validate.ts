/** Lightweight file-picker validation shared by the cold New project route and
 * the PDF/text ingestion pipeline. Keep pdfjs-dist out of this module. */
export type TextKind = 'tex' | 'md';

/** Browser document providers sometimes label real PDFs as generic binary files. */
export function isPdfFile(file:Pick<File,'name'|'type'>):boolean{
 const mime=file.type.toLowerCase();
 return mime==='application/pdf'||mime==='application/x-pdf'||
  ((mime===''||mime==='application/octet-stream'||mime==='binary/octet-stream')&&/\.pdf$/i.test(file.name));
}

export function textKind(file:Pick<File,'name'|'type'>):TextKind|null{
 const name=file.name.toLowerCase(),mime=file.type.toLowerCase();
 if(/\.(tex|latex|ltx)$/.test(name)||mime==='application/x-tex'||mime==='text/x-tex')return 'tex';
 if(/\.(md|markdown)$/.test(name)||mime==='text/markdown')return 'md';
 return null;
}

export function isSourceFile(file:Pick<File,'name'|'type'>):boolean{
 return isPdfFile(file)||textKind(file)!==null;
}
