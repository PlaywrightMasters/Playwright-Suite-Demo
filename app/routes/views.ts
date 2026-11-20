import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { readSessionToken, safeNextPath } from '../auth';
import { getSession } from '../store';

export const viewRouter = Router();

const VIEWS_DIR = path.join(__dirname, '..', 'views');

function view(name: string) {
  return (_req: Request, res: Response): void => {
    res.sendFile(path.join(VIEWS_DIR, `${name}.html`));
  };
}

/** Server-side guard: unauthenticated visitors are sent to sign in, then returned. */
function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (getSession(readSessionToken(req))) {
    next();
    return;
  }
  res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`);
}

viewRouter.get('/', (_req, res) => res.redirect(302, '/inventory'));

viewRouter.get('/login', (req, res) => {
  if (getSession(readSessionToken(req))) {
    res.redirect(302, safeNextPath(req.query['next']) ?? '/inventory');
    return;
  }
  view('login')(req, res);
});

viewRouter.get('/inventory', requireSession, view('inventory'));
viewRouter.get('/reports', requireSession, view('reports'));
viewRouter.get('/settings', requireSession, view('settings'));

viewRouter.use((_req, res) => {
  res.status(404).sendFile(path.join(VIEWS_DIR, 'not-found.html'));
});
