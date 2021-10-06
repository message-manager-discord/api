class CustomStatusError extends Error {
  status?: number
  request: Request
  constructor(request: Request, message?: string, status?: number) {
    super(message)
    this.status = status
    this.request = request
  }
}
class Unauthorized extends CustomStatusError {
  constructor(request: Request, message?: string) {
    super(request, message || 'Unauthorized', 401)
  }
}
class Forbidden extends CustomStatusError {
  constructor(request: Request, message?: string) {
    super(request, message || 'Unauthorized', 403)
  }
}

export { CustomStatusError, Unauthorized, Forbidden }
