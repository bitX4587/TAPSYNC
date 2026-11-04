import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import {
  ErrorResponseBody,
  HttpExceptionFilter,
} from './http-exception.filter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHost(
  mockJson: jest.Mock,
  mockStatus: jest.Mock,
): {
  switchToHttp: () => {
    getResponse: () => { status: jest.Mock; json: jest.Mock };
    getRequest: () => { method: string; url: string };
  };
} {
  const res = {
    status: mockStatus.mockReturnThis(),
    json: mockJson,
  };
  const req = { method: 'GET', url: '/test' };
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnThis();
  });

  function capturedBody(): ErrorResponseBody {
    return mockJson.mock.calls[0][0] as ErrorResponseBody;
  }

  it('maps 400 BadRequestException to BAD_REQUEST', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    filter.catch(new BadRequestException('invalid input'), host);

    expect(mockStatus).toHaveBeenCalledWith(400);
    const body = capturedBody();
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.message).toBe('invalid input');
  });

  it('maps 401 UnauthorizedException to UNAUTHORIZED', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    filter.catch(new UnauthorizedException(), host);

    const body = capturedBody();
    expect(body.statusCode).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('maps 403 ForbiddenException to FORBIDDEN', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    filter.catch(new ForbiddenException(), host);

    const body = capturedBody();
    expect(body.statusCode).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('maps 404 NotFoundException to NOT_FOUND', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    filter.catch(new NotFoundException('user not found'), host);

    const body = capturedBody();
    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('user not found');
  });

  it('maps 409 ConflictException to CONFLICT', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    filter.catch(new ConflictException('email already in use'), host);

    const body = capturedBody();
    expect(body.statusCode).toBe(409);
    expect(body.code).toBe('CONFLICT');
    expect(body.message).toBe('email already in use');
  });

  it('extracts validation details when message is an array (ValidationPipe format)', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    const raw = {
      statusCode: 400,
      message: ['name should not be empty', 'url must be a URL'],
      error: 'Bad Request',
    };
    filter.catch(new BadRequestException(raw), host);

    const body = capturedBody();
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual([
      'name should not be empty',
      'url must be a URL',
    ]);
  });

  it('allows throwing code to supply a custom machine-readable code', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    filter.catch(
      new ConflictException({ code: 'CUSTOM_NAME_TAKEN', message: 'Name taken' }),
      host,
    );

    const body = capturedBody();
    expect(body.code).toBe('CUSTOM_NAME_TAKEN');
    expect(body.message).toBe('Name taken');
  });

  it('maps any unknown error to 500 INTERNAL_SERVER_ERROR without leaking details', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    filter.catch(new Error('db connection lost'), host);

    expect(mockStatus).toHaveBeenCalledWith(500);
    const body = capturedBody();
    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.message).toBe('An unexpected error occurred');
    // Must NOT expose the internal error message
    expect(body.message).not.toContain('db connection lost');
    expect(body.details).toBeUndefined();
  });

  it('does not include details key when there are no details', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    filter.catch(new NotFoundException('not found'), host);

    const body = capturedBody();
    expect(Object.keys(body)).not.toContain('details');
  });

  it('maps a generic HttpException with a string response body', () => {
    const host = makeHost(mockJson, mockStatus) as any;
    filter.catch(new HttpException('custom message', HttpStatus.I_AM_A_TEAPOT), host);

    const body = capturedBody();
    expect(body.statusCode).toBe(418);
    expect(body.message).toBe('custom message');
    // Falls back to 'HTTP_EXCEPTION' for unmapped codes
    expect(body.code).toBe('HTTP_EXCEPTION');
  });
});
