// The hosted Lemma database is in Mumbai. The smoke's many serial reads and
// writes should cross the runner-to-India link once per request, not once per SQL call.
const hostedOrigin = 'https://yemqnhnztlbyxmjxidis.supabase.co';

export function selftestRequest(endpoint, part, signal, inGitHubActions) {
  const target = new URL(endpoint + '/selftest?part=' + part);
  const headers = inGitHubActions && target.origin === hostedOrigin
    ? { 'x-region': 'ap-south-1' }
    : {};
  return new Request(target, { method: 'GET', headers, signal });
}
