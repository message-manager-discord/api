import { Snowflake } from "discord-api-types"

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
  // Staff Ids, string in the form "staff-1-id,staff-2-id" etc
  const staffIds: string
}
