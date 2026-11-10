import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { GrpcError } from './grpc-error.interface';
import { isGrpcError } from './grpc-error.utils';
import { HTTP_BY_GRPC } from './grpc-to-http.constants';

@Catch()
export class GrpcToHttpFilter implements ExceptionFilter {
  private readonly logger = new Logger(GrpcToHttpFilter.name);

  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    // Errors raised by Nest itself on the HTTP side (bad JSON, unknown route) keep their own status.
    if (err instanceof HttpException) {
      res.status(err.getStatus()).json(err.getResponse());
      return;
    }

    const httpStatus = (isGrpcError(err) && HTTP_BY_GRPC[err.code]) || 500;
    if (httpStatus >= 500) {
      // Log the details, but never leak internal error messages (SQL, stack traces) to the client.
      this.logger.error(err);
      res.status(httpStatus).json({ statusCode: httpStatus, message: 'internal error' });
      return;
    }
    // 4xx: the service's message is meant for the caller ("hold is CAPTURED", "invoice not found").
    res.status(httpStatus).json({ statusCode: httpStatus, message: (err as GrpcError).details });
  }
}
