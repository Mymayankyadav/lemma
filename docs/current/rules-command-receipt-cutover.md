## Owner review for command receipt write permissions

The November 20 release needs an authoritative receipt before it can acknowledge an evidence, tutor, or review write. The existing ledger allowed an authenticated browser to create and delete its own rows. This proposed rules change gives the seven existing RPCs a way to record legitimate writes while closing direct client write access. The release switch is separate.

### Existing data and callers

The migration creates a fresh nullable `smallint` named `trusted_writer_version` without a default or backfill. If that name already exists, the migration aborts because its historical write privileges cannot establish provenance. Existing receipts and new legacy receipts keep NULL. The N191 trusted writer explicitly sets version 1 on successful new writes. The original composite key, owner SELECT policy, request-specific replay, journal, export registration and service-role account purge continue to apply.

| Public function | How the upgraded call is authorized |
| --- | --- |
| `edit_note_atomic(uuid,integer,jsonb,uuid)` | Requires the authenticated session role, binds the note and operation to `auth.uid()`, locks the note and checks its version. |
| `task_command(jsonb)` | Checks the signed-in owner and target links. App writes get an operation-only summary and a fixed task tool and app source. The existing MCP service wrapper binds the verified owner, tool and source. |
| `presets_command(jsonb)` | Uses the signed-in owner, preset version and reference checks. The MCP dispatcher retains its existing source attribution. |
| `notify_command(jsonb)` | Validates the owner, supported operations and target device or hold. It preserves the existing credential redaction. |
| `study_command_lifecycle(jsonb,uuid,uuid)` | Binds the supplied owner and operation ID, validates the legacy operation family, and enters the audited study command. Direct successful responses retain their original null action number. |
| `study_command_correction(jsonb,uuid,uuid)` | Validates the owner and operation ID before the audited study command checks target links, versions and correction data. |
| `lemma_study_timer_command(jsonb,uuid,uuid)` | Validates the owner and operation ID before the audited dispatcher enforces active leases, timer versions and device tokens. |

The first four functions retain their names, argument names, return types, empty search paths and existing EXECUTE access. Their owner is a non-login role subject to RLS. It inherits ordinary authenticated permissions and receives INSERT on only the four legacy receipt fields. The task RPC adds the journal attribution described above. The other three keep their original bodies. The migration checks that this role cannot stamp the provenance field, create objects in public or write the ledger as a table owner. The three study implementations move to a private schema accessible to the existing trusted dispatcher. Direct calls and MCP calls retain their public signatures.

Both table and column grants are revoked for PUBLIC, anon and authenticated. The migration stops if inherited rights or a role the client can switch into still permit writes. The original policies and historical migrations stay in place. Direct owner receipt reads continue to work. The export still takes its tables from the undo registry. The service-role account purge removes both receipt formats for the deleted owner.

### Deployment and rollback

This change needs the repository's separate Owner/priority `rules:` path, independent review, and an owner merge. The configured database major version is 17. Per-membership INHERIT and SET options need PostgreSQL 16 or later. The migration runner must own the affected functions and ledger, have permission to create a non-login role and have ADMIN OPTION on the authenticated role. The guard checks the private dispatch role and client grants within the migration transaction.

The cutover version follows every historical migration that grants browser DML or defines the seven legacy writers. The N191 migrations can be installed before or after it. Prior to the cutover, the N191 receipt helper rejects writes. After both pieces are installed, the independent product release switch still controls feature availability. Future additions to the ledger must preserve the ACL invariant.

If a migration transaction fails, PostgreSQL restores the previous function definitions, ACLs and column state. Once the migration commits, roll back the product using the release switch and the existing application commands. Keep the receipt ACL and provenance column in place so stored results remain readable and retries work on both sides of the release. A database correction after deployment follows the repository's forward-migration process.

### Rehearsal

Run `node tests/mcp/sql/owner-command-receipt-cutover.mjs` for the in-memory check. With the repository's `NOTIF_TEST_DATABASE_URL` set to the disposable loopback `lemma_test` PostgreSQL service, the same script creates a uniquely named database and uses separate non-superuser roles for the historical schema owner and the cutover installer. It applies the migration chain, seeds a legacy account, exercises transaction rollback, rejects a pre-existing marker and both inherited and switchable client grants, upgrades the same account and checks all seven entry points, RLS, timer leases, command replay, owner export and service-role purge. With N191 installed it also exercises the real trusted writer and both mixed-format collision directions.

The original N10 CRUD and duplicate-key assertions run against the pre-cutover schema in `tests/mcp/sql/study-schema.mjs`. The test then applies the remaining migration chain and checks the stronger browser grant boundary. Both scripts run through the existing SQL test discovery.
