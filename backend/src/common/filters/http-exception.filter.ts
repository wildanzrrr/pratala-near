import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Every error leaves the API as JSON `{ statusCode, error, message? }`.
 * `error` is a short machine string (e.g. "ai_unavailable") when a handler
 * provided one, otherwise the human message. 5xx details are never leaked.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        const message = b.message;
        const flat = Array.isArray(message) ? message.join('; ') : message;
        const error =
          b.custom === true && typeof b.error === 'string'
            ? b.error
            : typeof flat === 'string'
              ? flat
              : exception.message;
        const out: Record<string, unknown> = { ...b, statusCode: status, error };
        delete out.custom;
        if (Array.isArray(message)) {
          out.issues = message;
          delete out.message;
        }
        if (out.message === error) delete out.message;
        res.status(status).json(out);
        return;
      }
      res.status(status).json({ statusCode: status, error: String(body) });
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: 'Service temporarily unavailable',
    });
  }
}

/** Throw an HttpException with a stable machine-readable `error` code. */
export function apiError(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
): HttpException {
  return new HttpException({ ...extra, error, custom: true }, status);
}
