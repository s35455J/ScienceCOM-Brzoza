import { describe, expect, it } from 'vitest';
import { drawWord, SUPPORTED_LETTERS, WORD_LENGTH, WORDS } from './words';

describe('WORDS', () => {
    it('has only five-letter words', () => {
        for (const word of WORDS) {
            expect(word, word).toHaveLength(WORD_LENGTH);
        }
    });

    it('uses only letters that the model recognizes (no Polish diacritics)', () => {
        const letters = new Set<string>(SUPPORTED_LETTERS);
        for (const word of WORDS) {
            expect(
                [...word].every((letter) => letters.has(letter)),
                word,
            ).toBe(true);
        }
    });

    it('has no duplicates', () => {
        expect(new Set(WORDS).size).toBe(WORDS.length);
    });
});

describe('drawWord', () => {
    it('returns a word from the list', () => {
        expect(drawWord(() => 0)).toBe(WORDS[0]);
        expect(drawWord(() => 0.999999)).toBe(WORDS.at(-1));
    });

    it('does not repeat the excluded word', () => {
        expect(drawWord(() => 0, WORDS[0])).toBe(WORDS[1]);
    });
});
