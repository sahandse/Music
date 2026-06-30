import type { Request, Response } from 'express';
import { config } from '../config';

type Json = Record<string, any>;

function xmlEscape(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildXml(tag: string, node: Json): string {
  const attrs: string[] = [];
  const childrenXml: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') childrenXml.push(buildXml(key, item));
        else childrenXml.push(`<${key}>${xmlEscape(String(item))}</${key}>`);
      }
    } else if (typeof value === 'object') {
      childrenXml.push(buildXml(key, value));
    } else {
      attrs.push(`${key}="${xmlEscape(String(value))}"`);
    }
  }
  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  if (!childrenXml.length) return `<${tag}${attrStr}/>`;
  return `<${tag}${attrStr}>${childrenXml.join('')}</${tag}>`;
}

export function sendSubsonicResponse(
  req: Request,
  res: Response,
  payload: Json = {},
  status: 'ok' | 'failed' = 'ok'
): void {
  const f = String(req.subsonicParams?.f || req.query.f || 'xml').toLowerCase();
  const body: Json = {
    status,
    version: config.apiVersion,
    type: 'personal-music-server',
    serverVersion: '1.0.0',
    ...payload,
  };
  if (f === 'json') {
    res.json({ 'subsonic-response': body });
  } else {
    res
      .type('application/xml')
      .send(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          buildXml('subsonic-response', { ...body, xmlns: 'http://subsonic.org/restapi' })
      );
  }
}

export function sendError(req: Request, res: Response, code: number, message: string): void {
  sendSubsonicResponse(req, res, { error: { code, message } }, 'failed');
}
