import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,test,vi} from 'vitest';
import {TutorInkPad} from '../../../src/features/tutor/input/TutorInkPad';

test('the recommendation strip reserves shared glyphs for extensions and shows three choices per group',()=>{
  const host=document.createElement('div');
  const root=createRoot(host);
  const noop=()=>{};
  const accept=vi.fn();
  const reactEnvironment=globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  try {
    act(()=>root.render(<TutorInkPad enabled readiness="ready" strokes={[]} actionable keepDrawing={false} overBudget={false}
      recognized={['less-than-or-equal','unknown-match','less-than','equal','forall','empty-set']}
      completions={['unknown-extension','less-than-or-equal','greater-than-or-equal','not-equal','identical']}
      error="" onBegin={noop} onMove={noop} onEnd={noop} onInterrupt={noop} onUndo={noop} onClear={noop}
      onClose={noop} onBrowse={noop} onKeepDrawing={noop} onLockAutomatic={noop} onPressCandidate={noop}
      onReleaseCandidate={noop} onAccept={accept}/>));
    const groups=[...host.querySelectorAll('[role="group"]')];
    expect(groups.map(group=>group.getAttribute('aria-label'))).toEqual(['Matches','Could become']);
    const labels=(group:Element)=>[...group.querySelectorAll('button')].map(button=>button.getAttribute('aria-label'));
    expect(labels(groups[0])).toEqual(['Matches Less than','Matches Equal','Matches For all']);
    expect(labels(groups[1])).toEqual(['Could become Less than or equal to','Could become Greater than or equal to','Could become Not equal']);
    act(()=>groups[1].querySelector('button')?.click());
    expect(accept).toHaveBeenCalledWith('less-than-or-equal',false);
  } finally {
    act(()=>root.unmount());
    globalThis.IS_REACT_ACT_ENVIRONMENT=reactEnvironment;
  }
});
