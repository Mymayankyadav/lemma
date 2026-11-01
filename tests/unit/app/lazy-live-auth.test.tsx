import {expect,test,vi} from 'vitest';

// A static Supabase client import in either app entry component adds ~228 kB
// to demo Today and regresses the strict 4x CPU cold-render budget.
// Dynamic imports are allowed only when live auth actually needs them.
vi.mock('../../../src/data/live/client',()=>{
 throw new Error('Supabase client evaluated in the demo startup graph');
});

test('AppShell and AuthGate import without evaluating live auth',async()=>{
 const [shell,gate]=await Promise.all([
  import('../../../src/app/AppShell'),
  import('../../../src/app/AuthGate'),
 ]);
 expect(typeof shell.default).toBe('function');
 expect(typeof gate.default).toBe('function');
});
