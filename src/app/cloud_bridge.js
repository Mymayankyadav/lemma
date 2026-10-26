/* Explicit account-scoped cloud transfer helpers. */
const LemmaCloudBridge = (() => {
  async function authorize() {
    const client = LemmaAccount.client;
    if (!client) throw new Error('Cloud client unavailable');
    const response = await client.auth.getUser();
    if (response.error || !response.data?.user) throw new Error('Sign in first');
    return { client, userId: response.data.user.id };
  }
  return { authorize };
})();
