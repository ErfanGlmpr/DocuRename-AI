import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import cookieParser from 'cookie-parser';

import { StorageService } from '../src/storage/storage.service';

describe('Upload Validation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testEmail = `upload-test-${Date.now()}@example.com`;
  const testPassword = 'StrongPassword1!';
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({
        uploadBuffer: jest.fn().mockResolvedValue('mock-s3-key.pdf'),
        getPresignedDownloadUrl: jest
          .fn()
          .mockResolvedValue('https://mock-url.com/mock-s3-key.pdf'),
        deleteObject: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

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

    // Create User
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword });
    const resBody = res.body as { accessToken: string };
    token = resBody.accessToken;
  });

  afterAll(async () => {
    // Cleanup
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { memberships: true },
    });
    if (user && user.memberships.length > 0) {
      await prisma.document.deleteMany({
        where: { organizationId: user.memberships[0].organizationId },
      });
    }
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
    await app.close();
  });

  it('Accepts a valid PDF', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4\n%Valid mock PDF data');
    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', pdfBuffer, {
        filename: 'valid.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const resBody = res.body as { documents: any[] };
    expect(resBody.documents.length).toBe(1);
  });

  it('Rejects non-PDF by extension', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4\n%Valid mock PDF data');
    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', pdfBuffer, {
        filename: 'invalid.txt',
        contentType: 'application/pdf',
      })
      .expect(400);

    const resBody = res.body as { message: string[] };
    expect(resBody.message[0]).toContain('Invalid extension. Expected .pdf');
  });

  it('Rejects non-PDF by MIME type', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4\n%Valid mock PDF data');
    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', pdfBuffer, {
        filename: 'valid.pdf',
        contentType: 'text/plain',
      })
      .expect(400);

    const resBody = res.body as { message: string[] };
    expect(resBody.message[0]).toContain('Invalid MIME type');
  });

  it('Rejects bad magic bytes', async () => {
    const badBuffer = Buffer.from('No magic bytes here');
    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', badBuffer, {
        filename: 'bad-magic.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    const resBody = res.body as { message: string[] };
    expect(resBody.message[0]).toContain('Invalid file signature');
  });

  it('Rejects empty file', async () => {
    const emptyBuffer = Buffer.alloc(0);
    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', emptyBuffer, {
        filename: 'empty.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    const resBody = res.body as { message: string[] };
    expect(resBody.message[0]).toContain('File is empty');
  });

  it('Rejects missing files array completely', async () => {
    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const resBody = res.body as { message: string };
    expect(resBody.message).toContain('At least one file must be uploaded');
  });

  it('Rejects too many files', async () => {
    const req = request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`);

    // Default limit is 10
    const pdfBuffer = Buffer.from('%PDF-1.4\n%Valid mock PDF data');
    for (let i = 0; i < 11; i++) {
      req.attach('files', pdfBuffer, {
        filename: `file_${i}.pdf`,
        contentType: 'application/pdf',
      });
    }

    const res = await req.expect(400);
    const resBody = res.body as { message: string };
    expect(resBody.message).toContain('Exceeded maximum of 10 files');
  });

  it('Rejects oversized file', async () => {
    // MAX_UPLOAD_SIZE_MB is 25 by default. 26MB file should be rejected.
    // However, attaching a real 26MB buffer in an E2E test might take too much memory
    // and time, and might crash Supertest / Multer depending on configs.
    // Since we don't want to choke the test runner, we will temporarily override
    // the process.env.MAX_UPLOAD_SIZE_MB for this block, or just skip full payload.
    // Wait, the test runner is fine with 26MB.
    const bigBuffer = Buffer.alloc(26 * 1024 * 1024);
    bigBuffer.write('%PDF-1.4\n'); // Write magic bytes so it doesn't fail on signature first

    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', bigBuffer, {
        filename: 'big.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    const resBody = res.body as { message: string[] };
    const err = resBody.message.find((m) => m.includes('exceeds maximum size'));
    expect(err).toBeDefined();
  });

  it('Rejects oversized total upload', async () => {
    // MAX_TOTAL_UPLOAD_SIZE_MB is 100 by default.
    // 5 files of 22MB each = 110MB total.
    const bigBuffer = Buffer.alloc(22 * 1024 * 1024);
    bigBuffer.write('%PDF-1.4\n');

    const req = request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`);

    for (let i = 0; i < 5; i++) {
      req.attach('files', bigBuffer, {
        filename: `big_${i}.pdf`,
        contentType: 'application/pdf',
      });
    }

    const res = await req.expect(400);
    const resBody = res.body as { message: string[] };
    const err = resBody.message.find((m) =>
      m.includes('Total upload size exceeds'),
    );
    expect(err).toBeDefined();
  });
});
