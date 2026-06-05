import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AiProviderFactory } from '../ai/ai.factory';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export interface HealthCheckResult {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface DetailedHealthReport {
  status: 'ok' | 'degraded';
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    storage: HealthCheckResult;
    aiProvider: HealthCheckResult;
    queue: HealthCheckResult;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly aiFactory: AiProviderFactory,
    private readonly configService: ConfigService,
    @InjectQueue('document-processing') private readonly documentQueue: Queue,
  ) {}

  /** Fast liveness check — only database + redis. Used by load balancers. */
  async liveness(): Promise<Record<string, string>> {
    const [db, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    return {
      status: db.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      database: db.status,
      redis: redis.status,
      storage: 'unknown',
      aiProvider: 'unknown',
    };
  }

  /** Full dependency check — includes storage, AI provider, and queue. */
  async detailed(): Promise<DetailedHealthReport> {
    const [database, redis, storage, aiProvider, queue] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
      this.checkAiProvider(),
      this.checkQueue(),
    ]);

    const allUp = [database, redis, storage, aiProvider, queue].every(
      (c) => c.status === 'up',
    );

    return {
      status: allUp ? 'ok' : 'degraded',
      checks: { database, redis, storage, aiProvider, queue },
    };
  }

  // ── Individual checks ────────────────────────────────────────────────

  private async checkDatabase(): Promise<HealthCheckResult> {
    const t = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - t };
    } catch (err) {
      this.logger.warn(
        `Database health check failed: ${(err as Error).message}`,
      );
      return {
        status: 'down',
        latencyMs: Date.now() - t,
        error: (err as Error).message,
      };
    }
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    const t = Date.now();
    let redis: Redis | null = null;
    try {
      redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST') || 'localhost',
        port: parseInt(
          this.configService.get<string>('REDIS_PORT') || '6379',
          10,
        ),
        connectTimeout: 3000,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      await redis.connect();
      await redis.ping();
      return { status: 'up', latencyMs: Date.now() - t };
    } catch (err) {
      this.logger.warn(`Redis health check failed: ${(err as Error).message}`);
      return {
        status: 'down',
        latencyMs: Date.now() - t,
        error: (err as Error).message,
      };
    } finally {
      try {
        redis?.disconnect();
      } catch {
        /* swallow */
      }
    }
  }

  private async checkStorage(): Promise<HealthCheckResult> {
    const t = Date.now();
    try {
      await this.storage.healthCheck();
      return { status: 'up', latencyMs: Date.now() - t };
    } catch (err) {
      this.logger.warn(
        `Storage health check failed: ${(err as Error).message}`,
      );
      return {
        status: 'down',
        latencyMs: Date.now() - t,
        error: (err as Error).message,
      };
    }
  }

  private async checkAiProvider(): Promise<HealthCheckResult> {
    const t = Date.now();
    try {
      const provider = this.aiFactory.getProvider();
      if (!provider.healthCheck) {
        return {
          status: 'up',
          latencyMs: Date.now() - t,
          details: {
            provider: provider.name,
            model: provider.model,
            note: 'Provider does not support health check',
          },
        };
      }
      const result = await provider.healthCheck();
      return {
        status: result.ok ? 'up' : 'down',
        latencyMs: result.latencyMs ?? Date.now() - t,
        details: {
          provider: provider.name,
          model: provider.model,
          error: result.errorMessage,
        },
      };
    } catch (err) {
      this.logger.warn(
        `AI provider health check failed: ${(err as Error).message}`,
      );
      return {
        status: 'down',
        latencyMs: Date.now() - t,
        error: (err as Error).message,
      };
    }
  }

  private async checkQueue(): Promise<HealthCheckResult> {
    const t = Date.now();
    try {
      const [waiting, active, failed] = await Promise.all([
        this.documentQueue.getWaitingCount(),
        this.documentQueue.getActiveCount(),
        this.documentQueue.getFailedCount(),
      ]);
      return {
        status: 'up',
        latencyMs: Date.now() - t,
        details: { waiting, active, failed },
      };
    } catch (err) {
      this.logger.warn(`Queue health check failed: ${(err as Error).message}`);
      return {
        status: 'down',
        latencyMs: Date.now() - t,
        error: (err as Error).message,
      };
    }
  }
}
