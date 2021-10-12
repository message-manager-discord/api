import { Snowflake } from 'discord-api-types'

// set secrets with wrangler secret put {name}
export {}

declare global {
  // Secrets
  // Client Secret
  const clientSecret: string
  // Client Id
  const clientId: string
  // Staff Ids, string in the form "staff-1-id,staff-2-id" etc
  const staffIds: string
  // Private key used for signing this is a ECDSA prime256v1 key
  const privateSigningKey: string

  // Set in wrangler.toml

  // Workers KV namespace
  const AUTH_STORE: KVNamespace
  // Current environment
  const Environment: string
}
