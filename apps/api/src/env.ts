export interface Env {
  port: number;
  databasePath: string;
  redisUrl: string;
  ntfyMode: 'http' | 'cli';
  ntfyServer: string;
  ntfyDefaultTopic: string;
  ntfyBin: string;
  /** Public base URL of the web app (e.g. http://homebox:8700) — the base for
   *  notification deep links (ntfy `Click` action). Empty = no click action. */
  appUrl: string;
}

export const DEFAULT_DIGEST_TIME = '09:00';

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const mode = (source.NTFY_MODE ?? 'http').toLowerCase();
  return {
    port: Number(source.PORT ?? 3000),
    databasePath: source.DATABASE_PATH ?? './data/pulsar.db',
    redisUrl: source.REDIS_URL ?? 'redis://localhost:6379',
    ntfyMode: mode === 'cli' ? 'cli' : 'http',
    ntfyServer: (source.NTFY_SERVER ?? 'https://ntfy.sh').replace(/\/+$/, ''),
    ntfyDefaultTopic: source.NTFY_DEFAULT_TOPIC ?? 'pulsar-tracker',
    ntfyBin: source.NTFY_BIN ?? 'ntfy',
    appUrl: (source.APP_URL ?? '').replace(/\/+$/, ''),
  };
}
