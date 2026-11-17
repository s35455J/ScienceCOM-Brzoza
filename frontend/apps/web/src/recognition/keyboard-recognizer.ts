import type { Hand } from '@sllapp/hand-landmarker-vue';
import { SUPPORTED_LETTERS } from '../game/words';
import type { LetterPrediction, LetterRecognizer } from './letter-recognizer';

const LETTERS = new Set<string>(SUPPORTED_LETTERS);

/**
 * Test recognizer for the time before the AI model is connected: the letter key that the
 * operator holds down is the "recognized" letter, but only while a hand is visible.
 * This lets the team test the whole game flow with the camera and the backend.
 */
export function createKeyboardRecognizer(target: Window = window): LetterRecognizer {
    const pressed: string[] = [];

    function onKeyDown(event: KeyboardEvent): void {
        const letter = toLetter(event);
        if (letter === null || isTyping(event)) {
            return;
        }
        event.preventDefault();
        if (!pressed.includes(letter)) {
            pressed.push(letter);
        }
    }

    function onKeyUp(event: KeyboardEvent): void {
        const letter = toLetter(event);
        const index = letter === null ? -1 : pressed.indexOf(letter);
        if (index !== -1) {
            pressed.splice(index, 1);
        }
    }

    function onBlur(): void {
        pressed.length = 0;
    }

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);

    return {
        label: 'Tryb testowy: przytrzymaj klawisz litery',
        isSimulated: true,
        predict(hand: Hand | null): LetterPrediction | null {
            const letter = pressed.at(-1);
            return hand !== null && letter !== undefined ? { letter, confidence: 1 } : null;
        },
        dispose() {
            target.removeEventListener('keydown', onKeyDown);
            target.removeEventListener('keyup', onKeyUp);
            target.removeEventListener('blur', onBlur);
            pressed.length = 0;
        },
    };
}

function toLetter(event: KeyboardEvent): string | null {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return null;
    }
    const match = /^Key([A-Z])$/.exec(event.code);
    const letter = match?.[1] ?? null;
    return letter !== null && LETTERS.has(letter) ? letter : null;
}

function isTyping(event: KeyboardEvent): boolean {
    const element = event.target;
    return (
        element instanceof HTMLElement &&
        (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
    );
}
