import { Router } from 'itty-router'
import {
  authorize,
  finalRedirectURL,
  handleRedirect,
  logout,
  StoredUser,
} from './oauth2'
import { Snowflake } from 'discord-api-types/v9'
import { CustomStatusError, Unauthorized } from './errors'
import { getSecondsNow } from './utils'

const productionEnvironment = 'production'
interface allowedOriginType {
  origin: string
  wildcard?: boolean
}

let allowedOrigins: allowedOriginType[]

if (Environment === productionEnvironment) {
  allowedOrigins = [{origin:'https://message.anothercat.me'}]
} else {
  allowedOrigins = [
    {origin:'https://message.anothercat.me'},
    {origin:'https://staging--message.anothercat.me'},
    {origin: "musing-hugle-9b7494.netlify.app", wildcard: true}, // netlify preview deploys 
    {origin:'http://localhost:3000'},
  ]
}

const generateCORSHeaders = ({
  origin,
  methods,
  headers,
}: {
  origin: string | null
  methods: string[]
  headers: string[]
}) => {
  const foundOrigin = allowedOrigins.find((allowedOrigin) =>{
    if (!origin) {
      return false
    } else if (allowedOrigin.wildcard) {
      return origin.includes(allowedOrigin.origin)
    } else {
    return allowedOrigin.origin.includes(origin)}},
  )
  const returnedOrigin = foundOrigin ? foundOrigin.origin : allowedOrigins[0].origin
  return {
    'Access-Control-Allow-Headers':
      headers.length <= 1 ? headers.join('') : headers.join(', '),
    'Access-Control-Allow-Methods':
      methods.length <= 1 ? methods.join('') : methods.join(', '),
    'Access-Control-Allow-Origin': returnedOrigin,
    'Access-Control-Allow-Credentials': foundOrigin ? 'true' : 'false ',
    Vary: 'Origin',
  }
}
interface Context {
  user?: StoredUser
  userId?: Snowflake
}

const router = Router()

// withUser modifies original request, but returns nothing
const withUser = async (request: Request, context: Context): Promise<void> => {
  const authResult = await authorize(request, false)
  if (authResult.status) {
    context.user = authResult.user
    context.userId = authResult.user.user.id
  }
}

// requireUser optionally returns (early) if user not found on request
const requireUser = (request: Request, context: Context): Response | void => {
  if (!context.user || !context.userId) {
    throw new Unauthorized(request)
  }
}

router.get('/api/*', withUser, requireUser)

router.get('/auth/callback', async (request: Request): Promise<Response> => {
  const authorizedResponse = await handleRedirect(request)
  if (!authorizedResponse) {
    throw new Unauthorized(request)
  }
  authorizedResponse.headers = {
    ...authorizedResponse.headers,
  }
  const response = new Response('', {
    ...authorizedResponse,
  })
  return response
})

router.get('/auth/login', async (request: Request): Promise<Response> => {
  const authResult = await authorize(request, true)

  if (authResult.status) {
    return Response.redirect(finalRedirectURL)
  } else {
    return Response.redirect(authResult.redirectUrl)
  }
})

// user must will always be StoredUser because it's checked in requireUser
router.get(
  '/api/user',
  async (request: Request, context: Context): Promise<Response> => {

    return new Response(JSON.stringify(context.user!.user), {
      headers: {
        'Content-Type': 'application/json',
        ...generateCORSHeaders({
          origin: request.headers.get('Origin'),
          methods: ['GET'],
          headers: [],
        }),
      },
    })
  },
)
router.options('/api/user', async (request: Request): Promise<Response> => {
  return new Response('OK', {
    headers: generateCORSHeaders({
      origin: request.headers.get('Origin'),
      methods: ['GET'],
      headers: [],
    }),
  })
})

router.get('/auth/logout', (request: Request): Response => {
  const url = new URL(request.url)
  const headers = logout(request)
  return headers
    ? new Response(null, {
        headers: {...headers, ...generateCORSHeaders({
          origin: request.headers.get('Origin'),
          methods: ['GET'], // NOTE: Update this to all methods used here
          headers: [],
        })},
        status: 302,
      })
    : Response.redirect(url.origin)
})

router.all('*', () => new Response('Not Found.', { status: 404 }))

const errorHandler = (error: any): Response => {
  let headers: HeadersInit
  if (error instanceof CustomStatusError) {
    headers = generateCORSHeaders({
      origin: error.request.headers.get('Origin'),
      methods: ['GET'], // NOTE: Update this to all methods used here
      headers: [],
    })
  } else {
    headers = {}
  }
  return new Response(error.message || 'Server Error', {
    status: error.status || 500,
    headers,
  })
}
addEventListener('fetch', (event) => {
  event.respondWith(router.handle(event.request, {}).catch(errorHandler))
})
