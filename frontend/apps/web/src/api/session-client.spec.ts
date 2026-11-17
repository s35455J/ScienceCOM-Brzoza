import type { Hand } from '@sllapp/hand-landmarker-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionClient, SessionError, toSampleMessage } from './session-client';

class FakeSocket extends EventTarget {
    readyState: number = WebSocket.CONNECTING;
    bufferedAmount = 0;
    readonly sent: Record<string, unknown>[] = [];
    readonly closeCalls: number[] = [];

    constructor(readonly url: string) {
        super();
    }

    send(data: string): void {
        this.sent.push(JSON.parse(data) as Record<string, unknown>);
    }

    close(code = 1000): void {
        this.closeCalls.push(code);
        this.readyState = WebSocket.CLOSED;
    }

    open(): void {
        this.readyState = WebSocket.OPEN;
        this.dispatchEvent(new Event('open'));
    }

    receive(message: object): void {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
    }

    serverClose(code: number): void {
        this.readyState = WebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent('close', { code }));
    }
}

const SESSION_ID = '6a386307-3c19-4e3b-90c7-ae405835f825';
const gameState = {
    type: 'game_state',
    sessionId: SESSION_ID,
    status: 'CREATED',
    nickname: 'Ola',
    selectedHand: 'RIGHT',
    positionId: null,
};

const hand: Hand = {
    handedness: 'Left',
    score: 0.93,
    landmarks: Array.from({ length: 21 }, (_, index) => ({ x: index / 21, y: 0.5, z: -0.01 })),
};

let sockets: FakeSocket[];
let time: number;

function createClient() {
    return new SessionClient('ws://test/ws', {
        createSocket: (url) => {
            const socket = new FakeSocket(url);
            sockets.push(socket);
            return socket as unknown as WebSocket;
        },
        now: () => time,
        sampleIntervalMs: 50,
        reconnectDelayMs: 10,
    });
}

async function connected() {
    const client = createClient();
    const created = client.createSession('Ola', 'RIGHT');
    sockets[0]!.open();
    sockets[0]!.receive(gameState);
    await created;
    return client;
}

beforeEach(() => {
    sockets = [];
    time = 1000;
});

afterEach(() => {
    vi.useRealTimers();
});

describe('SessionClient', () => {
    it('creates a session and resolves with the game state', async () => {
        const client = createClient();
        const created = client.createSession('Ola', 'RIGHT');
        sockets[0]!.open();

        expect(sockets[0]!.sent).toEqual([
            { type: 'create_session', nickname: 'Ola', selectedHand: 'RIGHT' },
        ]);

        sockets[0]!.receive(gameState);
        await expect(created).resolves.toEqual({
            sessionId: SESSION_ID,
            status: 'CREATED',
            nickname: 'Ola',
            selectedHand: 'RIGHT',
            positionId: null,
        });
        expect(client.status).toBe('connected');
    });

    it('rejects with the backend error code for invalid player data', async () => {
        const client = createClient();
        const created = client.createSession('bad', 'RIGHT');
        sockets[0]!.open();
        sockets[0]!.receive({ type: 'error', code: 'INVALID_SESSION', message: 'Invalid.' });

        await expect(created).rejects.toMatchObject({ code: 'INVALID_SESSION' });
        expect(sockets[0]!.closeCalls).toEqual([1000]);
    });

    it('rejects with CONNECTION_FAILED when the backend is not reachable', async () => {
        const client = createClient();
        const created = client.createSession('Ola', 'RIGHT');
        sockets[0]!.serverClose(1006);

        await expect(created).rejects.toBeInstanceOf(SessionError);
        await expect(created).rejects.toMatchObject({ code: 'CONNECTION_FAILED' });
    });

    it('sends samples with increasing seq and the current positionId, throttled', async () => {
        const client = await connected();
        const socket = sockets[0]!;

        client.sendHand(hand);
        time += 10;
        client.sendHand(hand); // too early, skipped
        time += 50;
        client.sendHand(null);

        expect(socket.sent.slice(1)).toEqual([
            {
                type: 'hand_sample',
                seq: 0,
                positionId: null,
                hand: { handedness: 'LEFT', score: 0.93, landmarks: hand.landmarks },
            },
            { type: 'no_hand', seq: 1, positionId: null },
        ]);
    });

    it('resumes the session after an unexpected disconnect', async () => {
        vi.useFakeTimers();
        const client = await connected();
        sockets[0]!.serverClose(1006);
        expect(client.status).toBe('reconnecting');

        vi.advanceTimersByTime(10);
        sockets[1]!.open();
        expect(sockets[1]!.sent).toEqual([{ type: 'resume_session', sessionId: SESSION_ID }]);

        sockets[1]!.receive(gameState);
        expect(client.status).toBe('connected');
    });

    it('does not reconnect when the session expired', async () => {
        const client = await connected();
        sockets[0]!.serverClose(1008);

        expect(client.status).toBe('expired');
        expect(sockets).toHaveLength(1);
    });

    it('reports backend errors after the session exists', async () => {
        const client = await connected();
        const onError = vi.fn();
        client.onError(onError);
        sockets[0]!.receive({ type: 'error', code: 'INVALID_SAMPLE', message: 'Bad sample.' });

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_SAMPLE' }));
    });
});

describe('toSampleMessage', () => {
    it('skips a hand without 21 finite landmarks', () => {
        expect(toSampleMessage({ ...hand, landmarks: hand.landmarks.slice(1) }, 0, null)).toBe(
            null,
        );
        const broken = hand.landmarks.map((point, index) =>
            index === 3 ? { ...point, y: Number.NaN } : point,
        );
        expect(toSampleMessage({ ...hand, landmarks: broken }, 0, null)).toBeNull();
    });
});
