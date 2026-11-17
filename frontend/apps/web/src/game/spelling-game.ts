export type GamePhase = 'countdown' | 'playing' | 'won' | 'timeout';

export interface GameRules {
    /** Time before the clock starts, in ms. */
    countdownMs: number;
    /** Time to spell the whole word, in ms. Must fit in the backend session lifetime (5 min). */
    timeLimitMs: number;
    /** How long the correct letter must be held in the zone to be accepted, in ms. */
    holdMs: number;
    /** A shorter break in recognition (a flickering frame) does not reset the hold, in ms. */
    holdGraceMs: number;
    /** Points for each accepted letter. */
    pointsPerLetter: number;
    /** Bonus points for each full second left after the whole word is spelled. */
    pointsPerSecondLeft: number;
}

export const DEFAULT_RULES: GameRules = {
    countdownMs: 3000,
    timeLimitMs: 60_000,
    holdMs: 800,
    holdGraceMs: 200,
    pointsPerLetter: 100,
    pointsPerSecondLeft: 10,
};

export interface GameInput {
    /** True when the hand is fully inside the zone on the camera. */
    handInZone: boolean;
    /** The letter that the recognizer sees, or null. */
    letter: string | null;
}

export interface GameSnapshot {
    phase: GamePhase;
    word: string;
    /** Index of the letter to show now; equals `word.length` when the word is spelled. */
    position: number;
    /** Progress of holding the current letter, 0–1. */
    holdProgress: number;
    /** Time left on the clock, in ms. */
    remainingMs: number;
    /** Time left in the countdown, in ms. */
    countdownMs: number;
    /** Time from the start of the clock to the end of the game, in ms; null while playing. */
    elapsedMs: number | null;
    score: number;
}

/**
 * The rules of one round: spell `word` letter by letter before the time runs out.
 * The class has no timers; call `update` with the current time (for example on each frame).
 */
export class SpellingGame {
    readonly word: string;
    readonly rules: GameRules;
    private readonly createdAt: number;
    private phase: GamePhase = 'countdown';
    private position = 0;
    private holdStart: number | null = null;
    private lastMatch: number | null = null;
    private endedAt: number | null = null;
    private lastNow: number;

    constructor(word: string, now: number, rules: GameRules = DEFAULT_RULES) {
        if (word.length === 0) {
            throw new Error('The word must not be empty.');
        }
        this.word = word.toUpperCase();
        this.rules = rules;
        this.createdAt = now;
        this.lastNow = now;
    }

    get startedAt(): number {
        return this.createdAt + this.rules.countdownMs;
    }

    update(now: number, input: GameInput): GameSnapshot {
        this.lastNow = Math.max(now, this.lastNow);
        now = this.lastNow;

        if (this.phase === 'countdown' && now >= this.startedAt) {
            this.phase = 'playing';
        }
        if (this.phase === 'playing') {
            if (now - this.startedAt >= this.rules.timeLimitMs) {
                this.finish('timeout', this.startedAt + this.rules.timeLimitMs);
            } else {
                this.track(now, input);
            }
        }
        return this.snapshot(now);
    }

    snapshot(now: number = this.lastNow): GameSnapshot {
        const clockEnd = this.endedAt ?? Math.max(now, this.startedAt);
        const elapsed = Math.min(clockEnd - this.startedAt, this.rules.timeLimitMs);
        const remainingMs = Math.max(this.rules.timeLimitMs - elapsed, 0);
        return {
            phase: this.phase,
            word: this.word,
            position: this.position,
            holdProgress: this.holdProgress(now),
            remainingMs,
            countdownMs: Math.max(this.startedAt - now, 0),
            elapsedMs: this.endedAt === null ? null : elapsed,
            score: this.score(remainingMs),
        };
    }

    private track(now: number, { handInZone, letter }: GameInput): void {
        const target = this.word[this.position];
        const matches = handInZone && letter !== null && letter.toUpperCase() === target;

        if (matches) {
            this.holdStart ??= now;
            this.lastMatch = now;
        } else if (this.lastMatch === null || now - this.lastMatch > this.rules.holdGraceMs) {
            this.holdStart = null;
            this.lastMatch = null;
        }

        if (matches && this.holdStart !== null && now - this.holdStart >= this.rules.holdMs) {
            this.position++;
            this.holdStart = null;
            this.lastMatch = null;
            if (this.position === this.word.length) {
                this.finish('won', now);
            }
        }
    }

    private holdProgress(now: number): number {
        if (this.phase !== 'playing' || this.holdStart === null) {
            return 0;
        }
        return Math.min((now - this.holdStart) / this.rules.holdMs, 1);
    }

    private finish(phase: 'won' | 'timeout', at: number): void {
        this.phase = phase;
        this.endedAt = at;
        this.holdStart = null;
        this.lastMatch = null;
    }

    private score(remainingMs: number): number {
        const letters = this.position * this.rules.pointsPerLetter;
        const bonus =
            this.phase === 'won'
                ? Math.floor(remainingMs / 1000) * this.rules.pointsPerSecondLeft
                : 0;
        return letters + bonus;
    }
}
