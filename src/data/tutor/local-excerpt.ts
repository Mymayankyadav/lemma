export const LOCAL_TUTOR_EXCERPT_LIMIT = 1200

type ExcerptPreview = Readonly<{ kind: 'preview'; text: string }>
export type LocalTutorExcerpt = Readonly<{ kind: 'local-excerpt'; text: string }>

/** The caller provides only text the learner selected, never the note or ink record. */
export function previewLocalTutorExcerpt(selectedText: string):
  ExcerptPreview | Readonly<{ kind: 'empty' | 'too-long' }> {
  if (!selectedText.trim()) return { kind: 'empty' }
  if (selectedText.length > LOCAL_TUTOR_EXCERPT_LIMIT) return { kind: 'too-long' }
  return Object.freeze({ kind: 'preview', text: selectedText })
}

/** Call only in response to the learner's explicit Add action. No storage or sending. */
export function addLocalTutorExcerpt(preview: ExcerptPreview): LocalTutorExcerpt {
  return Object.freeze({ kind: 'local-excerpt', text: preview.text })
}

export function freezeLocalTutorExcerpt(draft: LocalTutorExcerpt): LocalTutorExcerpt | undefined {
  if (draft.kind !== 'local-excerpt' || typeof draft.text !== 'string') return undefined
  const preview = previewLocalTutorExcerpt(draft.text)
  return preview.kind === 'preview' ? addLocalTutorExcerpt(preview) : undefined
}
