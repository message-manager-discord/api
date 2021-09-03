// set secrets with wrangler secret put {name}
export {}

declare global {
  // Client Secret
  const clientSecret: string
  // Client Id
  const clientId: string
  // Base URL (where the worker is deployed)
  const baseURL: string
  // Workers KV namespace
  const AUTH_STORE: KVNamespace
}
