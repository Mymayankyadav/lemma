/* ---------- Claude features (sample capability): generate cards, check answers, explain ---------- */
const AI = (() => {
  let sample = null;
  let images = false;
  let disabled = false;
  const PERMANENT = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);
  const listeners = new Set();

  async function init() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      sample = await Promise.race([window.claude.use('sample'), new Promise((r) => setTimeout(() => r(null), 11000))]);
    } catch (e) { sample = null; }
    if (sample) {
      try { const lim = await sample.limits(); images = !!(lim && lim.images); } catch (e) { images = false; }
    }
    for (const fn of listeners) fn();
  }
  const available = () => !!sample && !disabled;
  const canSendImages = () => available() && images;
  const tier = () => (['quick', 'default', 'complex'].includes(Model.settings.aiTier) ? Model.settings.aiTier : 'default');

  function isPermanent(e) { return e && PERMANENT.has(e.code); }
  function note(e) {
    if (isPermanent(e)) { disabled = true; for (const fn of listeners) fn(); }
  }
  function errorMessage(e) {
    const code = e && e.code;
    note(e);
    switch (code) {
      case 'not_granted': return 'Claude isn’t allowed for this page, so its features are hidden for now. You can allow it from the page’s permissions next time.';
      case 'sampling_disabled': return 'Claude isn’t available for this account.';
      case 'rate_limited': return 'Claude is busy or you’ve reached a usage limit. Try again in a little while.';
      case 'session_expired': return 'Sign in to Claude again, then retry.';
      case 'prompt_too_large': return 'That’s too much text at once. Try a shorter excerpt.';
      case 'image_rejected': return 'That image couldn’t be used. Try a smaller PNG or JPEG.';
      case 'images_unavailable': images = false; return 'Images can’t be sent from this view. Type your answer instead.';
      case 'refused': return 'Claude declined this request. Rephrase the material and try again.';
      case 'invalid_json': return 'Claude’s reply couldn’t be read. Try again.';
      case 'empty_completion': return 'Claude returned an empty answer. Try again with less material.';
      default: return 'Couldn’t reach Claude. Check your connection and try again.';
    }
  }

  const MACROS_NOTE = 'These macros are already defined: \\R \\N \\Z \\Q \\C \\abs{x} \\norm{x} \\inner{x}{y} \\eps \\tr \\rank \\argmax \\argmin.';
  const FORMAT_RULES = [
    'FORMAT (the app renders Markdown with KaTeX):',
    '- Inline math $...$; display math $$...$$ on its own lines. Use KaTeX-compatible LaTeX only (no \\DeclareMathOperator, \\label, \\ref, or tikz). ' + MACROS_NOTE,
    '- Theorem-style blocks: a line ":::theorem[Name]", the body, then a line ":::". Kinds: theorem, lemma, proposition, corollary, definition, example, remark, proof.',
    '- A proof the student reveals step by step: ":::proof*" containing a numbered list, one step per item.',
    '- Hints shown on demand (put them on the front): ":::hint" … ":::".',
    '- Cloze deletions: {{c1::hidden text::optional hint}}. They may sit inside math, e.g. $$\\int_a^b f\'(x)\\,dx = {{c1::f(b)-f(a)}}$$. Use c1, c2, … for separate cards made from one note.',
    '- Link to another card by its title with [[Title]].',
  ].join('\n');
  const STYLES = {
    balanced: 'Mix precise definitions, theorem statements with every hypothesis, and the key idea behind important proofs.',
    statements: 'Focus on precise definitions and theorem statements, including every hypothesis.',
    proofs: 'Focus on proofs: the key idea of each proof and stepwise proofs (:::proof*) of the main results.',
    cloze: 'Prefer cloze deletions for formulas, identities and short statements.',
  };

  async function generate({ material, count = 8, style = 'balanced', image, signal, onText }) {
    const prompt = [
      'You write spaced-repetition flashcards for a mathematics student using the Lemma app.',
      `Turn the MATERIAL into about ${count} excellent flashcards. ${STYLES[style] || STYLES.balanced}`,
      image ? 'The attached image is part of the material (for example a photo of lecture notes or a textbook page). Read the mathematics in it carefully.' : '',
      '',
      FORMAT_RULES,
      '- Card types: "basic" (front asks, back answers); "reverse" (also quizzes back→front, only when both directions make sense, e.g. a theorem’s name ↔ its statement); "cloze" (front holds the text with clozes, back is optional extra context).',
      '',
      'QUALITY:',
      '- One idea per card. Keep fronts short and specific ("State…", "Define…", "Why does … need …?", "What is the key step in the proof of …?").',
      '- Give named results and definitions a short "title" (e.g. "Mean Value Theorem"); otherwise "".',
      '- "requires": titles of other cards in YOUR list that should be learned first.',
      '- Be mathematically correct; if the material contains an error, write the correct version.',
      '',
      'Reply with ONLY a JSON array, no other text, like:',
      '[{"type":"basic","title":"…","front":"…","back":"…","tags":["…"],"requires":["…"]}]',
      '',
      'MATERIAL:',
      '<<<',
      String(material || '').slice(0, 60000) || '(see the attached image)',
      '>>>',
    ].filter((l) => l !== null).join('\n');
    const opts = { modelTier: tier(), signal, cache: false };
    if (onText) opts.onText = onText;
    if (image) opts.images = [image];
    const data = await sample.json(prompt, opts);
    const arr = Array.isArray(data) ? data : data && Array.isArray(data.cards) ? data.cards : [];
    return arr.filter((c) => c && typeof c.front === 'string' && c.front.trim()).map((c) => ({
      type: ['basic', 'reverse', 'cloze'].includes(c.type) ? c.type : /\{\{c\d+::/.test(c.front) ? 'cloze' : 'basic',
      title: String(c.title || '').slice(0, 120),
      front: String(c.front),
      back: String(c.back || ''),
      tags: Array.isArray(c.tags) ? c.tags.map((t) => String(t).replace(/\s+/g, '-')).filter(Boolean).slice(0, 6) : [],
      requires: Array.isArray(c.requires) ? c.requires.map(String) : [],
    }));
  }

  async function check({ front, back, typed, image, signal }) {
    const prompt = [
      'You are grading a student’s attempt to recall a mathematics flashcard. Be fair but rigorous.',
      '',
      'QUESTION (Markdown with LaTeX):',
      '<<<', front, '>>>',
      'EXPECTED ANSWER:',
      '<<<', back || '(none given)', '>>>',
      'STUDENT’S ANSWER:',
      '<<<', typed || '(no typed answer; see the attached image)', '>>>',
      image ? 'The attached image is the student’s handwritten working for this question. Read the mathematical notation carefully; ignore crossed-out parts.' : '',
      '',
      'Judge whether the student recalled the essential content: the correct statement, every needed hypothesis, and the key idea. Ignore differences in notation or wording. A missing crucial hypothesis or key step is "partial" at best. Never reward an answer that is merely plausible.',
      'Grade scale: 1 = Again (wrong or blank), 2 = Hard (partly right or an important gap), 3 = Good (essentially right), 4 = Easy (complete, precise, effortless).',
      '',
      'Reply with ONLY JSON:',
      '{"verdict":"correct"|"partial"|"incorrect","grade":1|2|3|4,"feedback":"1-3 short sentences to the student, Markdown with $LaTeX$","missing":["short phrases naming what was missing or wrong"]}',
    ].join('\n');
    const opts = { modelTier: tier(), signal, cache: false };
    if (image) opts.images = [image];
    return sample.json(prompt, opts);
  }

  async function explain({ front, back, type, signal, onText }) {
    const prompt = [
      'A student just reviewed this mathematics flashcard and wants to understand it more deeply.',
      type === 'cloze' ? 'It is a cloze card: {{cN::text}} marks the hidden parts.' : '',
      'CARD FRONT:', '<<<', front, '>>>',
      'CARD BACK:', '<<<', back || '(empty)', '>>>',
      '',
      'Explain in at most 180 words: the intuition behind it, why each hypothesis matters (give a quick counterexample when one fails), and one way to remember it.',
      'Use Markdown with $...$ for inline math and $$...$$ for display math (KaTeX). ' + MACROS_NOTE + ' Do not restate the card verbatim. No preamble.',
    ].join('\n');
    const res = await sample(prompt, { modelTier: tier(), signal, onText, cache: { gcTime: 600000 } });
    return res.text;
  }

  return { init, available, canSendImages, generate, check, explain, errorMessage, isPermanent, onChange: (fn) => listeners.add(fn) };
})();
