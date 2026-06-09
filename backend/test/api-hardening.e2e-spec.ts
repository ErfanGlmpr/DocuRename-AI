import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('API Hardening (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Override env variables for testing metrics protection and rate limiting.
    process.env.METRICS_PUBLIC = 'false';
    // Small limit to easily trigger 429 Too Many Requests without spamming.
    process.env.RATE_LIMIT_MAX_REQUESTS = '3';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Exact same validation pipe setup as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    delete process.env.METRICS_PUBLIC;
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    await app.close();
  });

  it('Validation pipe rejects unknown fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `hacker-${Date.now()}@example.com`,
        password: 'StrongPassword1!',
        name: 'Hacker',
        role: 'ADMIN', // Unknown field, should trigger forbidNonWhitelisted
      })
      .expect(400);

    const resBody = res.body as { message: string[] };
    expect(resBody.message).toBeDefined();
    expect(resBody.message[0]).toContain('property role should not exist');
  });

  it('Unauthenticated protected route fails', async () => {
    // Attempt to hit a protected route without Authorization header
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('Metrics protection works when METRICS_PUBLIC=false', async () => {
    // Unauthenticated GET to /metrics should fail because METRICS_PUBLIC=false
    await request(app.getHttpServer()).get('/metrics').expect(401);
  });

  it('Rate limiter works', async () => {
    // We configured RATE_LIMIT_MAX_REQUESTS=3 for this test
    const req = request(app.getHttpServer());

    // 1st request - OK
    await req.get('/health').expect(200);
    // 2nd request - OK
    await req.get('/health').expect(200);
    // 3rd request - OK
    await req.get('/health').expect(200);
    // 4th request - RATE LIMITED
    await req.get('/health').expect(429);
  });
});
