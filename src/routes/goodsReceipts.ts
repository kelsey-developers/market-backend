import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { Request, Router } from 'express';
import { prisma } from '../lib/prisma';

export const goodsReceiptsRouter = Router();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 8;
const GOODS_RECEIPT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'goods-receipts');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES_PER_REQUEST,
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error('Unsupported file type. Only JPG, PNG, and WEBP are allowed.'));
      return;
    }
    callback(null, true);
  },
});

const extensionFromMimeType = (mimeType: string) => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

const toPublicUrl = (req: Request, filename: string) => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host = req.get('host') || '';
  const encoded = encodeURIComponent(filename).replace(/%2F/gi, '/');
  return `${proto}://${host}/uploads/goods-receipts/${encoded}`;
};

goodsReceiptsRouter.post(
  '/:id/attachments',
  upload.array('files', MAX_FILES_PER_REQUEST),
  async (req, res, next) => {
    try {
      const goodsReceiptId = String(req.params.id || '').trim();
      if (!goodsReceiptId) {
        res.status(400).json({ message: 'Goods receipt ID is required.' });
        return;
      }

      const receipt = await prisma.goodsReceipt.findUnique({
        where: { id: goodsReceiptId },
        select: { id: true },
      });

      if (!receipt) {
        res.status(404).json({ message: 'Goods receipt not found.' });
        return;
      }

      const files = (req.files as Express.Multer.File[]) ?? [];
      if (files.length === 0) {
        res.status(400).json({ message: 'At least one image file is required.' });
        return;
      }

      await fs.mkdir(GOODS_RECEIPT_UPLOAD_DIR, { recursive: true });

      const uploadedByUserId = typeof req.headers['x-user-id'] === 'string'
        ? req.headers['x-user-id']
        : undefined;

      const created = await Promise.all(
        files.map(async (file) => {
          const extension = extensionFromMimeType(file.mimetype);
          const filename = `${goodsReceiptId}-${Date.now()}-${randomUUID()}.${extension}`;
          const outputPath = path.join(GOODS_RECEIPT_UPLOAD_DIR, filename);
          await fs.writeFile(outputPath, file.buffer);

          return prisma.goodsReceiptAttachment.create({
            data: {
              goodsReceiptId,
              fileUrl: toPublicUrl(req, filename),
              fileName: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              uploadedByUserId,
            },
          });
        })
      );

      res.status(201).json({
        attachments: created.map((entry) => ({
          id: entry.id,
          url: entry.fileUrl,
          fileName: entry.fileName,
          mimeType: entry.mimeType,
          sizeBytes: entry.sizeBytes,
          createdAt: entry.createdAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);
