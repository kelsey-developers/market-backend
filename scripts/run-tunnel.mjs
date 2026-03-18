#!/usr/bin/env node
/**
 * Start Cloudflare Tunnel for local backend.
 *
 * Modes:
 * - quick (default): rotating trycloudflare URL
 * - fixed: named tunnel with stable hostname (recommended)
 *
 * Usage:
 * - npm run tunnel            -> auto mode (fixed if CLOUDFLARED_TUNNEL_NAME exists, else quick)
 * - npm run tunnel:quick      -> force quick mode
 * - npm run tunnel:fixed      -> force fixed mode (requires CLOUDFLARED_TUNNEL_NAME)
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { platform } from 'os';

dotenv.config();

const port = Number(process.env.PORT || 4000);
const localUrl = process.env.CLOUDFLARED_TARGET_URL?.trim() || `http://127.0.0.1:${port}`;
const configuredMode = process.env.CLOUDFLARED_MODE?.trim().toLowerCase();
const tunnelName = process.env.CLOUDFLARED_TUNNEL_NAME?.trim() || '';
const configPath = process.env.CLOUDFLARED_CONFIG?.trim() || '';
const modeArg = (process.argv[2] || '').trim().toLowerCase();

const resolveCloudflaredBinary = () => {
  if (platform() !== 'win32') return 'cloudflared';

  const windowsCandidates = [
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  ];

  const found = windowsCandidates.find((filePath) => existsSync(filePath));
  return found || 'cloudflared';
};

const shouldUseFixedMode = () => {
  if (modeArg === 'fixed') return true;
  if (modeArg === 'quick') return false;
  if (configuredMode === 'fixed') return true;
  if (configuredMode === 'quick') return false;
  return Boolean(tunnelName);
};

const buildCloudflaredArgs = () => {
  if (!shouldUseFixedMode()) {
    return {
      mode: 'quick',
      args: ['tunnel', '--url', localUrl],
    };
  }

  if (!tunnelName) {
    console.error('Fixed mode requires CLOUDFLARED_TUNNEL_NAME in .env.');
    console.error('Example: CLOUDFLARED_TUNNEL_NAME=market-api');
    process.exit(1);
  }

  const args = ['tunnel'];
  if (configPath) {
    args.push('--config', configPath);
  }
  args.push('run', tunnelName);

  return {
    mode: 'fixed',
    args,
  };
};

const bin = resolveCloudflaredBinary();
const { mode, args } = buildCloudflaredArgs();

if (mode === 'fixed') {
  console.log(`Starting fixed Cloudflare tunnel: ${tunnelName}`);
} else {
  console.log(`Starting quick Cloudflare tunnel for ${localUrl}`);
}

const proc = spawn(bin, args, {
  stdio: 'inherit',
  shell: false,
});

proc.on('error', (err) => {
  console.error('Failed to start cloudflared:', err.message);
  if (platform() === 'win32') {
    console.error('Install with: winget install Cloudflare.cloudflared');
  }
  process.exit(1);
});

proc.on('exit', (code) => {
  process.exit(code ?? 0);
});
