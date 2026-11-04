import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Shape returned for every error response.
 *
 * `code` is a machine-readable SCREAMING_SNAKE_CASE identifier derived from
 * the HTTP status code when none is provided by the throwing code.
 * `details` carries class-validator messages forwarded by ValidationPipe.
 */
export interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Maps common HTTP status codes to a short machine-readable code.
 * Follows the pattern used throughout the design doc.
 */
const STATUS_CODE_MAP: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/**
 * Global exception filter for the TapSync API.
 *
 * Normalises every {@link HttpException} (and any unhandled unknown error)
 * into the documented response shape:
 * ```json
 * { "statusCode": 400, "code": "BAD_REQUEST", "message": "...", "details": [...] }
 * ```
 *
 * Unhandled / non-HTTP errors are treated as 500 INTERNAL_SERVER_ERROR and
 * the raw error is **never** surfaced to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let code: string;
    let message: string;
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = STATUS_CODE_MAP[statusCode] ?? 'HTTP_EXCEPTION';

      const raw = exception.getResponse();

      if (typeof raw === 'string') {
        message = raw;
      } else if (typeof raw === 'object' && raw !== null) {
        // NestJS ValidationPipe forwards:  { message: string | string[], error: string }
        const body = raw as Record<string, unknown>;
        const bodyMessage = body['message'];
        message =
          Array.isArray(bodyMessage)
            ? 'Validation failed'
            : (bodyMessage as string | undefined) ?? exception.message;

        // Preserve validation details array so clients can map errors to fields
        if (Array.isArray(bodyMessage)) {
          details = bodyMessage;
        } else if (body['details'] !== undefined) {
          details = body['details'];
        }

        // Allow throwing code to supply its own machine-readable code
        if (typeof body['code'] === 'string') {
          code = body['code'];
        }
      } else {
        message = exception.message;
      }
    } else {
      // Unhandled error – log it, return a generic 500
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_SERVER_ERROR';
      message = 'An unexpected error occurred';
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = { statusCode, code, message };
    if (details !== undefined) {
      body.details = details;
    }

    response.status(statusCode).json(body);
  }
}
