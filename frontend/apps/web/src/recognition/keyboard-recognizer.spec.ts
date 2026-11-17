import type { Hand } from '@sllapp/hand-landmarker-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createKeyboardRecognizer } from './keyboard-recognizer';

const hand: Hand = { handedness: 'Right', score: 0.9, landmarks: [] };

function press(type: 'keydown' | 'keyup', code: string, target: EventTarget = window) {
    target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

let recognizer: ReturnType<typeof createKeyboardRecognizer>;

afterEach(() => {
    recognizer.dispose();
});

describe('createKeyboardRecognizer', () => {
    it('returns the held letter while a hand is visible', () => {
        recognizer = createKeyboardRecognizer();
        press('keydown', 'KeyA');

        expect(recognizer.predict(hand)).toEqual({ letter: 'A', confidence: 1 });
        expect(recognizer.predict(null)).toBeNull();

        press('keyup', 'KeyA');
        expect(recognizer.predict(hand)).toBeNull();
    });

    it('ignores letters that the model does not know', () => {
        recognizer = createKeyboardRecognizer();
        press('keydown', 'KeyZ');
        expect(recognizer.predict(hand)).toBeNull();
    });

    it('ignores typing in a text field', () => {
        recognizer = createKeyboardRecognizer();
        const input = document.createElement('input');
        document.body.append(input);
        press('keydown', 'KeyA', input);

        expect(recognizer.predict(hand)).toBeNull();
        input.remove();
    });

    it('stops listening after dispose', () => {
        recognizer = createKeyboardRecognizer();
        recognizer.dispose();
        press('keydown', 'KeyA');
        expect(recognizer.predict(hand)).toBeNull();
    });
});
