import { ConsoleLogger, LogLevel } from '@nestjs/common';

/**
 * JSON-formatted logger for production (structured logs for log aggregators
 * like Datadog, CloudWatch, or Google Cloud Logging).
 * Falls back to the default NestJS ConsoleLogger in development.
 */
export class JsonLoggerService extends ConsoleLogger {
  protected override formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ): string {
    if (process.env['NODE_ENV'] !== 'production') {
      return super.formatMessage(
        logLevel,
        message,
        pidMessage,
        formattedLogLevel,
        contextMessage,
        timestampDiff,
      );
    }

    // Production: emit a single-line JSON object
    const entry = {
      timestamp: new Date().toISOString(),
      level: logLevel,
      context: this.context,
      message:
        typeof message === 'string' ? message : JSON.stringify(message),
    };
    return JSON.stringify(entry) + '\n';
  }
}
