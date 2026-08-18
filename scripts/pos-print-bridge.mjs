import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const port = Number(process.env.POS_BRIDGE_PORT || 17333);
const expectedTokenHash = process.env.POS_BRIDGE_TOKEN_HASH || (process.env.POS_BRIDGE_TOKEN ? createHash('sha256').update(process.env.POS_BRIDGE_TOKEN).digest('hex') : '');
const allowedOrigins = new Set(['http://localhost:3000', 'https://ps-rice.vercel.app']);

function send(response, status, body, origin) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:3000', 'Access-Control-Allow-Headers': 'Content-Type, X-POS-Bridge-Token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
  response.end(JSON.stringify(body));
}

function printRaw(printer, bytes) {
  return new Promise((resolve, reject) => {
    const args = printer ? ['-d', printer, '-o', 'raw'] : ['-o', 'raw'];
    const process = spawn('lp', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let error = '';
    process.stderr.on('data', (chunk) => { error += chunk.toString(); });
    process.on('error', reject);
    process.on('close', (code) => code === 0 ? resolve() : reject(new Error(error || `lp exited with ${code}`)));
    process.stdin.end(bytes);
  });
}

createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (request.method === 'OPTIONS') return send(response, 204, {}, origin);
  if (request.socket.remoteAddress !== '127.0.0.1' && request.socket.remoteAddress !== '::1') return send(response, 403, { error: 'Local requests only' }, origin);
  const token = String(request.headers['x-pos-bridge-token'] || '');
  const tokenHash = token ? createHash('sha256').update(token).digest('hex') : '';
  if (!expectedTokenHash || tokenHash !== expectedTokenHash) return send(response, 401, { error: 'Invalid pairing token' }, origin);
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true, service: 'PS Rice Local Print Bridge' }, origin);

  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  try {
    if (request.method === 'POST' && request.url === '/drawer') {
      await printRaw(body.printer, Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]));
      return send(response, 200, { ok: true }, origin);
    }
    if (request.method === 'POST' && request.url === '/test-print') {
      const text = `PS RICE COMMERCE\nทดสอบเครื่องพิมพ์สำเร็จ\n${new Date().toLocaleString('th-TH')}\n\n\n`;
      await printRaw(body.printer, Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from(text, 'utf8'), Buffer.from([0x1d, 0x56, 0x01])]));
      return send(response, 200, { ok: true }, origin);
    }
    if (request.method === 'POST' && request.url === '/print') {
      const text = String(body.text || '');
      if (!text || text.length > 100000) return send(response, 400, { error: 'Invalid receipt payload' }, origin);
      await printRaw(body.printer, Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from(text, 'utf8'), Buffer.from([0x1d, 0x56, 0x01])]));
      return send(response, 200, { ok: true }, origin);
    }
    return send(response, 404, { error: 'Not found' }, origin);
  } catch (error) {
    return send(response, 500, { error: error instanceof Error ? error.message : 'Printer command failed' }, origin);
  }
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`PS Rice Local Print Bridge listening on http://127.0.0.1:${port}\n`);
});
