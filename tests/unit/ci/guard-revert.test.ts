import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {onlyCalibration} from '../../../scripts/ci/revert.mjs'

describe('revert culprit search',()=>{
 it('a commit touching only the calibration table is never a culprit',()=>{
  expect(onlyCalibration(['ci/perf-calibration.md'])).toBe(true)
  expect(onlyCalibration(['ci/perf-calibration.md','src/a.ts'])).toBe(false)
  expect(onlyCalibration(['ci/test-map.json'])).toBe(false)
  expect(onlyCalibration([])).toBe(false)
 })
})
