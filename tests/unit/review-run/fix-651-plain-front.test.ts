import {describe,expect,it} from 'vitest';
import {isPlainReviewFront} from '../../../src/features/review-run/plainFront';

// FIX #651: the first stress card is an ordinary question. Loading KaTeX
// and the Markdown renderer before showing that plain text wastes the cold
// 4x CPU budget. Rich/math/cloze cards must retain the full renderer.
describe('FIX #651 safe plain Review front fast path',()=>{
 it('recognizes ordinary text without mathematical or Markdown syntax',()=>{
  expect(isPlainReviewFront('Why does a finite intersection of open neighborhoods remain open?','basic')).toBe(true);
  expect(isPlainReviewFront('Definition of compactness.','basic')).toBe(true);
 });
 it('never bypasses mathematical notation, Markdown or HTML entities',()=>{
  for(const text of ['For each $x$','\\(\\alpha\\)','**bold**','[link](https://example.com)',
   '&frac12;','1. Numbered list','- Bullet','First line\nSecond line','https://example.com','<em>markup</em>']){
   expect(isPlainReviewFront(text,'basic'),text).toBe(false);
  }
 });
 it('keeps CommonMark/GFM structural syntax on the rich renderer (audit #6563485891)',()=>{
  // These were rendered literally by the fast <p> path despite being valid Markdown.
  for(const source of [
   '---','- - -','   ---','1) First item','42) Next item',
   'reader@example.org','reader+math@example.edu','    indented code',
  ]){
   expect(isPlainReviewFront(source,'basic'),source).toBe(false);
  }
  // Plain prose must still avoid the rich module on cold Review-run.
  for(const source of ['What is compactness?','Definition of compactness.','Find the next step - then explain.']){
   expect(isPlainReviewFront(source,'basic'),source).toBe(true);
  }
 });
 it('keeps cloze and reverse cards on the rich renderer',()=>{
  expect(isPlainReviewFront('Simple text','cloze')).toBe(false);
  expect(isPlainReviewFront('Simple text','reverse')).toBe(false);
 });
});
