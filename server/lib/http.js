import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data, init) {
  return NextResponse.json(data, init);
}

/**
 * Wrap a route handler: turn HttpErrors into JSON responses and hide unexpected errors
 */
export function route(handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message, code: error.code }, { status: error.status });
      }
      console.error('Unhandled error', error);
      return json({ error: 'Server error. Please try again.' }, { status: 500 });
    }
  };
}

/**
 * Parse a JSON body. Mutating requests must be JSON, which also blocks cross-site form posts.
 */
export async function readJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw new HttpError(415, 'Expected a JSON body');
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function str(value, { field, max = 500, required = false } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && !s) {
    throw new HttpError(400, `${field} is required`);
  }
  if (s.length > max) {
    throw new HttpError(400, `${field} is too long (max ${max} characters)`);
  }
  return s;
}

export function intId(value, field = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError(400, `Invalid ${field}`);
  }
  return n;
}
