/**
 * Pluggable 2-player transport for co-op.
 *
 * - PeerTransport: WebRTC data channel via PeerJS's free cloud broker — real
 *   internet play with a 4-letter room code, no server of our own.
 * - LocalTransport: BroadcastChannel — two tabs in the same browser. Used by
 *   the headless test suite (`?mp=local`) and handy for local dev.
 *
 * Messages are plain JSON objects with a `t` discriminator.
 */

export type NetMsg = Record<string, unknown> & { t: string };

export interface Transport {
  /** resolves once the peer link is open (host: partner joined) */
  readonly ready: Promise<void>;
  send(msg: NetMsg): void;
  onMessage: ((msg: NetMsg) => void) | null;
  onClose: (() => void) | null;
  close(): void;
}

// ---------------------------------------------------------------------------

export class LocalTransport implements Transport {
  readonly ready: Promise<void>;
  onMessage: ((msg: NetMsg) => void) | null = null;
  onClose: (() => void) | null = null;
  private chan: BroadcastChannel;
  private open = false;

  constructor(room: string, isHost: boolean) {
    this.chan = new BroadcastChannel(`voxelstrike-${room}`);
    this.ready = new Promise((resolve) => {
      this.chan.onmessage = (ev) => {
        const msg = ev.data as NetMsg;
        if (msg.t === '__hi' && isHost) {
          this.chan.postMessage({ t: '__hi-ack' });
          if (!this.open) { this.open = true; resolve(); }
          return;
        }
        if (msg.t === '__hi-ack' && !isHost) {
          if (!this.open) { this.open = true; resolve(); }
          return;
        }
        if (msg.t === '__bye') { this.onClose?.(); return; }
        if (!msg.t.startsWith('__')) this.onMessage?.(msg);
      };
      if (!isHost) {
        // knock until the host answers
        const knock = window.setInterval(() => {
          if (this.open) { clearInterval(knock); return; }
          this.chan.postMessage({ t: '__hi' });
        }, 200);
        this.chan.postMessage({ t: '__hi' });
      }
    });
  }

  send(msg: NetMsg): void {
    this.chan.postMessage(msg);
  }

  close(): void {
    try { this.chan.postMessage({ t: '__bye' }); } catch { /* channel gone */ }
    this.chan.close();
  }
}

// ---------------------------------------------------------------------------

interface PeerConnLike {
  on(ev: 'open' | 'close', cb: () => void): void;
  on(ev: 'data', cb: (data: unknown) => void): void;
  send(data: unknown): void;
  close(): void;
}

interface PeerLike {
  on(ev: 'open', cb: (id: string) => void): void;
  on(ev: 'connection', cb: (conn: PeerConnLike) => void): void;
  on(ev: 'error', cb: (err: Error) => void): void;
  connect(id: string, opts?: { reliable?: boolean }): PeerConnLike;
  destroy(): void;
}

export class PeerTransport implements Transport {
  readonly ready: Promise<void>;
  onMessage: ((msg: NetMsg) => void) | null = null;
  onClose: (() => void) | null = null;
  private peer: PeerLike | null = null;
  private conn: PeerConnLike | null = null;

  constructor(room: string, isHost: boolean) {
    this.ready = this.open(room, isHost);
  }

  private async open(room: string, isHost: boolean): Promise<void> {
    const { Peer } = await import('peerjs');
    const hostId = `voxelstrike-${room.toLowerCase()}`;
    await new Promise<void>((resolve, reject) => {
      const peer = (isHost ? new Peer(hostId) : new Peer()) as unknown as PeerLike;
      this.peer = peer;
      peer.on('error', (err) => reject(err));
      if (isHost) {
        peer.on('connection', (conn) => {
          this.attach(conn);
          conn.on('open', () => resolve());
        });
      } else {
        peer.on('open', () => {
          const conn = peer.connect(hostId, { reliable: true });
          this.attach(conn);
          conn.on('open', () => resolve());
        });
      }
    });
  }

  private attach(conn: PeerConnLike): void {
    this.conn = conn;
    conn.on('data', (data) => {
      if (data && typeof data === 'object') this.onMessage?.(data as NetMsg);
    });
    conn.on('close', () => this.onClose?.());
  }

  send(msg: NetMsg): void {
    this.conn?.send(msg);
  }

  close(): void {
    this.conn?.close();
    this.peer?.destroy();
  }
}
