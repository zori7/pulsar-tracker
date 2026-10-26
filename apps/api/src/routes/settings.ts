import { Router } from 'express';
import type { Request } from 'express';
import type { DB } from '../db/index.js';
import { ensureSettingsRow, settingsFromRow, updateSettingsRow } from '../db/settings.js';
import { DEFAULT_DIGEST_TIME, type Env } from '../env.js';
import { settingsPatchSchema, zodDetails } from '../validation/schemas.js';

export function settingsRouter(db: DB, env: Env): Router {
  const router = Router();

  const defaults = {
    topic: env.ntfyDefaultTopic,
    server: env.ntfyServer,
    digestTime: DEFAULT_DIGEST_TIME,
  };

  // GET /api/settings — auto-provisions defaults on first call.
  router.get('/', (req: Request, res) => {
    const row = ensureSettingsRow(db, req.clientId, defaults);
    res.json({ settings: settingsFromRow(row) });
  });

  // PUT /api/settings — partial updates allowed.
  router.put('/', (req: Request, res) => {
    const parsed = settingsPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation', details: zodDetails(parsed.error) });
      return;
    }
    ensureSettingsRow(db, req.clientId, defaults);
    const row = updateSettingsRow(db, req.clientId, parsed.data);
    res.json({ settings: settingsFromRow(row) });
  });

  return router;
}
