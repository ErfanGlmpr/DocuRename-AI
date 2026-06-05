import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';

@ApiTags('observability')
@Controller('metrics')
export class MetricsController {
  private readonly enabled: boolean;

  constructor(
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {
    this.enabled =
      this.configService.get<string>('METRICS_ENABLED') !== 'false';
  }

  /**
   * GET /metrics
   *
   * Returns Prometheus text format metrics.
   * Disable by setting METRICS_ENABLED=false in production if you use
   * a dedicated metrics port or a push-based exporter instead.
   */
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary: 'Prometheus metrics endpoint',
    description:
      'Returns all application and Node.js runtime metrics in Prometheus text format. ' +
      'Disable with METRICS_ENABLED=false.',
  })
  async getMetrics(): Promise<string> {
    if (!this.enabled) {
      throw new NotFoundException('Metrics endpoint is disabled');
    }
    return this.metricsService.getMetrics();
  }
}
