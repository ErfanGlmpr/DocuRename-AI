import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import cookieParser from 'cookie-parser';

describe('Tenant Isolation and Authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testEmailA = `testA-${Date.now()}@example.com`;
  const testPasswordA = 'StrongPassword1!';
  let tokenA: string;
  let orgIdA: string;

  const testEmailB = `testB-${Date.now()}@example.com`;
  const testPasswordB = 'StrongPassword1!';
  let tokenB: string;

  let documentIdA: string;

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

    // 1. Create User A
    const resA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmailA, password: testPasswordA });
    const resABody = resA.body as {
      accessToken: string;
      user: { id: string; organizationId: string };
    };
    tokenA = resABody.accessToken;
    orgIdA = resABody.user.organizationId;
    const userIdA = resABody.user.id;

    // 2. Create User B
    const resB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmailB, password: testPasswordB });
    const resBBody = resB.body as { accessToken: string };
    tokenB = resBBody.accessToken;

    // 3. Create Document for User A manually
    const doc = await prisma.document.create({
      data: {
        originalName: 'secretA.pdf',
        storageKey: 'uploads/secretA.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: 'mock-sha256-hash',
        status: 'COMPLETED',
        userId: userIdA,
        organizationId: orgIdA,
      },
    });
    documentIdA = doc.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.document.deleteMany({
      where: { id: documentIdA },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [testEmailA, testEmailB] } },
    });
    await app.close();
  });

  it('Document list only returns current organization documents', async () => {
    // User A should see the document
    const resA = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const resABodyList = resA.body as { id: string }[];
    expect(resABodyList).toBeInstanceOf(Array);
    const foundByA = resABodyList.some((d) => d.id === documentIdA);
    expect(foundByA).toBe(true);

    // User B should NOT see User A's document
    const resB = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const resBBodyList = resB.body as { id: string }[];
    expect(resBBodyList).toBeInstanceOf(Array);
    const foundByB = resBBodyList.some((d) => d.id === documentIdA);
    expect(foundByB).toBe(false);
  });

  it('User cannot access another organization’s document details', async () => {
    await request(app.getHttpServer())
      .get(`/documents/${documentIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('Download is scoped', async () => {
    await request(app.getHttpServer())
      .get(`/documents/${documentIdA}/download`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('Retry is scoped', async () => {
    await request(app.getHttpServer())
      .post(`/documents/${documentIdA}/retry`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('Cancel is scoped', async () => {
    await request(app.getHttpServer())
      .post(`/documents/${documentIdA}/cancel`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('Evaluation listing is scoped', async () => {
    await request(app.getHttpServer())
      .get(`/documents/${documentIdA}/ai-evaluations`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('Running single evaluation is scoped', async () => {
    await request(app.getHttpServer())
      .post(`/documents/${documentIdA}/ai-evaluations`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        provider: 'ollama',
      })
      .expect(404);
  });
});
