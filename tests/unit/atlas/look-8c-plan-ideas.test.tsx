import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

/** LOOK-8c: the plan's embedded graph must reuse the actual v4 Atlas. */
const graph=readFileSync('src/features/atlas/IdeaGraph.tsx','utf8');
const review=readFileSync('src/features/plan-proposal/Page.tsx','utf8');

describe('LOOK-8c plan-review Atlas hierarchy',()=>{
 it('offers named, accessible 44px fold levels instead of numeric mystery controls',()=>{
  for(const label of ['Fields','Areas','Topics','All'])
   expect(graph).toContain("label:'"+label+"'");
  expect(graph).toContain('aria-label={\'Show \'+foldLabel.toLowerCase()+\' level\'}');
  expect(graph).toContain('min-h-11 min-w-11');
  expect(graph).toContain('aria-pressed={depth===d}');
  expect(graph).not.toContain("{d===99?'All':d}");
 });
 it('reuses the merged Atlas level rows, geometry, selection tones and dependency lanes',()=>{
  expect(graph).toContain("import {Row,StatusMark,Wires,toneColor,statusName} from './Outline'");
  expect(graph).toContain('buildAtlasRowGeometry');
  expect(graph).toContain('rowTone(tree,row.id,focus,selectedId');
  expect(graph).toContain('focused={!!focus}');
  expect(graph).toContain('bg-[var(--ink)] text-[var(--paper)]');
  expect(graph).toContain('bg-[var(--paper-2)] font-semibold text-ink');
  expect(graph).toContain('<Wires arcs={arcBudget.visible}');
  expect(graph).toContain('centers={geometry.centers}');
  expect(graph).toContain('heightPx={geometry.totalHeight}');
  expect(graph).toContain('style={{background:\'var(--paper)\'}} role="tree"');
  expect(graph).not.toContain('relative overflow-hidden rounded-ctl border border-edge');
 });
 it('shows the selection and both connection directions on paper',()=>{
  expect(graph).toContain('data-idea-selection="true"');
  expect(graph).toContain("background:'var(--paper)'");
  expect(graph).toContain("color:'var(--link)'");
  expect(graph).toContain('Builds on {near.needs.length}');
  expect(graph).toContain('Opens up {near.unlocks.length}');
  expect(graph).toContain('aria-label="Clear selection"');
  expect(graph).toContain('min-h-11');
 });
 it('preserves the full changed-plan map, proposal controls and review-only embedding',()=>{
  expect(review).toContain('<StablePlanMap');
  expect(review).toContain('nodes={mapNodes}');
  expect(review).toContain('<StableIdeaGraph tree={ideaTree} label="Ideas in this plan" onCheckpoint={openCheckpoint}');
  expect(review).toContain('Approve plan');
  expect(review).toContain('Ask for changes');
  expect(graph).not.toMatch(/approveProposal|useApproveProposal|notify_act/);
 });
 it('opens a focus-trapped proposed-idea Details sheet with local path and checkpoint controls',()=>{
  expect(graph).toContain("import {Sheet} from '../../ui/Sheet'");
  expect(graph).toContain("import {AtlasDetailsPath,AtlasDetailsTitle} from './DetailsMath'");
  expect(graph).toContain('title={selected?<AtlasDetailsTitle name={selected.name}/>:undefined}');
  expect(graph).toContain('min-h-11 max-w-full overflow-x-auto');
  expect(graph).toContain('onClick={()=>setDetails(true)}');
  expect(graph).toContain('<Sheet open={details&&!!selected}');
  expect(graph).toContain('data-proposed-idea-details="true"');
  expect(graph).toContain('onSelect={i=>jump(selectedPath[i].id)}');
  expect(graph).toContain('<Names title="Related"');
  expect(graph).toContain('<Names title="Inside"');
  expect(graph).toContain('setDetails(false);onCheckpoint?.(r.code)');
  expect(graph).not.toMatch(/useNavigate|navigate\(|window\.location|href=.*atlas/);
 });

});
