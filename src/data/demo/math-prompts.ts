/** Real, short mathematical review items, never generated "Explain topic (n)" fillers.
 * Each checkpoint has at least two complementary prompts; densely reviewed ones
 * (especially compactness) have more. LaTeX is intentional and checked in demo tests.
 */
export const mathPrompts: Record<string, readonly (readonly [string,string])[]> = {
 'real-analysis:Metric spaces': [
  ['What is the triangle inequality for a metric $d$?', '$d(x,z)\\le d(x,y)+d(y,z)$ for all $x,y,z$.'],
  ['Why are open metric balls open?', 'For $y\\in B(x,r)$, choose $\\varepsilon=r-d(x,y)>0$; then $B(y,\\varepsilon)\\subseteq B(x,r)$.']
 ],
 'real-analysis:Open and closed sets': [
  ['Show that arbitrary unions of open sets are open.', 'If $x$ lies in the union, one member contains a ball around $x$; that ball lies in the union.'],
  ['What characterizes a closed set in a metric space using sequences?', '$F$ is closed exactly when every convergent sequence in $F$ has its limit in $F$.']
 ],
 'real-analysis:Sequences': [
  ['Why does every convergent sequence in a metric space have a unique limit?', 'If $x_n\\to a$ and $x_n\\to b$, then $d(a,b)\\le d(a,x_n)+d(x_n,b)\\to0$.'],
  ['State the Cauchy criterion in a complete metric space.', 'A sequence converges exactly when it is Cauchy: for every $\\varepsilon>0$ its sufficiently late terms are within $\\varepsilon$.']
 ],
 'real-analysis:Compactness': [
  ['State the open-cover definition of compactness.', 'Every open cover of $K$ admits a finite subcover.'],
  ['Why is a compact subset of a Hausdorff space closed?', 'For each $x\\notin K$, separate $x$ from each $y\\in K$; a finite subcover of $K$ yields one neighborhood of $x$ disjoint from $K$.'],
  ['Where is finiteness used when proving compact sets are closed in a Hausdorff space?', 'The intersection of finitely many neighborhoods of $x$ remains open, and it avoids the corresponding finite union covering $K$.'],
  ['Does a closed subset of a compact space remain compact?', 'Yes: adjoin the open complement of the closed set to any relative open cover, then extract a finite subcover of the ambient compact space.'],
  ['Give a compactness argument for a continuous image.', 'Pull back an open cover of $f(K)$ along continuous $f$, choose finitely many preimages covering $K$, then push those finitely many sets forward.'],
  ['Is every compact set bounded in a metric space?', 'Yes: balls $B(x_0,n)$ for $n\\in\\mathbb N$ cover it; one member of a finite subcover supplies a uniform bound.'],
  ['What goes wrong if an open cover has no finite subcover?', 'By definition the space or subset is not compact; for $(0,1)$ the cover $\\{(1/n,1):n\\ge2\\}$ has no finite subcover.'],
  ['State sequential compactness for metric spaces.', 'Every sequence has a convergent subsequence whose limit belongs to the space; this is equivalent to compactness for metric spaces.'],
  ['Does compactness imply completeness in metric spaces?', 'Yes. A Cauchy sequence has a convergent subsequence by sequential compactness, forcing the whole sequence to converge.'],
  ['Why is $\\mathbb R$ not compact in its usual metric?', 'The open cover $\\{(-n,n):n\\in\\mathbb N\\}$ has no finite subcover.']
 ],
 'real-analysis:Continuity': [
  ['Give the $\\varepsilon$–$\\delta$ definition of continuity at $a$.', 'For every $\\varepsilon>0$ there is $\\delta>0$ such that $d_X(x,a)<\\delta$ implies $d_Y(f(x),f(a))<\\varepsilon$.'],
  ['What is the open-set characterization of continuity?', '$f:X\\to Y$ is continuous iff every open $U\\subseteq Y$ has open preimage $f^{-1}(U)\\subseteq X$.']
 ],
 'real-analysis:Limits of functions': [
  ['State the sequential criterion for $\\lim_{x\\to a}f(x)=L$.', 'For every sequence $x_n\\to a$ with $x_n\\ne a$, one has $f(x_n)\\to L$, assuming $a$ is an accumulation point.'],
  ['Why is a function limit unique in a Hausdorff codomain?', 'Two distinct limits would admit disjoint neighborhoods, but sufficiently near $a$ the function must lie in both.']
 ],
 'real-analysis:Heine–Borel': [
  ['State Heine–Borel in $\\mathbb R^n$.', 'A subset of $\\mathbb R^n$ is compact if and only if it is closed and bounded.'],
  ['Why is boundedness alone not enough for compactness?', 'The bounded set $(0,1)$ is not closed in $\\mathbb R$, hence not compact by Heine–Borel.']
 ],
 'real-analysis:Uniform continuity': [
  ['What quantifier distinguishes uniform from pointwise continuity?', 'In uniform continuity $\\delta$ depends only on $\\varepsilon$, not on the base point $x$.'],
  ['Why is a continuous function on a compact metric space uniformly continuous?', 'Use a finite subcover of neighborhoods witnessing local continuity and a Lebesgue-number argument.']
 ],
 'real-analysis:Extreme value theorem': [
  ['State the extreme value theorem.', 'A continuous real-valued function on a nonempty compact space attains both its maximum and minimum.'],
  ['What compactness property proves the extreme value theorem?', 'The continuous image is compact in $\\mathbb R$, hence closed and bounded, so it contains its supremum and infimum.']
 ],
 'real-analysis:Connectedness': [
  ['What is a separation of a topological space?', 'A decomposition into two disjoint nonempty relatively open sets whose union is the space.'],
  ['Why is the continuous image of a connected space connected?', 'A separation of the image pulls back to a separation of the domain.']
 ],
 'real-analysis:Intermediate value theorem': [
  ['State the intermediate value theorem.', 'For continuous $f:[a,b]\\to\\mathbb R$, every value between $f(a)$ and $f(b)$ occurs at some $c\\in[a,b]$.'],
  ['Which topological property underlies the intermediate value theorem?', 'Intervals are connected, and continuous images preserve connectedness.']
 ],
 'real-analysis:Capstone proofs': [
  ['Prove a continuous bijection from compact to Hausdorff is a homeomorphism.', 'A continuous image of any closed subset of the compact domain is compact, hence closed in the Hausdorff codomain; the inverse is continuous.'],
  ['Where do compactness and Hausdorffness enter the compact-to-Hausdorff theorem?', 'Compactness makes closed domain subsets compact; Hausdorffness makes their images closed.']
 ],
 'linear-algebra:Vector spaces': [
  ['What follows from $0v=0$ in any vector space?', 'Using $(0+0)v=0v+0v$, cancel $0v$ to obtain the zero vector.'],
  ['Is the intersection of two vector subspaces a subspace?', 'Yes: it contains zero and is closed under addition and scalar multiplication.']
 ],
 'linear-algebra:Linear independence': [
  ['Define linear independence of $v_1,\\dots,v_n$.', 'If $\\sum_i a_iv_i=0$, then every coefficient $a_i=0$.'],
  ['Can a set containing the zero vector be linearly independent?', 'No. The zero vector admits a nontrivial linear relation $1\\cdot0=0$.']
 ],
 'linear-algebra:Span': [
  ['What is $\\operatorname{span}(S)$?', 'The set of all finite linear combinations of elements of $S$, equivalently the smallest subspace containing $S$.'],
  ['Why is the span of any subset a subspace?', 'Finite linear combinations are closed under addition and scalar multiplication and include zero.']
 ],
 'linear-algebra:Basis': [
  ['What two properties define a basis?', 'A basis spans the vector space and is linearly independent.'],
  ['Why are coordinates relative to a basis unique?', 'Subtract two expansions; linear independence forces each coefficient difference to be zero.']
 ],
 'linear-algebra:Linear maps': [
  ['What is the kernel of a linear map $T:V\\to W$?', '$\\ker T=\\{v\\in V:T(v)=0\\}$; it is a subspace of $V$.'],
  ['When is a linear map injective?', 'Exactly when $\\ker T=\\{0\\}$.']
 ],
 'linear-algebra:Rank': [
  ['State rank–nullity.', 'For finite-dimensional $V$, $\\dim V=\\operatorname{rank}T+\\operatorname{nullity}T$.'],
  ['Why must $\\operatorname{rank}T\\le\\dim V$?', 'The image is spanned by images of any basis of $V$, so cannot have greater dimension.']
 ],
 'linear-algebra:Null spaces': [
  ['What set does a matrix null space describe?', 'For $A\\in\\mathbb F^{m\\times n}$ it is $\\{x\\in\\mathbb F^n:Ax=0\\}$.'],
  ['How do free variables relate to nullity?', 'In row-echelon form, the number of free variables is $n-\\operatorname{rank}A$, the nullity.']
 ],
 'linear-algebra:Determinants': [
  ['What is $\\det(AB)$?', '$\\det(AB)=\\det(A)\\det(B)$ for square matrices of equal size.'],
  ['When is a square matrix invertible in terms of determinant?', 'Exactly when its determinant is nonzero.']
 ],
 'linear-algebra:Diagonalization': [
  ['When is $A$ diagonalizable?', 'Exactly when there exists a basis of eigenvectors, so $A=PDP^{-1}$ with diagonal $D$.'],
  ['Can a matrix with distinct eigenvalues fail to be diagonalizable?', 'No. Eigenvectors for distinct eigenvalues are independent; $n$ distinct eigenvalues give an eigenbasis.']
 ],
 'linear-algebra:Eigenvectors': [
  ['What equation defines an eigenvector?', '$Av=\\lambda v$ for some nonzero $v$ and scalar $\\lambda$.'],
  ['Why must an eigenvector be nonzero?', 'Otherwise every scalar would satisfy $A0=\\lambda0$, giving no spectral information.']
 ],
 'linear-algebra:Invariant subspaces': [
  ['What does $T$-invariant mean for a subspace $W$?', '$T(W)\\subseteq W$.'],
  ['Are eigenspaces invariant under their operator?', 'Yes. If $Tv=\\lambda v$, then $Tv$ remains in the same eigenspace.']
 ],
 'linear-algebra:Spectral theorem': [
  ['State the real symmetric spectral theorem.', 'Every real symmetric matrix has an orthonormal basis of real eigenvectors.'],
  ['How is a real symmetric matrix orthogonally diagonalized?', '$A=QDQ^{\\mathsf T}$ where $Q$ is orthogonal and $D$ is real diagonal.']
 ],
 'linear-algebra:Jordan form': [
  ['Why does a Jordan block have ones on the superdiagonal?', 'The generalized eigenvector chain satisfies $(A-\\lambda I)v_{j+1}=v_j$.'],
  ['When is the Jordan form diagonal?', 'Exactly when the matrix is diagonalizable, so all Jordan blocks have size one.']
 ],
 'linear-algebra:Capstone proofs': [
  ['Show that a linear map of equal finite dimensions is injective iff surjective.', 'Rank–nullity gives nullity zero iff rank equals the common dimension.'],
  ['What dimension argument guarantees a basis extends from independent vectors?', 'Add vectors outside the current span until spanning; dimension bounds the number of extensions.']
 ],
 'topology:Sets and functions': [
  ['What does $f^{-1}(A\\cup B)$ equal?', '$f^{-1}(A)\\cup f^{-1}(B)$ for any function $f$.'],
  ['What does $f^{-1}(Y\\setminus A)$ equal?', '$X\\setminus f^{-1}(A)$ when $f:X\\to Y$.']
 ],
 'topology:Topological spaces': [
  ['State the axioms for a topology $\\tau$ on $X$.', '$\\varnothing,X\\in\\tau$; arbitrary unions and finite intersections of members of $\\tau$ remain in $\\tau$.'],
  ['What is the indiscrete topology on $X$?', '$\\{\\varnothing,X\\}$, the coarsest topology on $X$.']
 ],
 'topology:Open covers': [
  ['What is an open cover of $A\\subseteq X$?', 'A family of open sets whose union contains $A$.'],
  ['Does the subspace topology preserve compactness of a compact subset?', 'Yes: an open cover in the subspace arises by intersecting an ambient open cover; the same finite subcover works.']
 ],
 'topology:Hausdorff spaces': [
  ['What is the Hausdorff separation axiom?', 'Any distinct $x,y$ have disjoint open neighborhoods.'],
  ['Why is a singleton closed in a Hausdorff space?', 'For each $y\\ne x$, there is an open neighborhood of $y$ excluding $x$, so its complement is open.']
 ],
 'topology:Connectedness': [
  ['Can a connected space have a nontrivial clopen subset?', 'No: a nonempty proper clopen set and its complement would separate the space.'],
  ['Why is $[0,1]$ connected?', 'A separation would contradict the least-upper-bound property of $\\mathbb R$.']
 ],
 'topology:Compact spaces': [
  ['What does compactness mean without a metric?', 'Every open cover of the space admits a finite subcover.'],
  ['Is every finite topological space compact?', 'Yes: from any open cover choose one covering set for each point, giving finitely many.']
 ],
 'topology:Products': [
  ['What is a basic open set in the product topology?', 'A product of opens in which all but finitely many factors equal their whole spaces.'],
  ['Do projections from a product have continuous maps?', 'Yes. The inverse image of an open set under a coordinate projection is subbasic open.']
 ],
 'topology:Quotients': [
  ['Define the quotient topology induced by a surjection $q:X\\to Y$.', '$U\\subseteq Y$ is open iff $q^{-1}(U)$ is open in $X$.'],
  ['What universal property does a quotient map give?', 'A map $g:Y\\to Z$ is continuous iff $g\\circ q:X\\to Z$ is continuous, provided $q$ is a quotient map.']
 ],
 'topology:Capstone proofs': [
  ['Show a compact Hausdorff space is normal.', 'For disjoint closed $A,B$, compactness yields finitely many separating neighborhoods, then disjoint open neighborhoods of the sets.'],
  ['Why is the diagonal closed in a Hausdorff product?', 'For $x\\ne y$ choose disjoint neighborhoods $U,V$; $U\\times V$ avoids the diagonal.']
 ]
};
