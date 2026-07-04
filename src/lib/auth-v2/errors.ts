export class AuthenticationError extends Error {
  readonly status = 401
  readonly code: string

  constructor(code = 'unauthorized', message = 'Unauthorized') {
    super(message)
    this.name = 'AuthenticationError'
    this.code = code
  }
}

export class AuthorizationError extends Error {
  readonly status = 403
  readonly code: string

  constructor(code = 'forbidden', message = 'Forbidden') {
    super(message)
    this.name = 'AuthorizationError'
    this.code = code
  }
}
