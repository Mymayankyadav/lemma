#!/usr/bin/env python3
"""Generate split-disjoint synthetic tutor/writer trajectories and typo cases."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/implementation/2026-11-21/writing-aid-tutor'
OUT.mkdir(parents=True, exist_ok=True)
SEED = 736021

def draw(*parts):
    digest=hashlib.sha256('/'.join(map(str,(SEED,)+parts)).encode()).digest()
    return int.from_bytes(digest[:8],'big')/2**64

# Each tuple is a separate proof family. Families and template wording do not
# cross partitions; ground truth is not given to the proposal generator.
FAMILIES = {
 'train': [
  ('multiple-four','divisibility','n is a multiple of four','n is even','n is odd'),
  ('even-square','multiplication','n is even','its square is even','its square is odd'),
  ('open-union','topology','U and V are open sets','their union is open','their union is closed'),
  ('disjoint-events','probability','events A and B are disjoint','their intersection is empty','their intersection is nonempty'),
  ('equal-rows','determinant','a square matrix has equal rows','its determinant is zero','its determinant is positive'),
  ('finite-card','cardinality','S has five elements','S is finite','S is infinite'),
  ('empty-subset','inclusion','E is the empty set','E is a subset of S','E contains every element of S'),
  ('identity-map','mapping','f is the identity map','f is injective','f is not injective'),
 ],
 'calibration': [
  ('zero-product','factorization','real numbers a and b multiply to zero','a or b is zero','both a and b are nonzero'),
  ('triangle-sum','geometry','T is a triangle','its angles sum to 180 degrees','its angles sum to 90 degrees'),
  ('constant-sequence','sequence','each term of a sequence is 3','the sequence converges to 3','the sequence converges to 0'),
  ('radius','diameter','a circle has radius 2','its diameter is 4','its diameter is 2'),
  ('equal-sets','equality','A and B have the same elements','A equals B','A is disjoint from B'),
  ('odd-function','symmetry','f is an odd function','f of negative x equals negative f of x','f of negative x equals f of x'),
  ('even-sum','addition','a and b are even integers','their sum is even','their sum is odd'),
  ('singleton','membership','S contains only x','x belongs to S','x does not belong to S'),
 ],
 'validation': [
  ('positive-derivative','derivative','f has positive derivative on an interval','f is increasing there','f is decreasing there'),
  ('positive-events','event','two events have positive probability','they need not intersect','they must intersect'),
  ('open-intersection','intersection','an infinite family of sets is open','its intersection need not be open','its intersection must be open'),
  ('singular-matrix','invertibility','a square matrix has determinant zero','the matrix is not invertible','the matrix is invertible'),
  ('empty-graph','graph','a graph has vertices and no edges','the graph can have no edges','the graph must have an edge'),
  ('alternating-limit','convergence','a sequence alternates between minus one and one','the sequence does not converge','the sequence converges to zero'),
  ('inverse-map','composition','f has a two-sided inverse','f is bijective','f is not injective'),
  ('geometric-series','series','a geometric series has ratio one half','the series converges','the series diverges'),
 ],
 'test': [
  ('negative-one','positivity','x is minus one','x is negative','x is positive'),
  ('constant-map','injectivity','f sends every integer to zero','f is not injective','f is injective'),
  ('absolute-value','continuity','f is the absolute value on the reals','f is continuous','f is discontinuous'),
  ('group-identity','identity','e is the identity of a group','e times x equals x','e times x equals zero'),
  ('quadratic-roots','polynomial','a real quadratic has a negative discriminant','it has no real roots','it has two real roots'),
  ('finite-union','finiteness','A and B are finite sets','their union is finite','their union is infinite'),
  ('even-prime','primality','p is the integer two','p is prime','p is composite'),
  ('real-square','nonnegativity','x is a real number','x squared is nonnegative','x squared is negative'),
 ],
}

WRITING = {
 'train': ['Please explain the {term} in this example.', 'Could you compare the {term} with my notes?',
           'I want to review the {term} before continuing.', 'Please restate the {term} in simpler words.'],
 'calibration': ['Would you describe the {term} for me?', 'My notes mention the {term} here.',
                 'I need an explanation of the {term}.', 'Can we revisit the {term} together?'],
 'validation': ['The {term} appears in the question.', 'I am checking the {term} in my draft.',
                'Could you clarify the {term} once more?', 'My question concerns the {term} today.'],
 'test': ['I would like a description of the {term}.', 'Let me read the {term} again.',
          'Can you explain the {term} in this case?', 'I am comparing the {term} with the diagram.'],
}
PROOF_PREFIX = {'train': 'I think ', 'calibration': 'My conclusion is that ',
                'validation': 'It seems that ', 'test': 'I believe '}
SPLIT_TIME = {'train': 0, 'calibration': 10, 'validation': 20, 'test': 30}


def context(case_id, family, variant):
    _, term, given, true, false = family
    # Untrusted source roles are data, not safety certificates.
    signals = [
      {'id': case_id+'-p', 'sourceId': case_id+'-reply', 'role': 'prompt',
       'text': f'Consider {given}. Discuss the {term}.', 'variables': ['x','X','Y'], 'symbols': ['ε','≤']},
      {'id': case_id+'-g', 'sourceId': case_id+'-reply', 'role': 'given',
       'text': f'Given that {given}. The term is {term}.', 'variables': ['X','Y'], 'symbols': ['ε']},
      {'id': case_id+'-w', 'sourceId': case_id+'-reply', 'role': 'suggested-wording',
       'text': f'Could you explain the {term} in the question?', 'variables': [], 'symbols': []},
      {'id': case_id+'-h', 'sourceId': case_id+'-reply', 'role': 'hint',
       'text': f'Consider the {term} carefully before writing.', 'variables': [], 'symbols': []},
      {'id': case_id+'-s', 'sourceId': case_id+'-reply', 'role': 'solution',
       'text': f'First use the given information. Therefore {true}. This completes the proof.',
       'variables': ['X','Y','Z'], 'symbols': ['⇒']},
    ]
    if variant == 'no-context': signals = []
    if variant == 'untrusted-only': signals = signals[3:]
    if variant == 'missing-inventory':
        signals = [{**s, 'variables': [], 'symbols': []} for s in signals]
    if variant == 'mislabelled-solution':
        signals[-1] = {**signals[-1], 'role': 'given'}
    if variant == 'wrong-inventory':
        signals[1] = {**signals[1], 'variables': ['Z', 'Q'], 'symbols': ['∃','⇒']}
    if variant == 'malformed':
        signals = signals[:2] + [{'id': case_id+'-bad', 'sourceId': case_id+'-reply', 'role': 'given',
                                 'text': 'x' * 300, 'variables': ['Z'] * 20, 'symbols': ['⇒'] * 20}]
    if variant == 'wrong-wording':
        signals[2] = {**signals[2], 'text': f'Therefore {false}. This completes the proof.'}
    return {'version': 1, 'revision': case_id+'-rev', 'signals': signals}


def make_cases():
    out=[]
    variants=['all','no-context','untrusted-only','missing-inventory','mislabelled-solution',
              'wrong-inventory','malformed','wrong-wording']
    for split, families in FAMILIES.items():
      for user in range(12):
       for step in range(12):
        family=families[(user+step)%len(families)]
        fid,term,given,true,false=family
        kind=('writing','proof-false','proof-true','choice','literal','notation')[step%6]
        if kind=='writing' and user%2==1: kind='ghost'
        if kind=='literal' and user%2==0: kind='spelling'
        if kind=='writing': text=WRITING[split][(user+step)%4].format(term=term)
        elif kind=='ghost': text={'train':'Could you explain the question in words?',
          'calibration':'Would you restate the question more clearly?',
          'validation':'Could you repeat the wording more slowly?',
          'test':'Please could you restate the question in words?'}[split]
        elif kind=='proof-false': text=PROOF_PREFIX[split]+false+'.'
        elif kind=='proof-true': text=PROOF_PREFIX[split]+true+'.'
        elif kind=='choice': text={'train':'I listed X and Y. I choose X.', 'calibration':'My choices are X and Y. I choose Y.',
                                  'validation':'I named X and Y. I choose X.', 'test':'My labels are X and Y. I choose Y.'}[split]
        elif kind=='literal': text={'train':'I wrote the word teh on purpose.', 'calibration':'The label teh is literal.',
                                   'validation':'My literal token is teh.', 'test':'I named the token teh.'}[split]
        elif kind=='spelling': text={'train':'I checked teh answer.', 'calibration':'I reviewed teh diagram.',
                                    'validation':'I read teh question.', 'test':'I inspected teh wording.'}[split]
        else: text={'train':'Let eps denote the tolerance.', 'calibration':'Let eps mark the tolerance.',
                    'validation':'Let eps stand for the tolerance.', 'test':'Let eps represent the tolerance.'}[split]
        notation_goal=kind=='notation' and user%2==0
        intent=text.replace('eps','ε',1) if notation_goal else text.replace('teh','the',1) if kind=='spelling' else text
        repair={'source':'eps','target':'ε'} if notation_goal else {'source':'teh','target':'the'} if kind=='spelling' else None
        case_id=f'{split}-u{user:02d}-t{step:02d}'
        variant=variants[(user*3+step)%len(variants)]
        tutor=context(case_id,family,variant)
        if kind=='ghost' and variant!='wrong-wording':
            tutor['signals']=[{**signal,'text':text} if signal['role']=='suggested-wording' else signal for signal in tutor['signals']]
        out.append({'id':case_id,'split':split,'family':fid,'template':f'{split}-{kind}-{(user+step)%4}',
          'user':f'{split}-user-{user:02d}','time':SPLIT_TIME[split]+step,'step':step,
          'regime':'early' if step<6 else 'shifted','kind':kind,'truth': False if kind=='proof-false' else True if kind=='proof-true' else None,
          'initial':'','manualText':text,'intent':intent,'notationGoal':notation_goal,'repair':repair,'given':given,'falseClaim':false,'trueClaim':true,
          'term':term,'contextVariant':variant,'tutorContext':tutor})
    return out


def typo_cases():
    pairs=[('teh','the'),('recieve','receive'),('recieved','received'),('seperate','separate')]
    topics=['garden','letter','meeting','picture','journey','collection','journal','painting','story','music',
      'archive','library','market','festival','kitchen','village','calendar','message','parcel','museum',
      'exhibition','bookcase','window','project','lesson','notebook','photograph','chapter','envelope','garden']
    stems={
      'train':['Before the {topic} I wrote ', 'After the {topic} we saw ', 'During the {topic} I read ',
        'In my {topic} we noticed ', 'From the {topic} I copied ', 'At the {topic} we noted ',
        'Near the {topic} I found ', 'About the {topic} I typed ', 'For the {topic} I wrote ', 'In a {topic} I saw '],
      'calibration':['In my notes on the {topic} I saw ', 'When the {topic} ended I wrote ',
        'While the {topic} continued we noticed ', 'I looked at the {topic} and read ',
        'The {topic} reminded me to write ', 'I opened the {topic} and typed ',
        'We discussed the {topic} and saw ', 'I remembered the {topic} and wrote ',
        'We inspected the {topic} and read ', 'I closed the {topic} after typing '],
      'validation':['Beside the {topic} I noticed ', 'We visited the {topic} and wrote ',
        'Looking through the {topic} I typed ', 'Upon seeing the {topic} we wrote ',
        'Following the {topic} I read ', 'The old {topic} contained ',
        'A note about the {topic} mentioned ', 'Around the {topic} we read ',
        'I found the {topic} and saw ', 'We returned to the {topic} and typed '],
      'test':['While reading the {topic} I saw ', 'Our account of the {topic} included ',
        'Someone described the {topic} and wrote ', 'I revisited the {topic} and found ',
        'The record of the {topic} showed ', 'I set aside the {topic} and typed ',
        'With the {topic} nearby we noticed ', 'We considered the {topic} and read ',
        'I reviewed the {topic} before writing ', 'The description of the {topic} included '],
    }
    out=[]
    for split in ('train','calibration','validation','test'):
      for typo, correction in pairs:
       for i in range(300 if split in ('calibration','test') else 80):
        # 12% deliberate names/quotations, and same visible token can be
        # intentional. Context is provided as ordinary untrusted metadata.
        deliberate=i%25 in (0,1,2)
        shifted=i%97 == 27
        literal=i%50 in (0,1)
        math=i%30 in (4,5)
        before=stems[split][i//30 % len(stems[split])].format(topic=topics[i%30])
        if literal: before=f'The literal named token in the {topics[i%30]} is '
        if math: before='For x = 2, '+before
        text=before+typo
        # A simulated history reflects the user's *previous* preference, with
        # noisy manual accepts/undo; a small deterministic cohort has shifted.
        prior_wanted=(not deliberate) != shifted
        history=[]
        for attempt in range(6):
            accepts=draw(split,typo,i,attempt,'accept') < (.94 if prior_wanted else .12)
            undo=accepts and draw(split,typo,i,attempt,'undo') < (.01 if prior_wanted else .65)
            history.append({'at':SPLIT_TIME[split]-6+attempt,'pair':typo+'->'+correction,
                            'action':'manual-accept' if accepts else 'dismiss', 'undo':undo,'partialEdit':False})
        out.append({'id':f'{split}-{typo}-{i:03d}','split':split,'class':typo+'->'+correction,
          'user':f'{split}-{typo}-user-{i:03d}','family':f'{split}-{typo}-family-{i%20:02d}',
          'draft':text,'typo':typo,'candidate':correction,
          'shouldChange':not deliberate,'intent':before+(typo if deliberate else correction),
          'intentional':deliberate,'literal':literal,'math':math,'preferenceShift':shifted,'history':history,'truth':None})
    return out


def adversarial_cases():
    examples={
      'validation':[
        ('triangle-inequality','We can apply','We can apply triangle inequality to conclude the proof.'),
        ('pigeonhole-principle','We can apply','We can apply pigeonhole principle to find a collision.'),
        ('counting-argument','The next step','The next step uses a counting argument to prove the claim.'),
        ('induction-method','We should use','We should use induction to prove the statement.'),
        ('specific-witness','We can choose','We can choose the witness X to finish the argument.'),
      ],
      'test':[
        ('cauchy-schwarz','We can apply','We can apply Cauchy Schwarz inequality to finish.'),
        ('contrapositive','We can apply','We can apply the contrapositive to prove it.'),
        ('invariant-method','The next step','The next step uses an invariant to conclude the proof.'),
        ('descent-method','We can apply','We can apply infinite descent to prove the claim.'),
        ('diagram-chase','We should use','We should use a diagram chase to establish the result.'),
        ('specific-operand','We can choose','We can choose the operand Y to finish the argument.'),
      ],
    }
    result=[]
    for split, families in examples.items():
      for family,prefix,source in families:
       for role in ('prompt','given','suggested-wording'):
        cid=f'{split}-adversarial-{family}-{role}'
        result.append({'id':cid,'split':split,'family':f'{split}-adv-{family}',
          'template':f'{split}-adv-{prefix}','user':f'{split}-adv-{family}-{role}',
          'learnerDraft':prefix,'untrustedContinuation':source[len(prefix):], 'expected':'abstain',
          'tutorContext':{'version':1,'revision':cid,'signals':[
            {'id':cid+'-signal','sourceId':cid+'-reply','role':role,'text':source,'variables':['X','Y'],'symbols':[]} ]}})
    for split,prefix,source in [
      ('validation','Could you explain','Could you explain the question in words.'),
      ('test','Would you restate','Would you restate the wording more clearly.'),
    ]:
      cid=f'{split}-adversarial-neutral-control'
      result.append({'id':cid,'split':split,'family':cid,'template':cid,'user':cid,
        'learnerDraft':prefix,'untrustedContinuation':source[len(prefix):], 'expected':'allow-neutral',
        'tutorContext':{'version':1,'revision':cid,'signals':[
          {'id':cid+'-signal','sourceId':cid+'-reply','role':'suggested-wording','text':source,'variables':[],'symbols':[]} ]}})
    return result


cases=make_cases(); typos=typo_cases(); adversarial=adversarial_cases()
for field in ('family','template','user'):
    sets=[{row[field] for row in cases if row['split']==split} for split in FAMILIES]
    assert all(not sets[i]&sets[j] for i in range(4) for j in range(i))
fixture={'version':1,'seed':SEED,'provenance':'Programmatically authored synthetic cases; no real user data.',
         'splitPolicy':'Disjoint proof families, template strings, users, and calendar ranges; score test once after validation selection.',
         'cases':cases,'typoCases':typos,'adversarialCases':adversarial}
(OUT/'dataset.json').write_text(json.dumps(fixture,indent=2)+'\n')
print(json.dumps({'cases':len(cases),'bySplit':{x:sum(r['split']==x for r in cases) for x in FAMILIES},
                  'typoCases':len(typos),'adversarialCases':len(adversarial),
                  'sha256':hashlib.sha256((OUT/'dataset.json').read_bytes()).hexdigest()}))
