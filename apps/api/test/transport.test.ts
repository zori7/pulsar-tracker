import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: spawnMock };
});

import { sendCli, sendHttp } from '../src/notifications/transport.js';
import { digestMessage, itemReminderMessage } from '../src/notifications/messages.js';

afterEach(() => {
  vi.unstubAllGlobals();
  spawnMock.mockReset();
});

interface FakeChild {
  stdin: {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  stderr: { on: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  emitClose(code: number): void;
  emitStdinError(err: Error): void;
}

function fakeChild(): FakeChild {
  const closeHandlers: Array<(code: number) => void> = [];
  const stdinErrorHandlers: Array<(err: Error) => void> = [];
  return {
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn((event: string, cb: (err: Error) => void) => {
        if (event === 'error') stdinErrorHandlers.push(cb);
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'close') closeHandlers.push(cb);
    }),
    emitClose: (code: number) => {
      for (const cb of closeHandlers) cb(code);
    },
    emitStdinError: (err: Error) => {
      for (const cb of stdinErrorHandlers) cb(err);
    },
  };
}

describe('ntfy http transport', () => {
  it('POSTs to {server}/{topic} with Title/Tags/Priority headers and plain-text body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await sendHttp({
      server: 'https://ntfy.example/',
      topic: 'my-topic',
      title: 'Drink water',
      message: '⏰ Drink water is due today',
      tags: 'alarm_clock',
      priority: 'high',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://ntfy.example/my-topic', {
      method: 'POST',
      headers: { Title: 'Drink water', Tags: 'alarm_clock', Priority: 'high' },
      body: '⏰ Drink water is due today',
    });
  });

  it('adds the Click header when a click URL is set (notification tap-through)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await sendHttp({
      server: 'https://ntfy.example',
      topic: 't',
      title: 'x',
      message: 'y',
      tags: 'bell',
      priority: 'default',
      click: 'http://homebox:8700/?date=2026-01-15&item=abc',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://ntfy.example/t', {
      method: 'POST',
      headers: {
        Title: 'x',
        Tags: 'bell',
        Priority: 'default',
        Click: 'http://homebox:8700/?date=2026-01-15&item=abc',
      },
      body: 'y',
    });
  });

  it('omits the Click header when no click URL is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await sendHttp({
      server: 'https://ntfy.example',
      topic: 't',
      title: 'x',
      message: 'y',
      tags: 'bell',
      priority: 'default',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://ntfy.example/t', {
      method: 'POST',
      headers: expect.not.objectContaining({ Click: expect.anything() }),
      body: 'y',
    });
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve('forbidden topic') }),
    );
    await expect(
      sendHttp({
        server: 'https://ntfy.example',
        topic: 't',
        title: 'x',
        message: 'y',
        tags: 'bell',
        priority: 'default',
      }),
    ).rejects.toThrow(/403.*forbidden topic/);
  });
});

describe('ntfy cli transport', () => {
  it('spawns `ntfy publish --title … <topic>` with the message on stdin', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const promise = sendCli(
      {
        server: 'https://ntfy.example',
        topic: 'my-topic',
        title: 'My title',
        message: 'hello body',
        tags: 'bell',
        priority: 'default',
      },
      '/usr/local/bin/ntfy',
    );
    child.emitClose(0);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/ntfy',
      ['publish', '--title', 'My title', '--tags', 'bell', 'my-topic'],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    expect(child.stdin.write).toHaveBeenCalledWith('hello body');
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('passes --click=<url> when a click URL is set', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const promise = sendCli(
      {
        server: 'https://ntfy.example',
        topic: 'my-topic',
        title: 'My title',
        message: 'hello body',
        tags: 'bell',
        priority: 'default',
        click: 'http://homebox:8700/?date=2026-01-15',
      },
      'ntfy',
    );
    child.emitClose(0);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith(
      'ntfy',
      ['publish', '--title', 'My title', '--tags', 'bell', '--click=http://homebox:8700/?date=2026-01-15', 'my-topic'],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
  });

  it('rejects when the binary exits non-zero', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const promise = sendCli(
      { server: 'https://ntfy.example', topic: 't', title: 'x', message: 'y', tags: 'bell', priority: 'default' },
      'ntfy',
    );
    child.emitClose(2);
    await expect(promise).rejects.toThrow(/code 2/);
  });

  it('survives an EPIPE on stdin when the child exits early (regression: must not crash)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const promise = sendCli(
      { server: 'https://ntfy.example', topic: 't', title: 'x', message: 'y', tags: 'bell', priority: 'default' },
      'ntfy',
    );
    // The child already exited → writing the message raises EPIPE on stdin.
    // Before the fix this was an unhandled stream 'error' event that killed
    // the whole process (crashed the API mid-tick).
    child.emitStdinError(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    child.emitClose(0);
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('message formats (SPEC §5)', () => {
  it('item reminder: "⏰ <title> is due today" + optional description line', () => {
    expect(itemReminderMessage('Drink water', null).message).toBe('⏰ Drink water is due today');
    expect(itemReminderMessage('Drink water', '2 liters').message).toBe('⏰ Drink water is due today\n2 liters');
  });

  it('digest: one line per item with ☑ done, ⊘ skipped, ☐ to do', () => {
    const { message } = digestMessage('2026-01-15', [
      { title: 'Stretch', status: 'pending' },
      { title: 'Call mom', status: 'done' },
      { title: 'Rest day', status: 'skipped' },
    ]);
    expect(message).toBe('☐ Stretch\n☑ Call mom\n⊘ Rest day');
  });
});
