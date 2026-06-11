import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import cookieParser from 'cookie-parser';

describe('Sensitive Data Exposure (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testEmail = `sensitive-test-${Date.now()}@example.com`;
  const testPassword = 'StrongPassword1!';
  let token: string;
  let documentId: string;

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

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword });

    const resBody = res.body as {
      accessToken: string;
      user: { id: string; organizationId: string };
    };
    token = resBody.accessToken;

    const doc = await prisma.document.create({
      data: {
        originalName: 'sensitive.pdf',
        storageKey: 'uploads/sensitive.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: 'mock-sha256-hash',
        status: 'COMPLETED',
        userId: resBody.user.id,
        organizationId: resBody.user.organizationId,
        redactedText: 'This is redacted text that should not be visible',
        piiTokenMapEncrypted: { token: 'map' },
      },
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('Document detail does not expose sensitive fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/documents/${documentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const doc = res.body as Record<string, unknown>;

    expect(doc).toBeDefined();
    expect(doc.id).toBe(documentId);
    expect(doc.originalName).toBe('sensitive.pdf');

    // Sensitive fields must be undefined
    expect(doc.redactedText).toBeUndefined();
    expect(doc.piiTokenMapEncrypted).toBeUndefined();
    expect(doc.storageKey).toBeUndefined();
    expect(doc.rawText).toBeUndefined();
  });

  it('Document list does not expose sensitive fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const docs = res.body as Record<string, unknown>[];
    const doc = docs.find((d) => d.id === documentId);

    expect(doc).toBeDefined();

    // List should also omit these fields
    expect(doc!.redactedText).toBeUndefined();
    expect(doc!.piiTokenMapEncrypted).toBeUndefined();
    expect(doc!.storageKey).toBeUndefined();
    expect(doc!.rawText).toBeUndefined();
  });
});
