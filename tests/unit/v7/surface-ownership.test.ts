// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {dismissTopLayer,hasDirtyLayer,hasOpenLayer,registerLayer,requestLayerClose,subscribeLayers} from '../../../src/ui/v7/layers';
import {closeTopLayer} from '../../../src/platform/links';
import {civilDate,dayKey,moveDay} from '../../../src/ui/v7/dateGrid';

afterEach(()=>{document.body.replaceChildren();document.body.style.overflow='';});
describe('surface ownership',()=>{
  it('uses opening order for Back, retains the original scroll lock, and unregisters in either order',()=>{
    const parent=document.createElement('dialog'), choice=document.createElement('div'), guard=document.createElement('dialog');
    document.body.append(guard,parent,choice);
    document.body.style.overflow='auto';
    const listener=vi.fn(), stop=subscribeLayers(listener), close=vi.fn(), choose=vi.fn(), discard=vi.fn();
    const a=registerLayer({element:parent,role:'S3',trigger:null,dismiss:close,dirty:()=>true});
    const b=registerLayer({element:choice,role:'S4',trigger:null,owner:parent,dismiss:choose});
    expect(closeTopLayer(document)).toBe(true);
    expect(choose).toHaveBeenCalledWith('back');
    requestLayerClose(parent,'escape');
    expect(close).not.toHaveBeenCalled();
    const c=registerLayer({element:guard,role:'S5',trigger:null,owner:parent,dismiss:discard});
    b(false); a(false);
    expect(document.body.style.overflow).toBe('hidden');
    expect(hasDirtyLayer()).toBe(false);
    expect(dismissTopLayer('escape')).toBe(true);
    expect(discard).toHaveBeenCalledWith('escape');
    c(false);c(false);
    expect(document.body.style.overflow).toBe('auto');
    expect(hasOpenLayer()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(6);
    stop();
  });
  it('preserves the focus a surviving step places when a discard removes its original launcher',async()=>{
    const owner=document.createElement('div'), guard=document.createElement('div');
    const close=document.createElement('button'), original=document.createElement('button'), row=document.createElement('button');
    owner.append(close,original);document.body.append(owner,guard);
    const a=registerLayer({element:owner,role:'S3',trigger:null,dismiss:vi.fn()});
    const b=registerLayer({element:guard,role:'S5',owner,trigger:original,dismiss:vi.fn()});
    original.replaceWith(row);b();row.focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(row);
    a(false);
  });
  it('keeps a child above its parent when React registers both in one layout commit',()=>{
    const parent=document.createElement('div'), child=document.createElement('div');
    parent.append(child);document.body.append(parent);
    const dismiss=vi.fn(), owner=vi.fn();
    const a=registerLayer({element:child,role:'step',trigger:null,dismiss});
    const b=registerLayer({element:parent,role:'S3',trigger:null,dismiss:owner});
    dismissTopLayer('back');
    expect(dismiss).toHaveBeenCalledWith('back');expect(owner).not.toHaveBeenCalled();
    b(false);a(false);
  });
});
describe('date grid roving cursor',()=>{
  it.each([
    ['2026-11-26','ArrowDown',false,'2026-12-03'], ['2026-12-03','ArrowUp',false,'2026-11-26'],
    ['2024-02-28','ArrowRight',false,'2024-02-29'],['2024-03-01','ArrowLeft',false,'2024-02-29'],
    ['2025-12-31','ArrowRight',false,'2026-01-01'],['2026-01-31','PageDown',false,'2026-02-28'],
    ['2024-02-29','PageDown',true,'2025-02-28'],['2026-03-31','PageUp',false,'2026-02-28'],
    ['2026-11-26','Home',false,'2026-11-22'],['2026-11-26','End',false,'2026-11-28'],
  ] as const)('%s, %s (year modifier %s) lands on %s without committing', (value,key,shift,end)=>{
    const original=civilDate(value);
    expect(dayKey(moveDay(original,key,shift)!)).toBe(end);
    expect(dayKey(original)).toBe(value);
    expect(moveDay(original,'Tab')).toBeNull();
  });
});
