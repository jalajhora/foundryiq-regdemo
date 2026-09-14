import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assess from './api/assess.js';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const maxBodyBytes = 6 * 1024 * 1024; // Includes base64 overhead on the client's 4 MiB payload cap.

createServer(async (req, res) => {
  // Keep the existing Vercel-compatible assessment handler usable on both hosts.
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/assess') {
      if (req.method === 'POST') {
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
          return res.status(415).json({ error: 'Expected application/json' });
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxBodyBytes) return res.status(413).json({ error: 'Request exceeds 6 MiB. Reduce the uploaded documents.' });
          chunks.push(chunk);
        }
        try { req.body = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { return res.status(400).json({ error: 'Invalid JSON' }); }
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
            (req.body.files !== undefined && (!Array.isArray(req.body.files) || req.body.files.some((file) => !file || typeof file !== 'object' || Array.isArray(file))))) {
          return res.status(400).json({ error: 'Expected an object with a files array of document objects' });
        }
      }
      return await assess(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
    const file = resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(dist + sep)) return res.status(404).json({ error: 'Not found' });
    const body = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (res.destroyed || res.writableEnded) return;
    const status = error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) ? 404 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 404 ? 'Not found' : status === 400 ? 'Invalid URL' : 'Server error' });
  }
}).listen(Number(process.env.PORT) || 8080, '0.0.0.0', () => {
  console.log(`Listening on 0.0.0.0:${process.env.PORT || 8080}`);
});
