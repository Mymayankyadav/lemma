/** Incident #1179: N37 widened the selector to `enum.or(<registered resource pattern>)`, which zod serializes as
 *  `anyOf: [{enum}, {pattern}]`. The study resources must still be advertised in an enum branch. */
function enumValues(node: unknown): unknown[] | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as {enum?: unknown; anyOf?: unknown; oneOf?: unknown};
  if (Array.isArray(n.enum)) return n.enum;
  const branches = [...(Array.isArray(n.anyOf) ? n.anyOf : []), ...(Array.isArray(n.oneOf) ? n.oneOf : [])];
  const found = branches.flatMap((b) => enumValues(b) ?? []);
  return found.length ? found : undefined;
}

/** N15 real wire-contract check: invoked on the serialized MCP tools/list response. */
export function assertStudyReadListContract(tools: unknown): void {
  if (!Array.isArray(tools)) throw new Error('MCP tools/list is missing');
  for (const [name, selector] of [['get', 'what'], ['search', 'resource']] as const) {
    const tool = tools.find((x: unknown) => x != null && typeof x === 'object' &&
      (x as {name?: unknown}).name === name);
    const properties = tool?.inputSchema?.properties as Record<string, unknown> | undefined;
    const values = enumValues(properties?.[selector]);
    if (!Array.isArray(values) || !['study_entries','calendar_blocks'].every(x => values.includes(x))) {
      throw new Error('N15 study resources missing from serialized '+name+' tool');
    }
    for (const field of ['start','end','cursor']) {
      if (!properties || !(field in properties)) {
        throw new Error('N15 '+field+' missing from serialized '+name+' tool');
      }
    }
  }
}
