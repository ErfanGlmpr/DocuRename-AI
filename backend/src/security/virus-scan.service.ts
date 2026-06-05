import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

export interface VirusScanResult {
  clean: boolean;
  virusScanResult: string;
  skipped: boolean;
}

/**
 * VirusScanService – scans file buffers using a ClamAV daemon (clamd) over TCP.
 *
 * Protocol: clamd INSTREAM command
 *  1. Connect to clamd TCP socket
 *  2. Send "zINSTREAM\0"
 *  3. Stream data as [4-byte big-endian length][chunk] pairs
 *  4. Terminate with 4 zero bytes
 *  5. Read response: "stream: OK" or "stream: <VirusName> FOUND"
 *
 * Graceful degradation: if clamd is unreachable and VIRUS_SCAN_ENABLED=true,
 * the scan is skipped with a warning (does NOT hard-fail the document).
 */
@Injectable()
export class VirusScanService {
  private readonly logger = new Logger(VirusScanService.name);
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly port: number;
  private readonly connectTimeoutMs = 10_000;
  private readonly scanTimeoutMs = 60_000;
  private readonly chunkSize = 8192;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get<string>('VIRUS_SCAN_ENABLED') === 'true';
    this.host = this.configService.get<string>('CLAMAV_HOST') || 'localhost';
    this.port = parseInt(
      this.configService.get<string>('CLAMAV_PORT') || '3310',
      10,
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Scans the provided buffer. Returns a result object with:
   *  - clean: true if no threat found
   *  - virusScanResult: human-readable result string
   *  - skipped: true when the scan was bypassed (disabled or clamd unreachable)
   */
  async scan(buffer: Buffer): Promise<VirusScanResult> {
    if (!this.enabled) {
      return { clean: true, virusScanResult: 'SCAN_DISABLED', skipped: true };
    }

    try {
      return await this.performScan(buffer);
    } catch (err) {
      this.logger.warn(
        `ClamAV scan failed (${(err as Error).message}) — skipping scan and continuing`,
      );
      return { clean: true, virusScanResult: 'SCAN_ERROR', skipped: true };
    }
  }

  private performScan(buffer: Buffer): Promise<VirusScanResult> {
    return new Promise<VirusScanResult>((resolve, reject) => {
      const socket = new net.Socket();
      let rawResponse = '';
      let settled = false;

      const finish = (result: VirusScanResult | null, err?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
        else resolve(result!);
      };

      socket.setTimeout(this.connectTimeoutMs);

      socket.connect(this.port, this.host, () => {
        socket.setTimeout(this.scanTimeoutMs);

        // Send INSTREAM command (null-terminated)
        socket.write('zINSTREAM\0');

        // Send data in chunks prefixed with 4-byte big-endian length
        for (let offset = 0; offset < buffer.length; offset += this.chunkSize) {
          const chunk = buffer.subarray(offset, offset + this.chunkSize);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(chunk.length, 0);
          socket.write(len);
          socket.write(chunk);
        }

        // Terminate stream with a 4-byte zero
        socket.write(Buffer.alloc(4));
      });

      socket.on('data', (data: Buffer) => {
        rawResponse += data.toString('utf8');
        // clamd sends a newline or null after the result
        if (rawResponse.includes('\n') || rawResponse.includes('\0')) {
          const result = this.parseResponse(rawResponse);
          finish(result);
        }
      });

      socket.on('timeout', () => {
        finish(
          null,
          new Error(`ClamAV socket timeout (${this.scanTimeoutMs} ms)`),
        );
      });

      socket.on('error', (err: Error) => {
        finish(null, err);
      });

      socket.on('close', () => {
        if (!settled && rawResponse) {
          finish(this.parseResponse(rawResponse));
        } else if (!settled) {
          finish(null, new Error('ClamAV connection closed without response'));
        }
      });
    });
  }

  private parseResponse(raw: string): VirusScanResult {
    const cleaned = raw.trim().replace(/\0/g, '');
    // "stream: OK"  or  "stream: Eicar-Signature FOUND"
    if (cleaned.toLowerCase().includes('found')) {
      const parts = cleaned.split(':');
      const virusInfo = parts
        .slice(1)
        .join(':')
        .trim()
        .replace(/ FOUND$/i, '')
        .trim();
      this.logger.warn(`ClamAV detected threat: ${virusInfo}`);
      return {
        clean: false,
        virusScanResult: `INFECTED:${virusInfo}`,
        skipped: false,
      };
    }
    return { clean: true, virusScanResult: 'CLEAN', skipped: false };
  }
}
