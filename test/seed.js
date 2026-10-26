// Example notes seeded into the owner's private store after publishing (marked example: true).
const base = Date.UTC(2026, 9, 23, 3, 0, 0);
const raw = [
  {
    id: 'ex-continuity', deck: 'Examples::Real Analysis', type: 'basic', title: 'Continuity', tags: ['definitions'],
    front: 'Define what it means for $f:\\R\\to\\R$ to be **continuous at** $a$.\n\n:::hint\nStart with: for every tolerance $\\eps>0$ …\n:::',
    back: ':::definition[Continuity]\n$f$ is continuous at $a$ if for every $\\eps>0$ there is a $\\delta>0$ such that\n$$\\abs{x-a}<\\delta \\implies \\abs{f(x)-f(a)}<\\eps .$$\n:::',
  },
  {
    id: 'ex-ivt', deck: 'Examples::Real Analysis', type: 'basic', title: 'Intermediate Value Theorem', tags: ['theorems'],
    front: 'State the Intermediate Value Theorem.',
    back: ':::theorem[Intermediate Value Theorem]\nIf $f$ is [[Continuity|continuous]] on $[a,b]$ and $y$ lies between $f(a)$ and $f(b)$, then $f(c)=y$ for some $c\\in[a,b]$.\n:::\n\n:::sketch\nSay $f(a)\\le y\\le f(b)$ and let $c=\\sup\\{x\\in[a,b] : f(x)\\le y\\}$. Continuity at $c$ forces both $f(c)\\le y$ and $f(c)\\ge y$.\n:::',
  },
  {
    id: 'ex-evt', deck: 'Examples::Real Analysis', type: 'basic', title: 'Extreme Value Theorem', tags: ['theorems'],
    front: 'What does the Extreme Value Theorem guarantee for $f:[a,b]\\to\\R$, and which hypotheses does it need?',
    back: ':::theorem[Extreme Value Theorem]\nIf $f$ is [[Continuity|continuous]] on the closed, bounded interval $[a,b]$, then $f$ attains a maximum and a minimum on $[a,b]$.\n:::\n\nBoth hypotheses matter: $f(x)=1/x$ is continuous on $(0,1]$ but unbounded, and $f(x)=x$ on $(0,1)$ never reaches its supremum.',
  },
  {
    id: 'ex-rolle', deck: 'Examples::Real Analysis', type: 'cloze', title: "Rolle's theorem", tags: ['theorems'],
    front: ":::theorem[Rolle]\nIf $f$ is continuous on $[a,b]$, differentiable on $(a,b)$, and {{c1::$f(a)=f(b)$::a condition on the endpoints}}, then there is $c\\in(a,b)$ with {{c2::$f'(c)=0$}}.\n:::",
    back: 'By the [[Extreme Value Theorem]], $f$ attains an extremum inside $(a,b)$ unless it is constant, and the derivative vanishes at an interior extremum.',
  },
  {
    id: 'ex-mvt', deck: 'Examples::Real Analysis', type: 'basic', title: 'Mean Value Theorem', tags: ['theorems', 'proofs'],
    front: "State the Mean Value Theorem and prove it from [[Rolle's theorem]].",
    back: ":::theorem[Mean Value Theorem]\nIf $f$ is continuous on $[a,b]$ and differentiable on $(a,b)$, then there is $c\\in(a,b)$ with\n$$f'(c)=\\frac{f(b)-f(a)}{b-a}.$$\n:::\n\n:::proof*\n1. Subtract the secant line: $g(x)=f(x)-\\dfrac{f(b)-f(a)}{b-a}\\,(x-a)$.\n2. Then $g$ is continuous on $[a,b]$, differentiable on $(a,b)$, and $g(a)=g(b)=f(a)$.\n3. Rolle's theorem gives $c\\in(a,b)$ with $g'(c)=0$.\n4. Since $g'(c)=f'(c)-\\dfrac{f(b)-f(a)}{b-a}$, the claim follows.\n:::",
  },
  {
    id: 'ex-ftc', deck: 'Examples::Real Analysis', type: 'cloze', title: 'Fundamental Theorem of Calculus', tags: ['theorems'],
    front: ":::theorem[Fundamental Theorem of Calculus]\nIf $f$ is continuous on $[a,b]$ and $F'=f$ there, then\n$$\\int_a^b f(x)\\,dx = {{c1::F(b)-F(a)}} .$$\nMoreover $G(x)=\\int_a^x f(t)\\,dt$ satisfies $G'(x)={{c2::f(x)}}$.\n:::",
    back: 'The second part comes from continuity of $f$; the first follows because $F-G$ has zero derivative, so it is constant by the [[Mean Value Theorem]].',
  },
  {
    id: 'ex-bw', deck: 'Examples::Real Analysis', type: 'reverse', title: 'Bolzano–Weierstrass theorem', tags: ['theorems'],
    front: 'Bolzano–Weierstrass theorem',
    back: 'Every bounded sequence in $\\R^n$ has a convergent subsequence.',
  },
  {
    id: 'ex-cs', deck: 'Examples::Linear Algebra', type: 'cloze', title: 'Cauchy–Schwarz inequality', tags: ['inequalities'],
    front: 'For vectors $u,v$ in an inner product space,\n$$\\abs{\\inner{u}{v}} \\le {{c1::\\norm{u}\\,\\norm{v}}},$$\nwith equality if and only if {{c2::$u$ and $v$ are linearly dependent}}.',
    back: ':::idea\nFor $v\\neq 0$, expand $0\\le \\norm{u-tv}^2$ with $t=\\inner{u}{v}/\\norm{v}^2$.\n:::',
  },
  {
    id: 'ex-rank', deck: 'Examples::Linear Algebra', type: 'cloze', title: 'Rank–nullity theorem', tags: ['theorems'],
    front: 'For a linear map $T:V\\to W$ with $V$ finite-dimensional,\n$$\\dim V = {{c1::\\rank T + \\dim\\ker T}} .$$',
    back: 'Here $\\rank T=\\dim(\\operatorname{im} T)$. Extend a basis of $\\ker T$ to a basis of $V$; the images of the added vectors form a basis of $\\operatorname{im} T$.',
  },
  {
    id: 'ex-spectral', deck: 'Examples::Linear Algebra', type: 'basic', title: 'Spectral theorem', tags: ['theorems'],
    front: 'What does the spectral theorem say about a real symmetric matrix $A$?',
    back: ':::theorem[Spectral theorem]\nIf $A\\in\\R^{n\\times n}$ and $A^{\\top}=A$, there are an orthogonal matrix $Q$ and a real diagonal matrix $\\Lambda$ with\n$$A = Q\\Lambda Q^{\\top}.$$\n:::\nEquivalently, $\\R^n$ has an orthonormal basis of eigenvectors of $A$, and every eigenvalue is real.',
  },
  {
    id: 'ex-det', deck: 'Examples::Linear Algebra', type: 'cloze', title: '', tags: ['formulas'],
    front: '$$\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = {{c1::ad-bc}}$$',
    back: 'The matrix is invertible exactly when this number is non-zero.',
  },
  {
    id: 'ex-lagrange', deck: 'Examples::Algebra', type: 'basic', title: "Lagrange's theorem", tags: ['groups'],
    front: 'If $H$ is a subgroup of a finite group $G$, what can you say about $\\abs{H}$?\n\n:::hint\nThink about the left cosets $gH$.\n:::',
    back: ':::theorem[Lagrange]\n$\\abs{H}$ divides $\\abs{G}$; in fact $\\abs{G} = [G:H]\\,\\abs{H}$.\n:::\nThe left cosets of $H$ partition $G$, and each has $\\abs{H}$ elements.',
  },
  {
    id: 'ex-fermat', deck: 'Examples::Algebra', type: 'cloze', title: "Fermat's little theorem", tags: ['number-theory'],
    front: 'If $p$ is prime and $p\\nmid a$, then $a^{p-1}\\equiv {{c1::1}} \\pmod{p}$.',
    back: "A corollary of [[Lagrange's theorem]] for the group $(\\Z/p\\Z)^{\\times}$, which has order $p-1$.",
  },
  {
    id: 'ex-basel', deck: 'Examples::Algebra', type: 'cloze', title: 'Basel problem', tags: ['series'],
    front: '$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = {{c1::\\frac{\\pi^2}{6}}}$$',
    back: 'Solved by Euler in 1734. The same idea gives $\\sum_{n\\ge 1} 1/n^4 = \\pi^4/90$.',
  },
  {
    id: 'ex-bayes', deck: 'Examples::Algebra', type: 'cloze', title: "Bayes' theorem", tags: ['probability'],
    front: '$$P(A\\mid B) = \\frac{ {{c1::P(B\\mid A)\\,P(A)}} }{P(B)}$$',
    back: 'Valid whenever $P(B)>0$. Expanding the denominator gives $P(B)=\\sum_i P(B\\mid A_i)P(A_i)$ for a partition $\\{A_i\\}$.',
  },
];
const ords = (n) => {
  if (n.type === 'reverse') return ['1', '2'];
  if (n.type === 'cloze') { const s = new Set(); const re = /\{\{c(\d+)::/g; let m; while ((m = re.exec(n.front))) s.add(m[1]); return [...s].sort(); }
  return ['1'];
};
const notes = raw.map((n, i) => {
  const cards = {};
  for (const o of ords(n)) cards[o] = { st: 0, due: 0, s: 0, d: 0, last: 0, step: 0, reps: 0, lapses: 0 };
  return Object.assign({ requires: [], media: {}, created: base + i * 1000, modified: base + i * 1000, cards, log: [], example: true }, n);
});
module.exports = notes;
