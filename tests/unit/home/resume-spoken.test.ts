import {describe,expect,it} from 'vitest';
import {resumeSpoken} from '../../../src/features/home/resumeSpoken';

describe('Continue accessible math description',()=>{
 it('speaks tutor-authored mathematics without raw LaTeX control sequences',()=>{
  const spoken=resumeSpoken(
   String.raw`Topology of $\mathbb{R}^n$`,
   String.raw`Prove $\pi_1(S^1)\cong\mathbb{Z}$`,
   ' · step 2 of 5','2 h ago');
  expect(spoken).toContain('ℝⁿ');
  expect(spoken).toContain('π₁');
  expect(spoken).toContain('ℤ');
  expect(spoken).toContain('π₁(S¹)≅ℤ');
  expect(spoken).toContain('≅');
  expect(spoken).not.toContain('cong');
  expect(spoken).not.toMatch(/[\\$]/);
  expect(spoken).not.toContain('mathbb');
  expect(spoken).toContain(', step 2 of 5');
  expect(spoken).toContain('Paused 2 h ago');
 });
 it('reads common approximate relations as symbols, not command names',()=>{
  const spoken=resumeSpoken('Analysis',String.raw`$f\simeq g$ and $a\approx b$`,'',null);
  expect(spoken).toContain('f≃ g');
  expect(spoken).toContain('a≈ b');
  expect(spoken).not.toMatch(/\\(?:simeq|approx)/);
 });
 it('retains the existing plain-text step and pause wording',()=>{
  expect(resumeSpoken('Real Analysis','Compactness',' · step 2 of 4','2 h ago'))
   .toBe('Real Analysis. Compactness, step 2 of 4. Paused 2 h ago');
 });
});
