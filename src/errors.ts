class CustomStatusError extends Error {
  status?: number
  constructor(message?: string, status?: number) {
    super(message)
    this.status = status
  }
}
class Unauthorized extends CustomStatusError {
  constructor(message?: string) {
    super(message || 'Unauthorized', 401)
  }
}
class Forbidden extends CustomStatusError {
  constructor(message?: string) {
    super(message || 'Unauthorized', 403)
  }
}

export { CustomStatusError, Unauthorized, Forbidden }
