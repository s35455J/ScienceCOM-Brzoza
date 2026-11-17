/**
 * Letters that the PJM classifier in `model/` can recognize: the 16 static-sign classes of the
 * SPAS dataset (see `model/README.md`). Words may use only these letters.
 */
export const SUPPORTED_LETTERS = [
    'A',
    'B',
    'C',
    'E',
    'I',
    'L',
    'M',
    'N',
    'O',
    'P',
    'R',
    'S',
    'T',
    'U',
    'W',
    'Y',
] as const;

export type SupportedLetter = (typeof SUPPORTED_LETTERS)[number];

export const WORD_LENGTH = 5;

/**
 * Polish five-letter words without Polish diacritics, built only from `SUPPORTED_LETTERS`.
 * `words.spec.ts` checks both rules.
 */
export const WORDS: readonly string[] = [
    'ARENA',
    'BALET',
    'BALON',
    'BATON',
    'BETON',
    'BRAMA',
    'BURSA',
    'CYTAT',
    'LAMPA',
    'LEMUR',
    'LIMIT',
    'LISTA',
    'MAMUT',
    'MELON',
    'METRO',
    'MOTEL',
    'MOTOR',
    'MOTYL',
    'NARTY',
    'NIEBO',
    'OBRUS',
    'OCEAN',
    'OPERA',
    'OPONA',
    'OWOCE',
    'PALEC',
    'PALMA',
    'PASTA',
    'PIANO',
    'PILOT',
    'PIRAT',
    'PLAMA',
    'POETA',
    'POMPA',
    'RAMPA',
    'ROBOT',
    'ROWER',
    'RUMBA',
    'SALON',
    'SALTO',
    'SAMBA',
    'SANIE',
    'SERCE',
    'SIANO',
    'SYROP',
    'TAPIR',
    'TEATR',
    'TORBA',
    'TRASA',
    'TRAWA',
    'TYTAN',
    'ULICA',
    'WALEC',
    'WYSPA',
];

/** Draws a random word. `random` returns a number in [0, 1), like `Math.random`. */
export function drawWord(random: () => number = Math.random, exclude?: string): string {
    const pool = WORDS.length > 1 && exclude ? WORDS.filter((word) => word !== exclude) : WORDS;
    const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
    return pool[index]!;
}
