"""Strict extraction of the first answer from a known public Q&A wrapper."""
import re
from corpus import STACK_QUESTION, STACK_REPLY, tutor_pair

TITLE = re.compile(r'^TITLE:[^\n]*\n', re.M)
SOURCE = 'hoskinson-center/proof-pile'


def first_reply(document, cleaned_text):
    """Return (text, matched), without ever including the question in a match.

    Only the known source with a title/question/reply wrapper is eligible. A
    missing, empty or ambiguous wrapper returns the untouched cleaned text.
    """
    if document.get('source') != SOURCE or document.get('question'):
        return cleaned_text, False
    if not TITLE.match(cleaned_text):
        return cleaned_text, False
    questions = list(STACK_QUESTION.finditer(cleaned_text))
    replies = list(STACK_REPLY.finditer(cleaned_text))
    if len(questions) != 1 or not replies or questions[0].start() <= 0 or replies[0].start() <= questions[0].end():
        return cleaned_text, False
    question, reply = tutor_pair({'source':SOURCE, 'text':cleaned_text, 'question':''})
    if not question.strip() or not reply.strip():
        return cleaned_text, False
    return reply, True
