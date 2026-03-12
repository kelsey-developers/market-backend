#!/usr/bin/env node
/**
 * Start Cloudflare Tunnel to expose local backend (port 4000).
 * Uses full path on Windows when cloudflared is not in PATH.
 */

import { spawn } from 'child_process';
import { platform } from 'os';

const PORT = 4000;
const URL = `http://127.0.0.1:${PORT}`;

const winPath = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const bin = platform() === 'win32' ? winPath : 'cloudflared';
const args = ['tunnel', '--url', URL];

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
