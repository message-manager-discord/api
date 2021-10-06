// set secrets with wrangler secret put {name}
export {}

declare global {
  // Client Secret
  const clientSecret: string
  // Client Id
  const clientId: string
  // Workers KV namespace
  const AUTH_STORE: KVNamespace
  // Current environment
  const Environment: string
}
