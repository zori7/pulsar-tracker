import { spawn } from 'node:child_process';

/** One ntfy message addressed to a specific client's topic/server. */
export interface OutgoingNtfy {
  server: string;
  topic: string;
  title: string;
  message: string;
  tags: string;
  priority: string;
  /** URL opened when the notification is tapped (ntfy `Click` action). */
  click?: string;
}

export type SendFn = (msg: OutgoingNtfy) => Promise<void>;

/** NTFY_MODE=http (default): POST {server}/{topic} with Title/Tags/Priority headers. */
export async function sendHttp(msg: OutgoingNtfy): Promise<void> {
  const url = `${msg.server.replace(/\/+$/, '')}/${encodeURIComponent(msg.topic)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Title: msg.title,
      Tags: msg.tags,
      Priority: msg.priority,
      // Tapping the notification opens this URL (ntfy `Click` action).
      ...(msg.click ? { Click: msg.click } : {}),
    },
    body: msg.message,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ntfy HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}

/** NTFY_MODE=cli: spawn `$NTFY_BIN publish --title ... <topic>` (message on stdin). */
export function sendCli(msg: OutgoingNtfy, bin = 'ntfy'): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const args = ['publish', '--title', msg.title, '--tags', msg.tags];
    if (msg.click) args.push(`--click=${msg.click}`);
    args.push(msg.topic);
    const child = spawn(bin, args, {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ntfy exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`));
    });
    // The child may exit (or fail to start) before we finish writing the
    // message — stdin then emits EPIPE. Without this listener that error would
    // be unhandled and crash the whole process; the exit code decides instead.
    child.stdin.on('error', () => undefined);
    try {
      child.stdin.write(msg.message);
      child.stdin.end();
    } catch {
      /* stream already destroyed — 'close' settles the promise */
    }
  });
}

/** Transport factory per env (NTFY_MODE=http|cli). */
export function createTransport(opts: { ntfyMode: 'http' | 'cli'; ntfyBin: string }): SendFn {
  if (opts.ntfyMode === 'cli') {
    return (msg) => sendCli(msg, opts.ntfyBin);
  }
  return (msg) => sendHttp(msg);
}
