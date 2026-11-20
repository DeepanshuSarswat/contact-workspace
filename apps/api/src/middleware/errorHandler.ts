import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@contacts/shared';
import { AppError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`,
    },
  };
  res.status(404).json(body);
};

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody;

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (isBodyParserError(err) && err.status < 500) {
    status = err.status;
    body = {
      error: {
        code: 'BAD_REQUEST',
        message:
          err.type === 'entity.parse.failed'
            ? 'Request body is not valid JSON'
            : err.type === 'entity.too.large'
              ? 'Request body is too large'
              : 'Invalid request body',
      },
    };
  } else {
    // log the details, but don't send them to the client
    req.log.error({ err }, 'Unhandled error');
    body = {
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    };
  }

  if (status < 500) req.log.info({ code: body.error.code }, body.error.message);
  res.status(status).json(body);
};
