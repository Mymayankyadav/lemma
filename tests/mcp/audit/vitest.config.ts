import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/mcp/audit/*.test.ts'],environment:'node',maxWorkers:1,hookTimeout:120000,testTimeout:60000}});
