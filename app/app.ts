import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { apiRouter } from './routes/api';
import { viewRouter } from './routes/views';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, 'public'), { index: false }));
  app.use('/api', apiRouter);
  app.use('/', viewRouter);

  // Malformed JSON and other unexpected errors return a JSON body, never a stack trace.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 500;
    const messages: Record<number, string> = {
      400: 'Malformed JSON body',
      413: 'Request body too large',
    };
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: messages[status] ?? (status >= 500 ? 'Something went wrong' : 'Bad request'),
    });
  });

  return app;
}
