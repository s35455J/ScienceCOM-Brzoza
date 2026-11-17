<script setup lang="ts">
import { useHandTracker } from '@sllapp/hand-landmarker-vue';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue';
import {
    SessionClient,
    SessionError,
    type ConnectionStatus,
    type SelectedHand,
} from '../api/session-client';
import { config } from '../config';
import { isHandInZone, zoneFor } from '../game/hand-zone';
import { SpellingGame, type GameSnapshot } from '../game/spelling-game';
import { drawWord } from '../game/words';
import { createKeyboardRecognizer } from '../recognition/keyboard-recognizer';
import type { LetterPrediction, LetterRecognizer } from '../recognition/letter-recognizer';
import CameraStage, { type ZoneState } from './CameraStage.vue';
import RankingPanel from './RankingPanel.vue';
import WordProgress from './WordProgress.vue';

const props = defineProps<{
    nickname: string;
    hand: SelectedHand;
    /** For tests and for a future AI recognizer. Defaults to the keyboard test recognizer. */
    recognizer?: LetterRecognizer;
}>();

const emit = defineEmits<{
    /** Leave the game. `error` is set when the backend rejected the player data. */
    exit: [error?: string];
}>();

const MIRROR_STORAGE_KEY = 'sllapp.mirrored';
const LETTER_FLASH_MS = 450;

const stage = useTemplateRef<InstanceType<typeof CameraStage>>('stage');
const tracker = useHandTracker(() => stage.value?.video, {
    modelAssetPath: config.handLandmarkerModelUrl,
    wasmPath: config.mediapipeWasmPath,
    preferredHand: props.hand === 'LEFT' ? 'Left' : 'Right',
});
const recognizer = props.recognizer ?? createKeyboardRecognizer();

const mirrored = ref(readMirror());
const frameSize = ref({ width: 640, height: 480 });
const zone = computed(() => zoneFor(props.hand, frameSize.value.width, frameSize.value.height));

const word = ref('');
const preparing = ref(false);
const snapshot = shallowRef<GameSnapshot | null>(null);
const handInZone = ref(false);
const prediction = shallowRef<LetterPrediction | null>(null);
const letterAcceptedAt = ref(Number.NEGATIVE_INFINITY);
const now = ref(0);
const connection = ref<ConnectionStatus>('idle');
const offline = ref(false);
const rankingKey = ref(0);

let game: SpellingGame | null = null;
let client: SessionClient | null = null;
let round = 0;
let frameId: number | null = null;

const phase = computed(() => snapshot.value?.phase ?? null);
const isActive = computed(() => phase.value === 'countdown' || phase.value === 'playing');
const isFinished = computed(() => phase.value === 'won' || phase.value === 'timeout');
const targetLetter = computed(() => {
    const current = snapshot.value;
    return current && current.position < current.word.length
        ? current.word[current.position]
        : null;
});

const zoneState = computed<ZoneState>(() => {
    if (now.value - letterAcceptedAt.value < LETTER_FLASH_MS) {
        return 'done';
    }
    if (phase.value !== 'playing' || tracker.hand.value === null) {
        return 'idle';
    }
    if (!handInZone.value) {
        return 'outside';
    }
    return (snapshot.value?.holdProgress ?? 0) > 0 ? 'holding' : 'inside';
});

const hint = computed(() => {
    if (phase.value !== 'playing') {
        return '';
    }
    if (tracker.hand.value === null) {
        return 'Pokaż dłoń w ramce.';
    }
    if (!handInZone.value) {
        return 'Przesuń całą dłoń do ramki.';
    }
    if ((snapshot.value?.holdProgress ?? 0) > 0) {
        return 'Dobrze! Przytrzymaj znak…';
    }
    if (prediction.value && prediction.value.letter !== targetLetter.value) {
        return `Widzę literę ${prediction.value.letter}. Pokaż ${targetLetter.value}.`;
    }
    return `Pokaż literę ${targetLetter.value}.`;
});

const remainingSeconds = computed(() => Math.ceil((snapshot.value?.remainingMs ?? 0) / 1000));
const timeFraction = computed(() =>
    game && snapshot.value ? snapshot.value.remainingMs / game.rules.timeLimitMs : 1,
);
const countdownNumber = computed(() => Math.ceil((snapshot.value?.countdownMs ?? 0) / 1000));

const connectionLabel = computed(() => {
    if (offline.value) {
        return 'Brak połączenia z serwerem – gra offline';
    }
    switch (connection.value) {
        case 'connecting':
            return 'Łączenie z serwerem…';
        case 'connected':
            return 'Połączono z serwerem';
        case 'reconnecting':
            return 'Ponowne łączenie…';
        case 'expired':
            return 'Sesja wygasła';
        case 'replaced':
            return 'Sesja otwarta w innym oknie';
        default:
            return '';
    }
});

const cameraError = computed(() => {
    const error = tracker.error.value;
    if (error === null) {
        return null;
    }
    switch (error.code) {
        case 'camera-denied':
            return 'Brak dostępu do kamery. Zezwól na użycie kamery w ustawieniach przeglądarki.';
        case 'camera-unavailable':
            return 'Nie znaleziono kamery albo jest używana przez inną aplikację.';
        case 'model-load-failed':
            return 'Nie udało się wczytać modelu śledzenia dłoni. Sprawdź połączenie z internetem.';
    }
    return error.message;
});

function readMirror(): boolean {
    try {
        return localStorage.getItem(MIRROR_STORAGE_KEY) !== 'false';
    } catch {
        return true;
    }
}

function toggleMirror(): void {
    mirrored.value = !mirrored.value;
    try {
        localStorage.setItem(MIRROR_STORAGE_KEY, String(mirrored.value));
    } catch {
        // Storage is optional.
    }
}

function onFrameSize(width: number, height: number): void {
    frameSize.value = { width, height };
}

async function connect(currentRound: number): Promise<void> {
    client?.close();
    const session = new SessionClient(config.webSocketUrl);
    client = session;
    offline.value = false;
    session.onStatus((status) => {
        if (client === session) {
            connection.value = status;
        }
    });
    try {
        await session.createSession(props.nickname, props.hand);
    } catch (error) {
        if (currentRound !== round) {
            return;
        }
        if (error instanceof SessionError && error.code !== 'CONNECTION_FAILED') {
            emit(
                'exit',
                error.code === 'INVALID_SESSION'
                    ? 'Serwer nie przyjął tego nicku. Wybierz inny.'
                    : error.message,
            );
            throw error;
        }
        // The game works without the backend; the result is then not sent.
        offline.value = true;
    }
}

async function startRound(): Promise<void> {
    const currentRound = ++round;
    preparing.value = true;
    game = null;
    snapshot.value = null;
    letterAcceptedAt.value = Number.NEGATIVE_INFINITY;
    word.value = drawWord(Math.random, word.value || undefined);

    try {
        await Promise.all([
            connect(currentRound),
            tracker.isRunning.value ? Promise.resolve() : tracker.start(),
        ]);
    } catch {
        return;
    } finally {
        if (currentRound === round) {
            preparing.value = false;
        }
    }
    if (currentRound !== round || tracker.error.value !== null || !tracker.isRunning.value) {
        return;
    }
    game = new SpellingGame(word.value, performance.now());
    snapshot.value = game.snapshot();
}

async function retryCamera(): Promise<void> {
    await tracker.start();
    if (tracker.isRunning.value && game === null) {
        await startRound();
    }
}

function finishRound(): void {
    client?.close();
    rankingKey.value++;
}

function tick(time: number): void {
    frameId = requestAnimationFrame(tick);
    now.value = time;
    const hand = tracker.hand.value;
    handInZone.value = hand !== null && isHandInZone(hand.landmarks, zone.value);
    prediction.value = recognizer.predict(hand);

    if (game === null) {
        return;
    }
    const before = snapshot.value;
    const next = game.update(time, {
        handInZone: handInZone.value,
        letter: prediction.value?.letter ?? null,
    });
    snapshot.value = next;

    if (before && next.position > before.position) {
        letterAcceptedAt.value = time;
    }
    if (next.phase === 'countdown' || next.phase === 'playing') {
        client?.sendHand(hand);
    } else if (before && (before.phase === 'countdown' || before.phase === 'playing')) {
        finishRound();
    }
}

function exit(): void {
    emit('exit');
}

onMounted(() => {
    frameId = requestAnimationFrame(tick);
    void startRound();
});

onBeforeUnmount(() => {
    round++;
    if (frameId !== null) {
        cancelAnimationFrame(frameId);
    }
    client?.close();
    client = null;
    tracker.stop();
    if (!props.recognizer) {
        recognizer.dispose();
    }
});
</script>

<template>
    <div class="game">
        <header class="game__bar">
            <div class="game__player">
                <span class="game__nickname">{{ nickname }}</span>
                <span class="game__hand">{{ hand === 'LEFT' ? 'lewa ręka' : 'prawa ręka' }}</span>
            </div>
            <div
                v-if="snapshot && !isFinished"
                class="timer"
                :class="{ 'timer--low': remainingSeconds <= 10 && phase === 'playing' }"
                role="timer"
                aria-live="off"
            >
                <span class="timer__value">{{ remainingSeconds }} s</span>
                <span class="timer__bar">
                    <span class="timer__fill" :style="{ transform: `scaleX(${timeFraction})` }" />
                </span>
            </div>
            <div class="game__actions">
                <button
                    type="button"
                    class="button button--ghost"
                    :aria-pressed="mirrored"
                    @click="toggleMirror"
                >
                    ⇋ Lustro: {{ mirrored ? 'wł.' : 'wył.' }}
                </button>
                <button type="button" class="button button--ghost" @click="exit">Zakończ</button>
            </div>
        </header>

        <WordProgress
            v-if="snapshot"
            class="game__word"
            :word="snapshot.word"
            :position="snapshot.position"
        />

        <CameraStage
            ref="stage"
            :hand="tracker.hand.value"
            :zone="zone"
            :mirrored="mirrored"
            :zone-state="zoneState"
            :hold-progress="snapshot?.holdProgress ?? 0"
            @frame-size="onFrameSize"
        >
            <template #zone>
                <span v-if="phase === 'playing' && targetLetter" class="zone-letter">
                    {{ targetLetter }}
                </span>
            </template>

            <div v-if="cameraError" class="overlay">
                <p class="overlay__text">{{ cameraError }}</p>
                <button type="button" class="button button--primary" @click="retryCamera">
                    Spróbuj ponownie
                </button>
            </div>
            <div v-else-if="preparing" class="overlay">
                <span class="spinner" aria-hidden="true" />
                <p class="overlay__text">Uruchamianie kamery i modelu śledzenia dłoni…</p>
            </div>
            <div v-else-if="phase === 'countdown'" class="overlay overlay--clear">
                <p class="overlay__caption">Twoje słowo: {{ snapshot?.word }}</p>
                <span class="countdown">{{ countdownNumber }}</span>
            </div>
            <div v-else-if="isFinished && snapshot" class="overlay overlay--result">
                <h2 class="result__title">
                    {{ phase === 'won' ? 'Brawo!' : 'Koniec czasu!' }}
                </h2>
                <WordProgress :word="snapshot.word" :position="snapshot.position" />
                <dl class="result__stats">
                    <div>
                        <dt>Litery</dt>
                        <dd>{{ snapshot.position }}/{{ snapshot.word.length }}</dd>
                    </div>
                    <div>
                        <dt>Czas</dt>
                        <dd>{{ ((snapshot.elapsedMs ?? 0) / 1000).toFixed(1) }} s</dd>
                    </div>
                    <div>
                        <dt>Wynik</dt>
                        <dd class="result__score">{{ snapshot.score }} pkt</dd>
                    </div>
                </dl>
                <div class="result__actions">
                    <button
                        type="button"
                        class="button button--primary button--large"
                        @click="startRound"
                    >
                        Zagraj ponownie
                    </button>
                    <button type="button" class="button button--ghost" @click="exit">
                        Zmień gracza
                    </button>
                </div>
            </div>
        </CameraStage>

        <p class="game__hint" aria-live="polite">{{ hint }}&nbsp;</p>

        <footer class="game__footer">
            <span v-if="connectionLabel" class="badge" :class="{ 'badge--warn': offline }">
                {{ connectionLabel }}
            </span>
            <span v-if="recognizer.isSimulated" class="badge badge--warn">
                {{ recognizer.label }} ({{ prediction?.letter ?? '–' }})
            </span>
        </footer>

        <RankingPanel
            v-if="isFinished"
            class="game__ranking"
            :refresh-key="rankingKey"
            :highlight="nickname"
        />
    </div>
</template>

<style scoped>
.game {
    display: grid;
    gap: 1rem;
}

.game__bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 1rem;
    align-items: center;
}

.game__player {
    display: grid;
}

.game__nickname {
    font-size: 1.2rem;
    font-weight: 700;
}

.game__hand {
    color: var(--muted);
    font-size: 0.9rem;
}

.game__actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
}

.timer {
    display: grid;
    gap: 0.3rem;
    justify-items: center;
    min-width: 10rem;
}

.timer__value {
    font-size: 1.8rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
}

.timer__bar {
    width: 100%;
    height: 0.4rem;
    border-radius: 1rem;
    background: var(--border);
    overflow: hidden;
}

.timer__fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
}

.timer--low .timer__value {
    color: var(--danger);
}

.timer--low .timer__fill {
    background: var(--danger);
}

.zone-letter {
    position: absolute;
    top: 0.5rem;
    left: 0.75rem;
    color: #fff;
    font-size: clamp(2.5rem, 7vw, 4.5rem);
    font-weight: 900;
    line-height: 1;
    text-shadow: 0 0.2rem 1rem rgb(0 0 0 / 0.7);
}

.overlay {
    position: absolute;
    inset: 0;
    display: grid;
    gap: 1rem;
    place-content: center;
    justify-items: center;
    padding: 1.5rem;
    background: rgb(2 6 23 / 0.75);
    text-align: center;
}

.overlay--clear {
    background: rgb(2 6 23 / 0.35);
}

.overlay--result {
    background: rgb(2 6 23 / 0.85);
}

.overlay__text {
    max-width: 30rem;
    margin: 0;
    font-size: 1.15rem;
}

.overlay__caption {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: 0.05em;
}

.countdown {
    font-size: clamp(4rem, 15vw, 9rem);
    font-weight: 900;
    line-height: 1;
}

.result__title {
    margin: 0;
    font-size: clamp(2rem, 5vw, 3rem);
}

.result__stats {
    display: flex;
    gap: 2rem;
    margin: 0;
}

.result__stats div {
    display: grid;
    gap: 0.2rem;
}

.result__stats dt {
    color: var(--muted);
    font-size: 0.9rem;
}

.result__stats dd {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
}

.result__score {
    color: var(--accent);
}

.result__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
}

.game__hint {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
    text-align: center;
}

.game__footer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
}

.game__ranking {
    width: min(100%, 32rem);
    margin-inline: auto;
}

.spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 4px solid rgb(255 255 255 / 0.2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 760px) {
    .game__bar {
        grid-template-columns: 1fr auto;
    }

    .timer {
        grid-column: 1 / -1;
        grid-row: 2;
    }
}
</style>
