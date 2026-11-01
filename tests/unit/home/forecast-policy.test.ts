import {describe,expect,it} from 'vitest'
import {shouldDeferForecast} from '../../../src/features/home/forecastPolicy'

// FIX #507: only the in-browser demo adapter pays for an expensive local
// deck-tree scan. Live accounts use a bounded server RPC, which must start
// promptly even when the desk has 60 projects and the forecast is below fold.
describe('FIX #507 forecast fetch policy',()=>{
 it('keeps the bounded live forecast eager for large real accounts',()=>{
  expect(shouldDeferForecast(60,'live')).toBe(false)
  expect(shouldDeferForecast(5,'live')).toBe(false)
 });
 it('defers the expensive local forecast only above the scale switch',()=>{
  expect(shouldDeferForecast(60,'demo')).toBe(true)
  expect(shouldDeferForecast(15,'demo')).toBe(true)
  expect(shouldDeferForecast(4,'demo')).toBe(false)
  expect(shouldDeferForecast(0,'demo')).toBe(false)
 });
});
