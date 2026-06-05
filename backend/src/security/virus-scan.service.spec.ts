import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VirusScanService } from './virus-scan.service';
import * as net from 'net';

describe('VirusScanService', () => {
  let service: VirusScanService;

  function createService(enabled: string) {
    return Test.createTestingModule({
      providers: [
        VirusScanService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'VIRUS_SCAN_ENABLED') return enabled;
              if (key === 'CLAMAV_HOST') return 'localhost';
              if (key === 'CLAMAV_PORT') return '3310';
              return undefined;
            },
          },
        },
      ],
    })
      .compile()
      .then((m) => m.get<VirusScanService>(VirusScanService));
  }

  describe('when VIRUS_SCAN_ENABLED=false', () => {
    beforeEach(async () => {
      service = await createService('false');
    });

    it('isEnabled returns false', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('scan returns skipped=true without connecting to clamd', async () => {
      const result = await service.scan(Buffer.from('test'));
      expect(result.clean).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.virusScanResult).toBe('SCAN_DISABLED');
    });
  });

  describe('when VIRUS_SCAN_ENABLED=true but clamd unreachable', () => {
    beforeEach(async () => {
      service = await createService('true');
    });

    it('scan degrades gracefully and returns skipped=true', async () => {
      const socketProto = net.Socket.prototype;
      const connectSpy = jest
        .spyOn(socketProto, 'connect')
        .mockImplementation(function (this: net.Socket) {
          process.nextTick(() => {
            this.emit(
              'error',
              new Error('connect ECONNREFUSED 127.0.0.1:3310'),
            );
          });
          return this;
        });

      try {
        const result = await service.scan(Buffer.from('pdf-content'));
        expect(result.clean).toBe(true);
        expect(result.skipped).toBe(true);
        expect(result.virusScanResult).toBe('SCAN_ERROR');
      } finally {
        connectSpy.mockRestore();
      }
    }, 15_000);
  });
});
