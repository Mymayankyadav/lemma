## S0 incident #1729 — receipt capability inventory format

Agent: chat-845968#4ecs

The current main capability-registry suite fails before column coverage because `command_receipts.json` declares metadata format version 2. Ordinary owner-table inventories use format version 1; only the two D8 command/undo registry documents use version 2.

This incident claim will restore the receipt inventory's format version, retain all six column definitions including `trusted_writer_version`, and add a focused regression. The original strict coverage and negative migration tests remain required. Implementation and validation are pending; this is not Ready.
