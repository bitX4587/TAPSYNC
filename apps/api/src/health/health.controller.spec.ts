import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionStates } from 'mongoose';

import { HealthController } from './health.controller.js';

/**
 * Minimal stub that mirrors the subset of mongoose Connection used by
 * HealthController (readyState only).
 */
function makeConnection(readyState: number) {
  return { readyState };
}

describe('HealthController', () => {
  async function buildController(readyState: number) {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getConnectionToken(),
          useValue: makeConnection(readyState),
        },
      ],
    }).compile();

    return module.get<HealthController>(HealthController);
  }

  it('returns db: connected when Mongoose is connected', async () => {
    const controller = await buildController(ConnectionStates.connected);
    expect(controller.check()).toEqual({ status: 'ok', db: 'connected' });
  });

  it('returns db: disconnected when Mongoose is disconnected', async () => {
    const controller = await buildController(ConnectionStates.disconnected);
    expect(controller.check()).toEqual({ status: 'ok', db: 'disconnected' });
  });

  it('returns db: disconnected when Mongoose is still connecting', async () => {
    const controller = await buildController(ConnectionStates.connecting);
    expect(controller.check()).toEqual({ status: 'ok', db: 'disconnected' });
  });

  it('always returns status: ok regardless of db state', async () => {
    for (const state of [
      ConnectionStates.connected,
      ConnectionStates.disconnected,
      ConnectionStates.connecting,
      ConnectionStates.disconnecting,
    ]) {
      const controller = await buildController(state);
      expect(controller.check().status).toBe('ok');
    }
  });
});
