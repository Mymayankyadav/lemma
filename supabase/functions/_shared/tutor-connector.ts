const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const encoder = new TextEncoder()

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function tutorGrantHash(bearer: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(bearer)))
}

/** Bind an ordinary connector to the exact turn the learner authorized. The
 * grant operation ID makes a replacement grant distinct from a revoked one. */
export async function tutorConnectorGrantHash(connectorUrl: string, turnId: string, operationId: string): Promise<string> {
  const url = new URL(connectorUrl)
  const secret = /\/mcp\/([a-f0-9]{48})$/.exec(url.pathname)?.[1]
  if (!secret || !['https:', 'http:'].includes(url.protocol) || !uuid.test(turnId) || !uuid.test(operationId)) {
    throw new Error('Invalid tutor connector handoff')
  }
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(
    'lemma:tutor-connector:v1:' + turnId.toLowerCase() + ':' + operationId.toLowerCase(),
  ))
  return tutorGrantHash(hex(signed))
}

export function tutorHandoffIds(id: unknown): {turnId: string; grantOperationId: string} {
  if (typeof id === 'string') {
    const [turnId, grantOperationId, extra] = id.split('.')
    if (extra === undefined && uuid.test(turnId) && uuid.test(grantOperationId ?? '')) {
      return {turnId: turnId.toLowerCase(), grantOperationId: grantOperationId.toLowerCase()}
    }
  }
  throw new Error('Use the tutor handoff ID from Lemma.')
}
