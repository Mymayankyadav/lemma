import {afterEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {act, createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {motionV1, springEasing, staggerDelay} from '../../../src/ui/v7/motion'
import {REDUCE_EFFECTS_ATTR, REDUCE_EFFECTS_KEY, applyReduceEffects, bootReduceEffects, motionReduced, useMotionReduced} from '../../../src/ui/v7/effects'
import {useEnterMarks} from '../../../src/ui/v7/useEnterMarks'

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true
/** A minimal renderHook on React's own root (the repo has no testing-library). */
function renderHook<P, R>(hook: (props: P) => R, options: {initialProps?: P} = {}) {
  const result = {current: undefined as unknown as R}
  const host = document.createElement('div'), root = createRoot(host)
  const Probe = (props: {p: P}) => {result.current = hook(props.p); return null}
  act(() => root.render(createElement(Probe, {p: options.initialProps as P})))
  return {result, rerender: (props: P) => act(() => root.render(createElement(Probe, {p: props}))), unmount: () => act(() => root.unmount())}
}

// A1 · Motion v1 (release and assets plan): tokens, the sheet spring, the reduced-motion gate and list insert marks.
const css = readFileSync('src/ui/v7/motion.css', 'utf8')
const token = (name: string) => css.match(new RegExp('--' + name + ':\\s*([^;]+);'))?.[1].trim()

describe('A1 motion tokens', () => {
  it('CSS and motion.ts carry the same values as the plan', () => {
    expect(token('v7-m-instant')).toBe(motionV1.instant * 1000 + 'ms')
    expect(token('v7-m-quick')).toBe(motionV1.quick * 1000 + 'ms')
    expect(token('v7-m-base')).toBe(motionV1.base * 1000 + 'ms')
    expect(token('v7-m-draw')).toBe(motionV1.draw * 1000 + 'ms')
    expect(token('v7-ease-draw')?.match(/[\d.]+/g)?.map(Number)).toEqual(motionV1.drawEase)
    expect(token('v7-stagger')).toBe(motionV1.stagger * 1000 + 'ms')
    expect(token('v7-rise')).toBe(motionV1.rise + 'px')
    expect(motionV1.rise).toBeLessThanOrEqual(12)
  })
  it('the sheet spring in CSS is springEasing(380, 36): it settles in 350 ms and never bounces', () => {
    const spring = springEasing(motionV1.sheet.stiffness, motionV1.sheet.damping)
    expect(token('v7-spring-sheet')).toBe(spring.easing)
    expect(token('v7-spring-sheet-time')).toBe(spring.ms + 'ms')
    const stops = spring.easing.slice('linear('.length, -1).split(',').map(Number)
    expect(stops[0]).toBe(0)
    expect(stops.at(-1)).toBe(1)
    for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1])
    expect(Math.max(...stops)).toBeLessThanOrEqual(1)
  })
  it('a critically damped spring also settles', () => {
    const spring = springEasing(400, 40)
    expect(spring.ms).toBeGreaterThan(100)
    expect(spring.easing.startsWith('linear(0, ')).toBe(true)
  })
  it('staggers 30 ms apart and caps at six steps', () => {
    expect([0, 1, 2, 5, 6, 40].map(staggerDelay)).toEqual([0, .03, .06, .15, .15, .15])
    expect(staggerDelay(-3)).toBe(0)
    expect(staggerDelay(Number.NaN)).toBe(0)
  })
})

describe('A1 every animation is gated', () => {
  const gate = '@media (prefers-reduced-motion: no-preference) {'
  const inside = css.slice(css.indexOf(gate), css.indexOf('@keyframes v7-m-rise'))
  const outside = css.slice(0, css.indexOf(gate))
  it('animations and transitions start only inside the no-preference block, and every rule there skips Reduce effects', () => {
    expect(css.indexOf(gate)).toBeGreaterThan(0)
    expect(outside.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/animation:\s*v7-|@starting-style/)
    const selectors = inside.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(line => line.trim()).filter(line => line.startsWith(':where(html'))
    expect(selectors.length).toBeGreaterThan(8)
    for (const selector of selectors) expect(selector).toContain(':where(html[data-v7]:not([data-v7-reduce-effects]))')
  })
  it('Reduce effects stops every animation and blur', () => {
    expect(outside).toMatch(/\[data-v7-reduce-effects\]\) \*,[\s\S]*animation: none !important;[\s\S]*backdrop-filter: none !important;/)
  })
})

describe('A1 Reduce effects', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(REDUCE_EFFECTS_ATTR)
    localStorage.clear()
    vi.unstubAllGlobals()
  })
  it('applies now and on the next start', () => {
    applyReduceEffects(true)
    expect(document.documentElement.hasAttribute(REDUCE_EFFECTS_ATTR)).toBe(true)
    expect(localStorage.getItem(REDUCE_EFFECTS_KEY)).toBe('1')
    document.documentElement.removeAttribute(REDUCE_EFFECTS_ATTR)
    bootReduceEffects()
    expect(document.documentElement.hasAttribute(REDUCE_EFFECTS_ATTR)).toBe(true)
    applyReduceEffects(false)
    expect(document.documentElement.hasAttribute(REDUCE_EFFECTS_ATTR)).toBe(false)
    expect(localStorage.getItem(REDUCE_EFFECTS_KEY)).toBeNull()
    bootReduceEffects()
    expect(document.documentElement.hasAttribute(REDUCE_EFFECTS_ATTR)).toBe(false)
  })
  it('motion is reduced by the system setting or by the switch', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({matches: false, media: query, addEventListener() {}, removeEventListener() {}}))
    expect(motionReduced()).toBe(false)
    applyReduceEffects(true)
    expect(motionReduced()).toBe(true)
    applyReduceEffects(false)
    vi.stubGlobal('matchMedia', (query: string) => ({matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}}))
    expect(motionReduced()).toBe(true)
  })
  it('the hook follows the switch while mounted', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({matches: false, media: query, addEventListener() {}, removeEventListener() {}}))
    const {result} = renderHook(() => useMotionReduced(), {initialProps: undefined})
    expect(result.current).toBe(false)
    await act(async () => {applyReduceEffects(true); await Promise.resolve()})
    expect(result.current).toBe(true)
  })
})

describe('A1 list insert marks', () => {
  it('never marks what was there when the list loaded; marks later additions in stagger order', () => {
    const {result, rerender} = renderHook(({keys, ready}: {keys: string[]; ready: boolean}) => useEnterMarks(keys, ready), {initialProps: {keys: [] as string[], ready: false}})
    rerender({keys: ['a', 'b'], ready: true})
    expect(result.current('a')).toEqual({})
    expect(result.current('b')).toEqual({})
    rerender({keys: ['a', 'b', 'c', 'd'], ready: true})
    expect(result.current('c')).toEqual({'data-v7-enter': '', style: {animationDelay: '0ms'}})
    expect(result.current('d')).toEqual({'data-v7-enter': '', style: {animationDelay: '30ms'}})
    expect(result.current('a')).toEqual({})
    // A re-render keeps an entering item's mark (its animation is not restarted with another delay).
    rerender({keys: ['a', 'b', 'c', 'd'], ready: true})
    expect(result.current('d')).toEqual({'data-v7-enter': '', style: {animationDelay: '30ms'}})
  })
  it('a new scope (another day) starts over and its first list does not animate', () => {
    const {result, rerender} = renderHook(({keys, ready, scope}: {keys: string[]; ready: boolean; scope: string}) => useEnterMarks(keys, ready, scope),
      {initialProps: {keys: ['a'], ready: true, scope: 'mon'}})
    rerender({keys: ['a', 'b'], ready: true, scope: 'mon'})
    expect(result.current('b')['data-v7-enter']).toBe('')
    rerender({keys: [], ready: false, scope: 'tue'})
    rerender({keys: ['x', 'y'], ready: true, scope: 'tue'})
    expect(result.current('x')).toEqual({})
    expect(result.current('y')).toEqual({})
  })
  it('caps the stagger at six steps', () => {
    const {result, rerender} = renderHook(({keys}: {keys: string[]}) => useEnterMarks(keys), {initialProps: {keys: [] as string[]}})
    rerender({keys: Array.from({length: 9}, (_, i) => 'k' + i)})
    expect(result.current('k8').style?.animationDelay).toBe('150ms')
  })
})
