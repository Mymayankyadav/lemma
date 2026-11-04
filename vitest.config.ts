import { defineConfig, configDefaults } from 'vitest/config'
import { readFileSync } from 'node:fs'

// CI switches only (no assertion or threshold is changed here):
//  - LEMMA_PERF=off  skips the timing-based unit checks listed in ci/perf-checks.json (they run in perf-report)
//  - CI_JUNIT_DIR    also writes a JUnit report for failure signatures (file: unit-<CI_JUNIT_NAME|unit>.xml)
const perf: string[] = process.env.LEMMA_PERF === 'off'
  ? (JSON.parse(readFileSync('ci/perf-checks.json', 'utf8')).unit as {path: string}[]).map((e) => e.path)
  : []
const junit = process.env.CI_JUNIT_DIR
export default defineConfig({test: {
  include: ['tests/unit/**/*.test.{ts,tsx}'],
  exclude: [...configDefaults.exclude, ...perf],
  environment: 'jsdom',
  clearMocks: true,
  reporters: junit ? ['default', ['junit', {outputFile: `${junit}/unit-${process.env.CI_JUNIT_NAME ?? 'unit'}.xml`}]] : ['default'],
}})
