import type { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by `clientIdMiddleware`; non-empty trimmed `x-client-id` header. */
      clientId: string;
    }
  }
}

/** Every /api request must carry a non-empty `x-client-id` header. */
export function clientIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.get('x-client-id');
  const clientId = typeof raw === 'string' ? raw.trim() : '';
  if (!clientId) {
    res.status(400).json({ error: 'missing-client-id' });
    return;
  }
  req.clientId = clientId;
  next();
}
