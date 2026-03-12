import { Request, Response } from 'express';

const DEFAULT_AUTH_SERVICE_BASE_URL = 'https://kelsey.idateph.com';
const REQUEST_TIMEOUT_MS = 12000;

export const getAuthServiceBaseUrl = (): string => (process.env.AUTH_SERVICE_API_URL || DEFAULT_AUTH_SERVICE_BASE_URL).trim();

const buildTargetUrl = (req: Request): string | null => {
  const baseUrl = getAuthServiceBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, '')}${req.originalUrl}`;
};

const getForwardHeaders = (req: Request): HeadersInit => {
  const headers: Record<string, string> = {
    accept: req.headers.accept || 'application/json',
  };

  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }

  if (req.headers['content-type']) {
    headers['content-type'] = String(req.headers['content-type']);
  } else {
    headers['content-type'] = 'application/json';
  }

  if (process.env.AUTH_SERVICE_API_TOKEN) {
    headers.authorization = process.env.AUTH_SERVICE_API_TOKEN;
  }

  return headers;
};

export const tryProxyAuthService = async (req: Request, res: Response): Promise<boolean> => {
  const targetUrl = buildTargetUrl(req);
  if (!targetUrl) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const method = req.method.toUpperCase();
    const canHaveBody = method !== 'GET' && method !== 'HEAD';
    const body = canHaveBody ? JSON.stringify(req.body ?? {}) : undefined;

    const upstream = await fetch(targetUrl, {
      method,
      headers: getForwardHeaders(req),
      body,
      signal: controller.signal,
    });

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    const payloadText = await upstream.text();

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.send(payloadText);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const checkAuthServiceHealth = async (): Promise<{
  ok: boolean;
  baseUrl: string;
  statusEndpoint: string;
  statusCode?: number;
  statusText?: string;
}> => {
  const baseUrl = getAuthServiceBaseUrl();
  const statusEndpoint = `${baseUrl.replace(/\/+$/, '')}/status`;
  if (!baseUrl) {
    return { ok: false, baseUrl, statusEndpoint };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(statusEndpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });

    return {
      ok: upstream.ok,
      baseUrl,
      statusEndpoint,
      statusCode: upstream.status,
      statusText: upstream.statusText,
    };
  } catch {
    return {
      ok: false,
      baseUrl,
      statusEndpoint,
    };
  } finally {
    clearTimeout(timer);
  }
};
