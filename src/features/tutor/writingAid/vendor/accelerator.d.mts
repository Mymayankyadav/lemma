export function isWritingWord(word: string): boolean;
export function permitAcceleratedWord(text: string, candidate: {word: string; kind?: string},
  options: {authoredText: string}, assets: {words: readonly string[]; common: readonly string[]},
  config?: {strength: 'balanced' | 'committed'}): boolean;
