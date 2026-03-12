import multer from 'multer';
import { Request, Router } from 'express';
import { prisma } from '../lib/prisma';

export const goodsReceiptsRouter = Router();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 8;

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

const toAttachmentContentUrl = (req: Request, attachmentId: string) => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host = req.get('host') || '';
  return `${proto}://${host}/api/goods-receipts/attachments/${attachmentId}/content`;
};

goodsReceiptsRouter.get('/attachments/:attachmentId/content', async (req, res, next) => {
  try {
    const attachmentId = String(req.params.attachmentId || '').trim();
    if (!attachmentId) {
      res.status(400).json({ message: 'Attachment ID is required.' });
      return;
    }

    const attachment = await prisma.goodsReceiptAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        fileData: true,
        mimeType: true,
        fileName: true,
        fileUrl: true,
      },
    });

    if (!attachment) {
      res.status(404).json({ message: 'Attachment not found.' });
      return;
    }

    if (!attachment.fileData) {
      if (attachment.fileUrl) {
        res.redirect(attachment.fileUrl);
        return;
      }
      res.status(404).json({ message: 'Attachment file data not found.' });
      return;
    }

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (attachment.fileName) {
      const safeFileName = encodeURIComponent(attachment.fileName);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeFileName}`);
    }
    res.send(Buffer.from(attachment.fileData));
  } catch (error) {
    next(error);
  }
});

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

      const uploadedByUserId = typeof req.headers['x-user-id'] === 'string'
        ? req.headers['x-user-id']
        : undefined;

      const created = await Promise.all(
        files.map(async (file) => {
          const createdAttachment = await prisma.goodsReceiptAttachment.create({
            data: {
              goodsReceiptId,
              fileUrl: 'pending',
              fileName: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              fileData: new Uint8Array(file.buffer),
              uploadedByUserId,
            },
          });

          const url = toAttachmentContentUrl(req, createdAttachment.id);
          return prisma.goodsReceiptAttachment.update({
            where: { id: createdAttachment.id },
            data: { fileUrl: url },
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
