import { DISCORD_BASE } from './consts'
import {
  RESTPostOAuth2AccessTokenResult,
  RESTGetAPICurrentUserResult,
  RESTPostOAuth2RefreshTokenResult,
} from 'discord-api-types/v9'
import cookie from 'cookie'
import { getSecondsNow } from './utils'
import { Unauthorized } from './errors'

export let finalRedirectURL: string
export let baseURL: string

switch (Environment) {
  case 'dev':
    finalRedirectURL = 'http://localhost:3000'
    baseURL = 'http://localhost:8787'
    break
  case 'staging':
    finalRedirectURL = 'https://staging--message.anothercat.me'
    baseURL = 'https://auth--staging--message.anothercat.me'
    break
  default:
    finalRedirectURL = 'https://message.anothercat.me'
    baseURL = 'https://auth--message.anothercat.me'
    break
}

const discordOauth = {
  domain: `${DISCORD_BASE}/oauth2`,
  clientId: clientId,
  clientSecret: clientSecret,
  callbackUrl: `${baseURL}/auth/callback`,
}

const cookieKey = 'mm-s-id'

interface StoredAuthToken {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

interface SuccessResult {
  status: true
  user: StoredUser
}
interface FailedResult {
  status: false
  redirectUrl: string
}

export interface StoredUser {
  user: RESTGetAPICurrentUserResult
  auth: StoredAuthToken
}

const redirectUrl = (state: string) =>
  `${discordOauth.domain}/authorize?response_type=code&client_id=${
    discordOauth.clientId
  }&redirect_uri=${
    discordOauth.callbackUrl
  }&scope=identify&state=${encodeURIComponent(state)}`

const generateStateParam = async (): Promise<string> => {
  const resp = await fetch('https://csprng.xyz/v1/api')
  const { Data: state } = await resp.json()
  await AUTH_STORE.put(`state-${state}`, 'true', { expirationTtl: 86400 })
  return state
}

const verify = async (request: Request): Promise<StoredUser> => {
  const cookieHeader = request.headers.get('Cookie')
  if (cookieHeader && cookieHeader.includes(cookieKey)) {
    const cookies = cookie.parse(cookieHeader)
    if (!cookies[cookieKey]) throw new Unauthorized(request)
    const session = cookies[cookieKey]

    const kvData = await AUTH_STORE.get(`session-${session}`)
    if (!kvData) {
      throw new Unauthorized(request)
    }
    const userData = await AUTH_STORE.get(kvData)
    let parsedUserData: StoredUser
    if (userData) {
      try {
        parsedUserData = JSON.parse(userData) as StoredUser
      } catch (error) {
        throw new Error('Unable to parse auth information from Workers KV-1')
      }
      parsedUserData.auth = await checkTokenExpiry(parsedUserData)
      return parsedUserData
    } else {
      throw new Unauthorized(request)
    }
  }
  throw new Unauthorized(request)
}

export const authorize = async (
  request: Request,
  handleFail: boolean,
): Promise<SuccessResult | FailedResult> => {
  if (handleFail) {
    try {
      const user = await verify(request)
      return {
        status: true,
        user: user,
      }
    } catch (error) {
      if (error instanceof Unauthorized) {
        const state = await generateStateParam()
        return {
          status: false,
          redirectUrl: redirectUrl(state),
        }
      } else {
        throw error
      }
    }
  } else {
    return {
      status: true,
      user: await verify(request),
    }
  }
}

const persistAuth = async (body: StoredAuthToken): Promise<ResponseInit> => {
  const user = await identifyUser(body.accessToken)

  const toStore = {
    auth: body,
    user: user,
  }
  await AUTH_STORE.put(user.id, JSON.stringify(toStore))

  // This will be the session cookie
  const resp = await fetch('https://csprng.xyz/v1/api')
  const { Data: session } = await resp.json()
  // Sessions last for 1 month (lets face it this is a fairly low security required app)
  await AUTH_STORE.put(`session-${session}`, user.id, {
    expirationTtl: 2678400,
  })

  const date = new Date()
  date.setDate(date.getDate() + 31)

  const headers = {
    Location: finalRedirectURL,
    'Set-cookie': `${cookieKey}=${session}; Secure; HttpOnly; SameSite=Lax; Path=/; Expires=${date.toUTCString()}`,
  }

  return { headers, status: 302 }
}

const checkTokenExpiry = async (
  userData: StoredUser,
): Promise<StoredAuthToken> => {
  const secondsNow = getSecondsNow()
  if (secondsNow < userData.auth.expiresAt) {
    return userData.auth
  } else {
    const newAuthData = await refreshToken(userData.auth.refreshToken)
    const toStore = {
      auth: newAuthData,
      user: userData.user,
    }
    await AUTH_STORE.put(userData.user.id, JSON.stringify(toStore))
    return newAuthData
  }
}

const refreshToken = async (refreshToken: string): Promise<StoredAuthToken> => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: discordOauth.clientId,
    client_secret: discordOauth.clientSecret,
    refresh_token: refreshToken,
  })

  const resp = await fetch(`${discordOauth.domain}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!resp.ok) {
    throw new Error(resp.statusText)
  }
  const tokenData = (await resp.json()) as RESTPostOAuth2RefreshTokenResult
  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: getSecondsNow() + tokenData.expires_in - 10, // 10 seconds to account for any possible latency
  }
}

const exchangeCode = async (code: string): Promise<StoredAuthToken> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: discordOauth.clientId,
    client_secret: discordOauth.clientSecret,
    code,
    redirect_uri: discordOauth.callbackUrl,
  })

  const resp = await fetch(`${discordOauth.domain}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!resp.ok) {
    throw new Error(resp.statusText)
  }
  const tokenData = (await resp.json()) as RESTPostOAuth2AccessTokenResult
  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: getSecondsNow() + tokenData.expires_in - 20, // 20 seconds to account for any possible latency
  }
}

const identifyUser = async (
  accessToken: string,
): Promise<RESTGetAPICurrentUserResult> => {
  const resp = await fetch(`${DISCORD_BASE}/users/@me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!resp.ok) {
    throw new Error(resp.statusText)
  }
  return (await resp.json()) as RESTGetAPICurrentUserResult
}

export const handleRedirect = async (
  request: Request,
): Promise<null | ResponseInit> => {
  const url = new URL(request.url)
  const state = url.searchParams.get('state')
  if (!state) {
    return null
  }

  const storedState = await AUTH_STORE.get(`state-${state}`)
  if (!storedState) {
    return null
  }

  const code = url.searchParams.get('code')
  if (code) {
    const exchangeData = await exchangeCode(code)
    return await persistAuth(exchangeData)
  }
  return null
}

export const logout = (request: Request): Record<string, string> => {
  const cookieHeader = request.headers.get('Cookie')
  if (cookieHeader && cookieHeader.includes(cookieKey)) {
    return {
      'Set-cookie': `${cookieKey}=""; SameSite=Lax; Path=/; Secure;`,
    }
  }
  return {}
}
