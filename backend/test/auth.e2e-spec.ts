import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import cookieParser from 'cookie-parser';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'StrongPassword1!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    
    await app.init();
  });

  afterAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
    await app.close();
  });

  it('/auth/register (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: testEmail,
        name: 'E2E Test User',
        password: testPassword,
      })
      .expect(201);

    expect(response.body).toHaveProperty('accessToken');
    expect(response.body.user).toBeDefined();
    expect(response.body.user.email).toBe(testEmail);
    expect(response.body.user).not.toHaveProperty('passwordHash');

    // Check if user and org were created in DB
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { memberships: true },
    });

    expect(user).toBeDefined();
    expect(user?.memberships.length).toBeGreaterThan(0);
    expect(user?.memberships[0].role).toBe('OWNER');
  });

  it('/auth/login (POST) - Valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200); // login returns 200 OK

    expect(response.body).toHaveProperty('accessToken');
    expect(response.body.user).toBeDefined();
    expect(response.body.user.email).toBe(testEmail);
    
    // Refresh token should be in a cookie
    const setCookieHeader = response.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const hasRefreshTokenCookie = setCookieHeader.some((cookie: string) => cookie.includes('refresh_token'));
    expect(hasRefreshTokenCookie).toBeTruthy();
  });

  it('/auth/login (POST) - Invalid password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword!',
      })
      .expect(401);
  });

  it('/auth/me (GET) - Fails without token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .expect(401);
  });

  it('/auth/me (GET) - Succeeds with token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    const accessToken = loginResponse.body.accessToken;

    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toBeDefined();
    expect(response.body.email).toBe(testEmail);
    expect(response.body).not.toHaveProperty('passwordHash');
  });
});
