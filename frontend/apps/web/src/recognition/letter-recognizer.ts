import type { Hand } from '@sllapp/hand-landmarker-vue';

export interface LetterPrediction {
    /** An uppercase letter from `SUPPORTED_LETTERS`. */
    letter: string;
    /** Confidence, 0–1. */
    confidence: number;
}

/**
 * Turns the tracked hand into a letter. The game asks for a prediction on each frame.
 *
 * The PJM classifier (`model/`) takes the 21 MediaPipe landmarks of a `hand_sample`
 * (`model.predict_hand(message["hand"])`). An implementation that calls it, in the browser or
 * through the backend, only needs to implement this interface.
 */
export interface LetterRecognizer {
    /** A short label for the UI. */
    readonly label: string;
    /** True if the predictions do not come from the AI model. */
    readonly isSimulated: boolean;
    predict(hand: Hand | null): LetterPrediction | null;
    dispose(): void;
}
