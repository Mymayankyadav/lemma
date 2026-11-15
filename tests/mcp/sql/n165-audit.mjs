// Run the original TypeScript adapter/MCP reproductions against all migrations.
// SQL CI provides PGlite. The ordinary unit runner and its protected configuration are unchanged.
import {startVitest} from 'vitest/node';
process.env.PGLITE_MODULE ||= import.meta.resolve('@electric-sql/pglite');
const context=await startVitest('test',[],{
 config:false,watch:false,include:['tests/mcp/audit/*.test.ts'],environment:'node',maxWorkers:1,
 hookTimeout:120000,testTimeout:60000,
});
await context.close();
