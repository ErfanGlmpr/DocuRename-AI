import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /health
   *
   * Fast liveness probe (database + Redis only).
   * Suitable for load balancer health checks.
   */
  @Get()
  @ApiOperation({
    summary: 'Liveness health check',
    description:
      'Fast check — database and Redis only. Use for load balancer probes.',
  })
  async liveness() {
    return this.healthService.liveness();
  }

  /**
   * GET /health/detailed
   *
   * Full dependency check: PostgreSQL, Redis, MinIO, AI provider, Queue.
   */
  @Get('detailed')
  @ApiOperation({
    summary: 'Detailed health check',
    description:
      'Full check of all external dependencies. ' +
      'Returns latency and error details for each. Status 200 even when degraded.',
  })
  async detailed() {
    return this.healthService.detailed();
  }
}
