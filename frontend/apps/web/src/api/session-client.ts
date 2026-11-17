import type { Hand } from '@sllapp/hand-landmarker-vue';

/** The hand that the player selects; the backend `SelectedHand` enum. */
export type SelectedHand = 'LEFT' | 'RIGHT';

/** The `game_state` message (see `docs/api.md`). */
export interface GameState {
    sessionId: string;
    status: string;
    nickname: string;
    selectedHand: SelectedHand;
    /** Copy into each sample. The backend uses null in the `CREATED` state. */
    positionId: number | null;
}

export type ConnectionStatus =
    'idle' | 'connecting' | 'connected' | 'reconnecting' | 'expired' | 'replaced' | 'closed';

/** An `error` message from the backend, or a connection failure (`code: 'CONNECTION_FAILED'`). */
export class SessionError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'SessionError';
        this.code = code;
    }
}

export interface SessionClientOptions {
    /** Minimum time between two samples, in ms. MediaPipe gives about 30 frames per second. */
    sampleIntervalMs?: number;
    /** How many times to resume the session after an unexpected disconnect. */
    maxReconnects?: number;
    reconnectDelayMs?: number;
    /** For tests. */
    createSocket?: (url: string) => WebSocket;
    now?: () => number;
}

const LANDMARK_COUNT = 21;
/** Skip samples while this many bytes still wait in the socket buffer. */
const MAX_BUFFERED_BYTES = 128 * 1024;
const CLOSE_REPLACED = 1000;
const CLOSE_POLICY = 1008;

/**
 * The client side of the `/ws` protocol: creates a player session, streams `hand_sample` and
 * `no_hand` messages, and resumes the session after an unexpected disconnect.
 */
export class SessionClient {
    private readonly url: string;
    private readonly sampleIntervalMs: number;
    private readonly maxReconnects: number;
    private readonly reconnectDelayMs: number;
    private readonly createSocket: (url: string) => WebSocket;
    private readonly now: () => number;

    private socket: WebSocket | null = null;
    private currentState: GameState | null = null;
    private currentStatus: ConnectionStatus = 'idle';
    private seq = 0;
    private lastSampleAt = Number.NEGATIVE_INFINITY;
    private reconnects = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private closedByClient = false;

    private readonly stateListeners = new Set<(state: GameState) => void>();
    private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
    private readonly errorListeners = new Set<(error: SessionError) => void>();

    constructor(url: string, options: SessionClientOptions = {}) {
        this.url = url;
        this.sampleIntervalMs = options.sampleIntervalMs ?? 66;
        this.maxReconnects = options.maxReconnects ?? 3;
        this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
        this.createSocket = options.createSocket ?? ((target) => new WebSocket(target));
        this.now = options.now ?? (() => performance.now());
    }

    get state(): GameState | null {
        return this.currentState;
    }

    get status(): ConnectionStatus {
        return this.currentStatus;
    }

    onState(listener: (state: GameState) => void): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    onStatus(listener: (status: ConnectionStatus) => void): () => void {
        this.statusListeners.add(listener);
        return () => this.statusListeners.delete(listener);
    }

    /** Errors that the backend reports after the session exists (for example `INVALID_SAMPLE`). */
    onError(listener: (error: SessionError) => void): () => void {
        this.errorListeners.add(listener);
        return () => this.errorListeners.delete(listener);
    }

    /**
     * Opens the connection and creates a session. Resolves with the first `game_state`.
     * Rejects with a `SessionError`, for example `INVALID_SESSION` for a blocked nickname.
     */
    createSession(nickname: string, selectedHand: SelectedHand): Promise<GameState> {
        if (this.socket !== null || this.currentState !== null) {
            return Promise.reject(new Error('This client already has a session.'));
        }
        this.closedByClient = false;
        this.setStatus('connecting');

        return new Promise<GameState>((resolve, reject) => {
            let settled = false;
            const socket = this.open({ type: 'create_session', nickname, selectedHand });

            socket.addEventListener('message', (event) => {
                const message = parse(event.data);
                if (settled || message === null) {
                    return;
                }
                if (message.type === 'game_state') {
                    settled = true;
                    resolve(this.currentState!);
                } else if (message.type === 'error') {
                    settled = true;
                    this.close();
                    reject(toSessionError(message));
                }
            });
            socket.addEventListener('close', () => {
                if (!settled) {
                    settled = true;
                    this.socket = null;
                    this.setStatus('closed');
                    reject(
                        new SessionError(
                            'CONNECTION_FAILED',
                            'Nie udało się połączyć z serwerem gry.',
                        ),
                    );
                }
            });
        });
    }

    /** Sends the current hand as `hand_sample`, or `no_hand` for null. Samples are throttled. */
    sendHand(hand: Hand | null): void {
        const socket = this.socket;
        if (
            socket === null ||
            this.currentState === null ||
            socket.readyState !== WebSocket.OPEN ||
            socket.bufferedAmount > MAX_BUFFERED_BYTES
        ) {
            return;
        }
        const now = this.now();
        if (now - this.lastSampleAt < this.sampleIntervalMs) {
            return;
        }
        const message = toSampleMessage(hand, this.seq, this.currentState.positionId);
        if (message === null) {
            return;
        }
        this.lastSampleAt = now;
        this.seq++;
        socket.send(JSON.stringify(message));
    }

    /** Closes the connection. The session stays on the backend until it expires. */
    close(): void {
        this.closedByClient = true;
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        const socket = this.socket;
        this.socket = null;
        if (socket !== null && socket.readyState <= WebSocket.OPEN) {
            socket.close(1000);
        }
        this.setStatus('closed');
    }

    private open(firstMessage: object): WebSocket {
        const socket = this.createSocket(this.url);
        this.socket = socket;

        socket.addEventListener('open', () => {
            socket.send(JSON.stringify(firstMessage));
        });
        socket.addEventListener('message', (event) => {
            if (socket === this.socket) {
                this.handleMessage(parse(event.data));
            }
        });
        socket.addEventListener('close', (event) => {
            if (socket === this.socket) {
                this.handleClose(event.code);
            }
        });
        return socket;
    }

    private handleMessage(message: Record<string, unknown> | null): void {
        if (message === null) {
            return;
        }
        if (message.type === 'game_state') {
            this.currentState = toGameState(message);
            this.reconnects = 0;
            this.setStatus('connected');
            for (const listener of this.stateListeners) {
                listener(this.currentState);
            }
        } else if (message.type === 'error' && this.currentState !== null) {
            const error = toSessionError(message);
            for (const listener of this.errorListeners) {
                listener(error);
            }
        }
    }

    private handleClose(code: number): void {
        this.socket = null;
        if (this.closedByClient || this.currentState === null) {
            return;
        }
        if (code === CLOSE_POLICY) {
            this.setStatus('expired');
        } else if (code === CLOSE_REPLACED) {
            this.setStatus('replaced');
        } else if (this.reconnects < this.maxReconnects) {
            this.reconnects++;
            this.setStatus('reconnecting');
            const sessionId = this.currentState.sessionId;
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                if (!this.closedByClient) {
                    this.open({ type: 'resume_session', sessionId });
                }
            }, this.reconnectDelayMs * this.reconnects);
        } else {
            this.setStatus('closed');
        }
    }

    private setStatus(status: ConnectionStatus): void {
        if (status === this.currentStatus) {
            return;
        }
        this.currentStatus = status;
        for (const listener of this.statusListeners) {
            listener(status);
        }
    }
}

function parse(data: unknown): Record<string, unknown> | null {
    if (typeof data !== 'string') {
        return null;
    }
    try {
        const value: unknown = JSON.parse(data);
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

function toGameState(message: Record<string, unknown>): GameState {
    return {
        sessionId: String(message.sessionId),
        status: String(message.status),
        nickname: String(message.nickname),
        selectedHand: message.selectedHand === 'LEFT' ? 'LEFT' : 'RIGHT',
        positionId: typeof message.positionId === 'number' ? message.positionId : null,
    };
}

function toSessionError(message: Record<string, unknown>): SessionError {
    return new SessionError(
        typeof message.code === 'string' ? message.code : 'UNKNOWN',
        typeof message.message === 'string' ? message.message : 'Unknown error.',
    );
}

/** Builds the sample message from `docs/api.md`. Returns null for incomplete tracker data. */
export function toSampleMessage(
    hand: Hand | null,
    seq: number,
    positionId: number | null,
): Record<string, unknown> | null {
    if (hand === null) {
        return { type: 'no_hand', seq, positionId };
    }
    const landmarks = hand.landmarks.map(({ x, y, z }) => ({ x, y, z }));
    if (
        landmarks.length !== LANDMARK_COUNT ||
        !landmarks.every((point) => [point.x, point.y, point.z].every(Number.isFinite))
    ) {
        return null;
    }
    return {
        type: 'hand_sample',
        seq,
        positionId,
        hand: {
            handedness: hand.handedness === 'Left' ? 'LEFT' : 'RIGHT',
            score: Number.isFinite(hand.score) ? hand.score : 0,
            landmarks,
        },
    };
}
