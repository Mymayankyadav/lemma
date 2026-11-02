/** Shared conservative title-syntax guard for cold Cards chips and canonical SSR titles. */
export function needsRichTitle(title:string):boolean{
 // Marked/GFM also linkifies bare domains and email addresses, while HTML
 // entities and cloze markup must be parsed rather than escaped twice.
 // Keep ordinary stress titles (including a standalone &) on the fast path.
 return /[\\$*_`\[\]<>~#!\r\n{}|]/.test(title)
  || /https?:\/\/|www\.|(?:^|[\s(])[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?=$|[\s),.!?;:])|[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(title)
  || /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(title);
}

