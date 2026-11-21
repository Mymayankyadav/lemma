import {useEffect, useMemo, useState} from 'react';
import {
  ALL_WRITING_AID_SURFACES, NO_WRITING_AID, canSuggestWritingAid, sameWritingAidRequest,
  type WritingAidRequest, type WritingAidSuggestions,
} from './policy';

export function useWritingAid(request: WritingAidRequest): WritingAidSuggestions {
  const {cursor, anchor, target, mode, composing, readOnly} = request;
  const {scopeKey, mountId, editorRevision, selectionRevision, modeRevision} = target;
  const {words, replace, correction, ghost} = request.surfaces ?? ALL_WRITING_AID_SURFACES;
  const snapshot = useMemo<WritingAidRequest>(() => ({
    cursor, anchor, mode, composing, readOnly,
    target: {scopeKey, mountId, editorRevision, selectionRevision, modeRevision},
    surfaces: {words, replace, correction, ghost},
  }), [cursor, anchor, mode, composing, readOnly, scopeKey, mountId, editorRevision, selectionRevision, modeRevision,
    words, replace, correction, ghost]);
  const [result, setResult] = useState<{snapshot: WritingAidRequest; suggestions: WritingAidSuggestions}>();

  useEffect(() => {
    if (mode === 'off' || !words && !replace && !correction && !ghost) return;
    let cancelled = false;
    let frame: number | undefined;
    // On an enabled composer, load the packaged assets while the learner begins typing.
    // Coalesce eligible edits on the next frame and ignore a previous draft's result.
    void import('./engine').then(({predictWritingAid}) => {
      if (cancelled || !canSuggestWritingAid(snapshot)) return;
      frame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          setResult({snapshot, suggestions: predictWritingAid(snapshot)});
        } catch {
          setResult({snapshot, suggestions: NO_WRITING_AID});
        }
      });
    }).catch(() => {
      // A failed asset load leaves ordinary editing and the math keys usable.
    });
    return () => {
      cancelled = true;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [snapshot, mode, words, replace, correction, ghost]);

  return result && sameWritingAidRequest(snapshot, result.snapshot) ? result.suggestions : NO_WRITING_AID;
}
