import {aidEntryKey, effectiveAidLevel} from '../../../../supabase/functions/_shared/tutor-answer-aids';
import {aidScopeSpecificity, type AidRankingContext} from './answerAids';
import type {WritingAidProposal} from './policy';

type Offer = Pick<WritingAidProposal, 'label' | 'source'>;

function identity({label, source}: Offer): string {
  const name = label.trim();
  return aidEntryKey(source === 'symbol' ? 'symbol' : /\s/u.test(name) ? 'phrase' : 'word', name);
}

/** Only link regular inflections when their base is also offered. */
function inflections(base: string): string[] {
  if (/[bcdfghjklmnpqrstvwxyz]y$/u.test(base)) {
    const stem = base.slice(0, -1);
    return [stem + 'ies', stem + 'ied', base + 'ing'];
  }
  const plural = base + (/(?:s|x|z|ch|sh)$/u.test(base) ? 'es' : 's');
  if (base.endsWith('e')) return [plural, base + 'd', (/[eo]e$/u.test(base) ? base : base.slice(0, -1)) + 'ing'];
  // Short consonant-vowel-consonant verbs have ambiguous doubling rules.
  if (base.length <= 4 && /[b-df-hj-np-tv-z][aeiou][b-df-hj-np-tv-z]$/u.test(base)) return [plural];
  return [plural, base + 'ed', base + 'ing'];
}

/** A typed family identity shared by selection and visible evaluation metadata. */
export function offerFamilies(offers: readonly WritingAidProposal[]): (offer: Offer) => string {
  const first = offers[0];
  if (!first) return identity;
  const {aid, mastery, subject, step, cursor} = first.snapshot;
  const context: AidRankingContext = {aid, mastery, subject, step, mode: 'prose',
    before: cursor.text.slice(0, first.start), prefix: cursor.text.slice(first.start, first.end)};
  const aliases = new Map<string, string>();
  const hints = aid && effectiveAidLevel(aid.level, mastery) !== 'none' ? aid.ranking?.hints : undefined;
  for (const hint of hints ?? []) {
    if (!hint.aliases?.length || aidScopeSpecificity(hint, context) === undefined) continue;
    const canonical = aidEntryKey(hint.kind, hint.entry);
    aliases.set(canonical, canonical);
    for (const alias of hint.aliases) aliases.set(aidEntryKey(hint.kind, alias), canonical);
  }
  const available = new Set(offers.map(identity));
  const regular = new Map<string, string>();
  for (const key of [...available].filter(key => /^word:[a-z]{3,}$/u.test(key)).sort((a, b) => a.length - b.length)) {
    const family = aliases.get(key) ?? regular.get(key) ?? key;
    for (const word of inflections(key.slice('word:'.length))) {
      const variant = 'word:' + word;
      if (available.has(variant) && !regular.has(variant)) regular.set(variant, family);
    }
  }
  return offer => {
    const key = identity(offer);
    return aliases.get(key) ?? regular.get(key) ?? key;
  };
}
