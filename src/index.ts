import { Router } from 'itty-router'
import { authorize, handleRedirect, logout, StoredUser } from './oauth2'
import { Snowflake } from 'discord-api-types/v9'
import { Unauthorized } from './errors'

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
    throw new Unauthorized()
  }
}

router.get('/api/*', withUser, requireUser)

router.get('/auth/callback', async (request: Request): Promise<Response> => {
  const authorizedResponse = await handleRedirect(request)
  if (!authorizedResponse) {
    throw new Unauthorized()
  }
  const response = new Response('', {
    ...authorizedResponse,
  })
  return response
})

router.get('/auth/login', async (request: Request): Promise<Response> => {

  const authResult = await authorize(request, true)

  if (authResult.status) {
    return Response.redirect(baseURL)
  } else {
    return Response.redirect(authResult.redirectUrl)
  }
})
// user must will always be StoredUser because it's checked in requireUser
router.get(
  '/api/user',
  async (request: Request, context: Context): Promise<Response> => {

    return   new Response(JSON.stringify(context.user!.user), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
  },
)

router.get('/auth/logout', (request: Request): Response => {
  const url = new URL(request.url)
  const headers = logout(request)
  return headers
    ? new Response(null, {
        headers: headers,
      })
    : Response.redirect(url.origin)
})

router.all('*', () => new Response('Not Found.', { status: 404 }))

const errorHandler = (error: any): Response => {
  return new Response(error.message || 'Server Error', {
    status: error.status || 500,
  })
}
addEventListener('fetch', (event) => {
  event.respondWith(router.handle(event.request, {}).catch(errorHandler))
})
