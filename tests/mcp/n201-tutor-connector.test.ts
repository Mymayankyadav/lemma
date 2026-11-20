import assert from 'node:assert/strict'
import {createHash, createHmac, randomUUID} from 'node:crypto'
import {tutorConnectorGrantHash} from '../../supabase/functions/_shared/tutor-connector.ts'
import type {Context} from '../../supabase/functions/mcp/db.ts'
import {createMcpHandler} from '../../supabase/functions/mcp/deps.ts'
import {buildServer, TOOL_NAMES} from '../../supabase/functions/mcp/server.ts'
import {tutorConnector} from '../../supabase/functions/mcp/tutor-connector.ts'

Deno.test('ordinary connector discovers, reads, claims and returns a learner answer through get and study', async () => {
  const secret = '1'.repeat(48)
  const url = 'https://example.test/functions/v1/mcp/' + secret
  const turnId = randomUUID()
  const grantOperationId = randomUUID()
  const handoffId = turnId + '.' + grantOperationId
  const proof = createHmac('sha256', secret).update('lemma:tutor-connector:v1:' + turnId + ':' + grantOperationId).digest('hex')
  const verifier = createHash('sha256').update(proof).digest('hex')
  assert.equal(await tutorConnectorGrantHash(url, turnId.toUpperCase(), grantOperationId.toUpperCase()), verifier)
  assert.notEqual(await tutorConnectorGrantHash(url, turnId, randomUUID()), verifier)

  const claimId = randomUUID()
  const calls: unknown[] = []
  let active = true
  let nextId: string | null = null
  let firstPoll = Promise.withResolvers<void>()
  const db: Context['db'] = {
    from() { throw Error('The tutor route must not query generic tables.') },
    async rpc(fn, args) {
      assert.equal(fn, 'tutor_connector_command')
      assert.deepEqual(Object.keys(args!).sort(), ['p_command', 'p_connector_hash', 'p_grant_operation_id', 'p_owner'])
      assert.equal(args!.p_owner, c.userId)
      assert.equal(args!.p_connector_hash, createHash('sha256').update(secret).digest('hex'))
      const command = args!.p_command as Record<string, unknown> | null
      assert.equal(args!.p_grant_operation_id, command ? grantOperationId : null)
      calls.push(command)
      if (!active) return {data: null, error: {message: verifier}}
      if (!command) return {data: [{id: handoffId}], error: null}
      assert.equal(command.turnId, turnId)
      if (command.operation === 'get') return {
        data: {turnId, status: 'pending', version: 1, snapshot: {question: '17'}, previousTutorQuestion: 'What is the value?'}, error: null,
      }
      if (command.operation === 'next') {
        firstPoll.resolve()
        return {data: nextId ? {id: nextId} : null, error: null}
      }
      if (command.operation === 'claim') return {data: {claimId, generation: 1, version: 2}, error: null}
      return {data: {status: 'completed', version: 3}, error: null}
    },
  }
  const c = {userId: randomUUID(), db}
  async function request(method: string, params: object = {}, signal?: AbortSignal) {
    const req = new Request(url, {
      signal,
      method: 'POST',
      headers: {Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
    })
    const response = await createMcpHandler(() => buildServer(c, tutorConnector(c, secret, req.signal))).fetch(req)
    assert.equal(response.status, 200)
    const body = await response.text()
    assert.ok(!body.includes(secret) && !body.includes(proof) && !body.includes(verifier))
    return JSON.parse(body.startsWith('{') ? body : body.split('\n').find(x => x.startsWith('data:'))!.slice(5)).result
  }
  const call = (name: string, args: object, signal?: AbortSignal) => request('tools/call', {name, arguments: args}, signal)
  const parse = (output: {content: {text: string}[]}) => JSON.parse(output.content[0].text)
  const tools = await request('tools/list')
  assert.deepEqual(tools.tools.map((tool: {name:string}) => tool.name).sort(), [...TOOL_NAMES].sort())
  assert.ok(JSON.stringify(tools).length <= 15000)
  const discover = parse(await call('get', {what: 'tutor_turn'}))
  assert.deepEqual(discover.pending, [{id: handoffId}])
  const turn = parse(await call('get', {what: 'tutor_turn', id: handoffId}))
  assert.equal(turn.snapshot.question, '17')
  assert.equal(turn.previousTutorQuestion, 'What is the value?')
  assert.match(turn.instructions, /tutor_turns/)
  const envelope = {resource: 'tutor_turns', schemaVersion: 1, target: {id: handoffId}}
  const claimOp = randomUUID()
  const bad = await call('study', {command: {...envelope, operation: 'claim', operationId: claimOp, expectedVersion: 1,
    patch: {turnId: randomUUID()}}})
  assert.equal(bad.isError, true)
  assert.equal(calls.length, 2)
  const claim = parse(await call('study', {command: {...envelope, operation: 'claim', operationId: claimOp, expectedVersion: 1}}))
  const replyOp = randomUUID()
  const patch = {claimId: claim.claimId, generation: claim.generation, messageId: randomUUID(),
    body: 'Correct. Can you justify your choice in one step?'}
  const reply = parse(await call('study', {command: {...envelope, operation: 'reply', operationId: replyOp,
    expectedVersion: claim.version, patch}}))
  assert.equal(reply.status, 'completed')
  assert.deepEqual(calls, [null, {operation: 'get', turnId},
    {operation: 'claim', turnId, expectedVersion: 1, operationId: claimOp},
    {operation: 'reply', turnId, expectedVersion: 2, operationId: replyOp, ...patch}])

  assert.match(turn.instructions, /tutor_next/)
  const nextArgs = {what: 'tutor_next', id: handoffId}
  const waiting = call('get', nextArgs)
  await firstPoll.promise
  nextId = randomUUID() + '.' + randomUUID()
  assert.deepEqual(parse(await waiting), {id: nextId})
  assert.deepEqual(calls.slice(-2), [{operation: 'next', turnId}, {operation: 'next', turnId}])

  nextId = null
  firstPoll = Promise.withResolvers<void>()
  const cancel = new AbortController()
  const stopped = call('get', nextArgs, cancel.signal).catch(error => {
    if (!cancel.signal.aborted) throw error
  })
  await firstPoll.promise
  cancel.abort()
  const stoppedResult = await stopped
  if (stoppedResult) assert.deepEqual(parse(stoppedResult), {id: null})

  active = false
  assert.equal((await call('get', {what: 'tutor_turn', id: handoffId})).isError, true)
})
