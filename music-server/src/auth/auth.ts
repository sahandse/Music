import type { Request, Response, NextFunction } from 'express';
import { getUserByUsername } from '../db/queries';
import { decryptPassword, md5Hex } from './crypto';
import { sendError } from '../subsonic/response';

export interface SubsonicParams {
  u: string;
  p?: string;
  t?: string;
  s?: string;
  v: string;
  c: string;
  f?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      subsonicUser?: string;
      subsonicParams?: SubsonicParams;
    }
  }
}

function getParam(req: Request, name: string): string | undefined {
  const fromQuery = req.query[name];
  const fromBody = req.body ? req.body[name] : undefined;
  const v = fromQuery !== undefined ? fromQuery : fromBody;
  return typeof v === 'string' ? v : undefined;
}

export function subsonicAuth(req: Request, res: Response, next: NextFunction): void {
  const u = getParam(req, 'u');
  const p = getParam(req, 'p');
  const t = getParam(req, 't');
  const s = getParam(req, 's');
  const v = getParam(req, 'v') || '1.16.1';
  const c = getParam(req, 'c') || 'unknown';
  const f = getParam(req, 'f') || 'xml';

  if (!u || (!p && !(t && s))) {
    sendError(req, res, 10, 'Required parameter is missing');
    return;
  }

  const user = getUserByUsername.get(u);
  if (!user) {
    sendError(req, res, 40, 'Wrong username or password');
    return;
  }

  const plainPassword = decryptPassword(user.password);
  let ok = false;
  if (t && s) {
    ok = md5Hex(plainPassword + s) === t.toLowerCase();
  } else if (p) {
    const candidate = p.startsWith('enc:') ? Buffer.from(p.slice(4), 'hex').toString('utf8') : p;
    ok = candidate === plainPassword;
  }

  if (!ok) {
    sendError(req, res, 40, 'Wrong username or password');
    return;
  }

  req.subsonicUser = u;
  req.subsonicParams = { u, p, t, s, v, c, f };
  next();
}
