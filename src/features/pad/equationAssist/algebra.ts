const tokenPattern = /\\[A-Za-z]+|(?:\d+(?:\.\d+)?|\.\d+)|<=|>=|!=|[A-Za-z+±\-*/^_=<>(){}[\]]/g;
const opening: Readonly<Record<string, string>> = {'(' : ')', '{' : '}', '[' : ']'};
const rank: Readonly<Record<string, number>> = {'=':1, '<':1, '>':1, '<=':1, '>=':1, '!=':1, '+':2, '-':2, '±':2, '*':3, '/':3};
const scalar = /^(?:[A-Za-z]|\d+(?:\.\d+)?|\.\d+)$/;
type Algebra = string | [string, Algebra] | [string, Algebra, Algebra];

/**
 * Parse the typed-algebra subset of an autoeq result. The key ignores braces
 * and typography that leave the tree intact. Operators, script kind and
 * grouping that change the tree remain distinct.
 */
export function algebraReadingKey(latex: string): string | null {
  const text = latex.replace(/\\(?:left|right|big|Big|displaystyle)(?![a-z])/g, '')
    .replace(/\\(?:mathrm|mathit)\{([A-Za-z])\}/g, '$1')
    .replace(/\\(?:leq?|geq?|neq?)(?![a-z])\s*/g, command =>
      ({'\\le':'<=','\\leq':'<=','\\ge':'>=','\\geq':'>=','\\ne':'!=','\\neq':'!='})[command.trim()] ?? command)
    .replace(/\\pm(?![a-z])|\+-/g, '±')
    .replace(/\\(?:cdot|times)(?![a-z])/g, '*')
    .replace(/\\(?:dfrac|tfrac)(?![a-z])/g, '\\frac')
    .replace(/\\[,;! ]|\s+/g, '');
  const tokens = text.match(tokenPattern) ?? [];
  if (!tokens.length || tokens.join('') !== text) return null;
  let index = 0;

  function group(): Algebra {
    const close = opening[tokens[index++]];
    if (!close) throw new Error('Expected an opening delimiter');
    const value = expression(1);
    if (tokens[index++] !== close) throw new Error('Expected a closing delimiter');
    return value;
  }

  function primary(): Algebra {
    const token = tokens[index++];
    if (token === '\\frac') return ['/', group(), group()];
    if (token === '(' || token === '[' || token === '{') {
      index--;
      return group();
    }
    if (scalar.test(token ?? '')) return token;
    throw new Error('Expected an algebraic term');
  }

  function operand(): Algebra {
    const sign = tokens[index] === '+' || tokens[index] === '-' ? tokens[index++] : '';
    let value = primary();
    while (tokens[index] === '^' || tokens[index] === '_') {
      const script = tokens[index++];
      const next = tokens[index];
      // A naked TeX script takes a single token. Our number token can group
      // multiple digits, so split that case before parsing the attachment.
      if (/^\d{2,}$/.test(next ?? '')) tokens.splice(index, 1, next[0], next.slice(1));
      value = [script, value, primary()];
    }
    return sign ? ['unary' + sign, value] : value;
  }

  function expression(min: number): Algebra {
    let left = operand();
    for (;;) {
      const token = tokens[index];
      const juxtaposed = token === '\\frac' || token === '(' || token === '[' || token === '{' || scalar.test(token ?? '');
      const op = juxtaposed ? '*' : token;
      const precedence = rank[op];
      if (!precedence || precedence < min) return left;
      if (!juxtaposed) index++;
      left = [op, left, expression(precedence + 1)];
    }
  }

  function relationsAtTop(node: Algebra, mayCompare: boolean): boolean {
    if (typeof node === 'string') return true;
    const [op, ...args] = node;
    const comparison = rank[op] === 1;
    return (!comparison || mayCompare) && args.every(child => relationsAtTop(child, mayCompare && comparison));
  }

  try {
    const tree = expression(1);
    return index === tokens.length && relationsAtTop(tree, true) ? JSON.stringify(tree) : null;
  } catch {
    return null;
  }
}
