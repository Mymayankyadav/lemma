#!/usr/bin/env python3
"""Small isolated CPU probe of locally available GGUFs; not a main-trial ranker."""
import hashlib
import json
from pathlib import Path
import time

from llama_cpp import Llama

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/implementation/2026-11-21/writing-aid-tutor'
MODELS = [Path('/workspace/lemma-input-models/qwen2.5-0.5b-instruct-q4_k_m.gguf'),
          Path('/workspace/lemma-input-models/qwen2.5-1.5b-instruct-q4_k_m.gguf')]
CASES = [
    ('copyable_term', 'The tutor says: The commutator is written as [a,b].', 'I will check the commu', 'word'),
    ('untyped_logic', 'The tutor says: Every square matrix is invertible.', 'I think the matrix is ', 'ghost'),
    ('ambiguous_variables', 'The tutor says: Let X and Y be sets. Choose a set.', 'I choose ', 'word'),
    ('full_solution', 'The tutor says: The answer is 7. First expand the square, then divide by two.', 'My first step is ', 'ghost'),
    ('typo', 'The tutor asks the learner to explain the diagram.', 'I checked teh', 'correction'),
    ('notation', 'The tutor gives the symbol ε for epsilon.', 'Let eps', 'replace'),
]
SYSTEM = ('You are a local writing aid. Return only one short continuation, or NONE. '
          'Do not solve the problem or choose a mathematical claim, variable, sign, or proof step for the learner.')


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''): digest.update(block)
    return digest.hexdigest()


def main():
    results = []
    for path in MODELS:
        start = time.perf_counter()
        model = Llama(model_path=str(path), n_ctx=512, n_threads=4, n_batch=128, verbose=False, seed=8327)
        load = time.perf_counter() - start
        outputs = []
        for key, tutor, draft, surface in CASES:
            start = time.perf_counter()
            result = model.create_chat_completion(messages=[{'role': 'system', 'content': SYSTEM},
                {'role': 'user', 'content': f'{tutor}\nSurface: {surface}\nLearner text: {draft}'}],
                max_tokens=12, temperature=0, top_p=1, seed=8327)
            text = result['choices'][0]['message']['content']
            outputs.append({'id': key, 'surface': surface, 'rawOutput': text,
                            'seconds': time.perf_counter() - start, 'usage': result.get('usage')})
        results.append({'file': str(path), 'bytes': path.stat().st_size, 'sha256': sha(path), 'loadSeconds': load,
                        'parameters': path.name.split('-instruct')[0], 'outputs': outputs})
        del model
    result = {'scope': 'Six synthetic, non-blind prompts per local GGUF. Raw outputs; no production gating, training, or human data. Not an exhaustive accuracy or safety evaluation.',
              'seed': 8327, 'threads': 4, 'contextTokens': 512, 'maxOutputTokens': 12,
              'license': '/workspace/lemma-input-models/LICENSE-Apache-2.0.txt', 'models': results}
    (OUT / 'large-model-probe.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'models': len(results), 'casesPerModel': len(CASES),
                      'meanSeconds': {r['parameters']: sum(x['seconds'] for x in r['outputs']) / len(r['outputs']) for r in results}}))


if __name__ == '__main__': main()
