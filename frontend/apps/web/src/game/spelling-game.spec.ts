import { describe, expect, it } from 'vitest';
import { SpellingGame, type GameRules } from './spelling-game';

const rules: GameRules = {
    countdownMs: 1000,
    timeLimitMs: 10_000,
    holdMs: 500,
    holdGraceMs: 100,
    pointsPerLetter: 100,
    pointsPerSecondLeft: 10,
};

const START = 1000; // the clock starts after the countdown

function show(letter: string | null, handInZone = true) {
    return { letter, handInZone };
}

/** Holds `letter` from `from` for `duration` ms, in 50 ms frames. */
function hold(game: SpellingGame, letter: string, from: number, duration: number) {
    let snapshot = game.update(from, show(letter));
    for (let time = from + 50; time <= from + duration; time += 50) {
        snapshot = game.update(time, show(letter));
    }
    return snapshot;
}

describe('SpellingGame', () => {
    it('starts with a countdown', () => {
        const game = new SpellingGame('lampa', 0, rules);
        const snapshot = game.update(400, show('L'));

        expect(snapshot).toMatchObject({
            phase: 'countdown',
            word: 'LAMPA',
            position: 0,
            countdownMs: 600,
            remainingMs: 10_000,
        });
    });

    it('accepts a letter after it is held in the zone', () => {
        const game = new SpellingGame('LAMPA', 0, rules);

        expect(hold(game, 'L', START, 450)).toMatchObject({ position: 0, holdProgress: 0.9 });
        expect(game.update(START + 500, show('L'))).toMatchObject({ position: 1, holdProgress: 0 });
    });

    it('ignores the correct letter outside the zone', () => {
        const game = new SpellingGame('LAMPA', 0, rules);
        game.update(START, show('L', false));
        expect(game.update(START + 1000, show('L', false)).position).toBe(0);
    });

    it('ignores a wrong letter', () => {
        const game = new SpellingGame('LAMPA', 0, rules);
        expect(hold(game, 'A', START, 1000).position).toBe(0);
    });

    it('keeps the hold through a short break and resets it after a long break', () => {
        const game = new SpellingGame('LAMPA', 0, rules);
        game.update(START, show('L'));
        game.update(START + 80, show(null));
        expect(game.update(START + 130, show('L')).holdProgress).toBeCloseTo(0.26);

        game.update(START + 200, show(null));
        game.update(START + 350, show(null));
        expect(game.update(START + 360, show('L')).holdProgress).toBe(0);
    });

    it('wins with a time bonus when the whole word is spelled', () => {
        const game = new SpellingGame('LAMPA', 0, rules);
        let time = START;
        for (const letter of 'LAMPA') {
            hold(game, letter, time, 500);
            time += 600;
        }
        const snapshot = game.update(time + 5000, show(null));

        // The last letter is accepted at START + 2900 ms; 7.1 s are left.
        expect(snapshot).toMatchObject({
            phase: 'won',
            position: 5,
            elapsedMs: 2900,
            remainingMs: 7100,
            score: 5 * 100 + 7 * 10,
        });
    });

    it('ends when the time runs out and keeps the points for spelled letters', () => {
        const game = new SpellingGame('LAMPA', 0, rules);
        hold(game, 'L', START, 500);
        const snapshot = game.update(START + 10_000, show('A'));

        expect(snapshot).toMatchObject({
            phase: 'timeout',
            position: 1,
            remainingMs: 0,
            elapsedMs: 10_000,
            score: 100,
        });
        expect(game.update(START + 20_000, show('A')).position).toBe(1);
    });
});
