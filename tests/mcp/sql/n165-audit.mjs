// The original bug reproductions exercise TypeScript adapters against the complete migrated database.
// They run here because SQL CI provides PGlite, while ordinary browser unit tests do not.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const module=process.env.PGLITE_MODULE||import.meta.resolve('@electric-sql/pglite');
const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../../node_modules/vitest/vitest.mjs',import.meta.url)),'run','--config','tests/mcp/audit/vitest.config.ts'],{stdio:'inherit',env:{...process.env,PGLITE_MODULE:module}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
