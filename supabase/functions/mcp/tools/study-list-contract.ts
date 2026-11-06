/** N15 real wire-contract check: invoked on the serialized MCP tools/list response. */
export function assertStudyReadListContract(tools: unknown): void {
  if (!Array.isArray(tools)) throw new Error('MCP tools/list is missing');
  for (const [name, selector] of [['get', 'what'], ['search', 'resource']] as const) {
    const tool = tools.find((x: unknown) => x != null && typeof x === 'object' &&
      (x as {name?: unknown}).name === name);
    const properties = tool?.inputSchema?.properties as Record<string, unknown> | undefined;
    const values = (properties?.[selector] as {enum?: unknown} | undefined)?.enum;
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
