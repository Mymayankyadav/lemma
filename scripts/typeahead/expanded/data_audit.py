"""Bounded, training-only corpus audit utilities for matched data experiments.

The sealed index is a hashed matching aid, not encryption or proof of no leakage.
Run a custodian-owned index separately; do not publish it or reserved text.
"""
import hashlib
import html
import json
import re
import unicodedata
from collections import defaultdict
from html.parser import HTMLParser

TOKEN = re.compile(r"[^\W_]+(?:['’][^\W_]+)?", re.UNICODE)
FORMULA = re.compile(
    r'\$\$.*?\$\$|(?<!\\)\$[^$\n]+(?<!\\)\$|\\\(.*?\\\)|\\\[.*?\\\]|'
    r'\\begin\{(?P<env>align\*?|equation\*?|gather\*?|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|'
    r'smallmatrix|array|cases|aligned|alignedat|gathered|split)\}.*?\\end\{(?P=env)\}', re.S)
ENTITY = re.compile(r'&(?:#[xX][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]+);')


def digest(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def normalized(text):
    return ' '.join(TOKEN.findall(unicodedata.normalize('NFKC', text).casefold()))


def shingles(text, size):
    words = normalized(text).split()
    return {digest(' '.join(words[i:i + size])) for i in range(len(words) - size + 1)}


class Extractor(HTMLParser):
    """Extract conservative HTML text and associate every output codepoint to source spans."""
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0]
        for match in re.finditer('\n', source):
            self.lines.append(match.end())
        self.out, self.map = [], []
        self.suppressed = []
        self.math_depth = 0
        self.error = None

    def source_offset(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def add(self, value, start, end):
        self.out.append(value)
        self.map.extend([[start, end]] * len(value))

    def add_decoded(self, value, start):
        i = 0
        while i < len(value):
            match = re.match(r'&(?:#[xX][0-9A-Fa-f]+;?|#\d+;?|[A-Za-z][A-Za-z0-9]*;?)', value[i:])
            raw = match.group() if match else value[i]
            self.add(html.unescape(raw), start + i, start + i + len(raw))
            i += len(raw)

    def handle_starttag(self, tag, attrs):
        start = self.source_offset()
        # HTMLParser sees a same-length formula mask. Read attribute bytes
        # from the original source, never from get_starttag_text().
        raw = self.source[start:start + len(self.get_starttag_text())]
        if self.suppressed:
            if tag == self.suppressed[-1]:
                self.suppressed.append(tag)
            return
        if tag in ('script', 'style', 'nav'):
            self.suppressed.append(tag)
            return
        if self.math_depth:
            self.math_depth += 1
            return
        if tag == 'math':
            # alttext is recoverable TeX; rendered MathML without it is rejected.
            match = re.search(r'\balttext\s*=\s*(["\'])(.*?)\1', raw, re.I | re.S)
            if not match:
                self.error = 'mathml_without_alttext'
            else:
                value = html.unescape(match.group(2))
                delimited = bool(FORMULA.fullmatch(value))
                if not delimited:
                    self.add('$', start, start + len(raw))
                self.add_decoded(match.group(2), start + match.start(2))
                if not delimited:
                    self.add('$', start, start + len(raw))
            self.math_depth = 1
            return
        if tag == 'img':
            match = re.search(r'\balt\s*=\s*(["\'])(.*?)\1', raw, re.I | re.S)
            if match:
                self.add_decoded(match.group(2), start + match.start(2))
            return
        if tag in ('p', 'div', 'br', 'li', 'tr', 'h1', 'h2', 'h3'):
            self.add('\n', start, start + len(raw))

    def handle_startendtag(self, tag, attrs):
        suppressed_before, math_before = len(self.suppressed), self.math_depth
        self.handle_starttag(tag, attrs)
        if len(self.suppressed) > suppressed_before:
            self.suppressed.pop()
        if self.math_depth > math_before:
            self.math_depth = math_before

    def handle_endtag(self, tag):
        if self.suppressed:
            if tag == self.suppressed[-1]:
                self.suppressed.pop()
            return
        if self.math_depth:
            self.math_depth -= 1

    def handle_data(self, data):
        if not self.suppressed and not self.math_depth:
            start = self.source_offset()
            self.out.append(self.source[start:start + len(data)])
            self.map.extend([[start + i, start + i + 1] for i in range(len(data))])

    def entity(self, raw):
        if not self.suppressed and not self.math_depth:
            start = self.source_offset()
            self.add(html.unescape(raw), start, start + len(raw))

    def source_entity(self, raw):
        start = self.source_offset()
        if self.source[start + len(raw):start + len(raw) + 1] == ';':
            raw += ';'
        self.entity(raw)

    def handle_entityref(self, name):
        self.source_entity('&' + name)

    def handle_charref(self, name):
        self.source_entity('&#' + name)


def clean(text):
    if '\ufffd' in text or '\x00' in text:
        return None, None, 'corrupt_character'
    # Plain text (including TeX) remains byte-for-byte intact.
    if not re.search(r'</?(?:html|body|div|p|span|math|img|nav|script|style|br)\b', text, re.I):
        return text, [[i, i + 1] for i in range(len(text))], None
    parser = Extractor(text)
    # Mask formula characters while parsing so <, > and & inside TeX remain literal.
    masked = list(text)
    for match in FORMULA.finditer(text):
        for i in range(match.start(), match.end()):
            if masked[i] != '\n':
                masked[i] = 'x'
    parser.feed(''.join(masked))
    parser.close()
    if parser.error or parser.math_depth or parser.suppressed:
        return None, None, parser.error or 'unclosed_markup'
    result = ''.join(parser.out)
    if not result.strip():
        return None, None, 'empty_after_cleaning'
    return result, parser.map, None


def utf16_spans(source, spans):
    """Convert source codepoint span endpoints to browser UTF-16 offsets."""
    offsets = [0]
    for char in source:
        offsets.append(offsets[-1] + (2 if ord(char) > 0xffff else 1))
    return [[offsets[start], offsets[end]] for start, end in spans]


def build_index(texts):
    """Construct a document-level hash index; do not release the index to a builder."""
    return [{'exact': digest(text), 'short': sorted(shingles(text, 12)),
             'near': sorted(shingles(text, 5))} for text in texts]


def match_index(text, index):
    """Count candidate documents matching exactly, by 12-token containment or >=.8 Jaccard."""
    exact, short, near = digest(text), shingles(text, 12), shingles(text, 5)
    counts = {'exact': 0, 'containment': 0, 'near': 0}
    for other in index:
        oshort, onear = set(other['short']), set(other['near'])
        counts['exact'] += exact == other['exact']
        counts['containment'] += bool(short and oshort and short & oshort)
        counts['near'] += bool(len(near) >= 8 and len(onear) >= 8 and
                               len(near & onear) / len(near | onear) >= .8)
    return counts


def surface(text):
    return ' '.join(unicodedata.normalize('NFC', text).split())


def meaning_markers(text):
    # Conservative safety guards: differing mathematical notation or polarity
    # blocks an approximate merge, even if the prose is otherwise similar.
    return (tuple(sorted(re.findall(r'\b(?:not|no|never|without|neither|nor)\b', text, re.I))),
            tuple(sorted(re.findall(r'\\[A-Za-z]+|(?<![A-Za-z])[A-Za-z](?![A-Za-z])|[=<>≤≥∈∉≠+*/^_]', text))))


def connected_groups(documents):
    """Link source groups, exact copies, short containment and high-overlap revisions.

    Intended for bounded audits. Unusual shared 12-word standard definitions may
    over-merge, so retain linked pairs for review rather than claiming ground truth.
    """
    parent = list(range(len(documents)))
    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    def union(i, j):
        a, b = root(i), root(j)
        if a != b:
            parent[max(a, b)] = min(a, b)
    bygroup, byexact, byshort, bynear = {}, {}, defaultdict(set), defaultdict(set)
    pairs = []
    nearsets = []
    for i, doc in enumerate(documents):
        text = doc['text']
        norm = normalized(text)
        exact = digest(text)
        short, near = shingles(text, 12), shingles(text, 5)
        candidates = set()
        for s in short:
            candidates.update(byshort[s])
        # Bounded bottom-four candidate lookup; verification remains exact.
        # It may miss near duplicates and must never be called exhaustive.
        for s in sorted(near)[:4]:
            candidates.update(bynear[s])
        if doc['group'] in bygroup:
            union(i, bygroup[doc['group']])
        if exact in byexact:
            union(i, byexact[exact])
            pairs.append([byexact[exact], i, 'exact'])
        this_surface, this_markers = surface(text), meaning_markers(text)
        for j in sorted(candidates):
            other_short, other_near, other_surface, other_markers = nearsets[j]
            # A complete short passage must occur in the other text; common
            # 12-word openings alone cannot merge different definitions.
            shorter, longer = sorted((this_surface, other_surface), key=len)
            if short & other_short and len(shorter) >= 48 and shorter in longer:
                reason = 'containment'
            elif (this_markers == other_markers and len(near) >= 8 and len(other_near) >= 8
                  and len(near & other_near) / len(near | other_near) >= .8):
                reason = 'near'
            else:
                continue
            union(i, j)
            pairs.append([j, i, reason])
        bygroup.setdefault(doc['group'], i)
        byexact.setdefault(exact, i)
        for s in short:
            byshort[s].add(i)
        for s in sorted(near)[:4]:
            bynear[s].add(i)
        nearsets.append((short, near, this_surface, this_markers))
    return [root(i) for i in range(len(documents))], pairs
