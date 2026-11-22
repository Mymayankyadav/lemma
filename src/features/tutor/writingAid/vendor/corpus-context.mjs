/** Existing lexical context evidence; never generates or admits candidates. */
export function createCorpusContextScorer(left, ranks, config = {}) {
  const ranker = config.ranker ?? 'manual', contextWords = config.contextWords ?? 1;
  const previousWords = ranker === 'corpus' && contextWords > 0
    ? (left.toLocaleLowerCase().match(/[\p{L}\p{M}]+/gu) || []) : [];
  const lastPair = previousWords.slice(-2).join(' ');
  return (word, score) => {
    if (ranker === 'corpus' && ranks) {
      // Preserve the original coefficients and sequential floating-point additions.
      if (contextWords >= 1 && previousWords.length) score += Math.log1p(ranks.bigram?.[previousWords.at(-1) + ' ' + word] || 0) * 28;
      if (contextWords >= 2 && previousWords.length >= 2) score += Math.log1p(ranks.trigram?.[lastPair + ' ' + word] || 0) * 35;
    }
    return score;
  };
}
