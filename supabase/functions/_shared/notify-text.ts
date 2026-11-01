/** Plain notification text. The platform cannot render KaTeX. */
export function notifyText(source: string, maxLength = 140): string {
  return source.replace(/\$\$[\s\S]*?\$\$/g, '…').slice(0, maxLength)
}
