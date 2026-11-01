import {expect,test,vi} from 'vitest';

// ST-4 strict 4x CPU Cards transition only opens the list. Loading the rich
// editor and its preview/render dependencies before the user taps New card
// wastes the first-interactive-frame budget.
vi.mock('../../../src/features/cards/Editor',()=>{
 throw new Error('Card Editor evaluated before the create sheet opened');
});

test('Cards list route can load without evaluating the optional editor',async()=>{
 const route=await import('../../../src/features/cards/Page');
 expect(typeof route.default).toBe('function');
});
