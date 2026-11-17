<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SelectedHand } from '../api/session-client';
import { SUPPORTED_LETTERS, WORD_LENGTH } from '../game/words';
import RankingPanel from './RankingPanel.vue';

export interface Player {
    nickname: string;
    hand: SelectedHand;
}

const props = defineProps<{
    initial?: Player | null;
    /** An error to show, for example a nickname that the backend rejected. */
    error?: string | null;
}>();

const emit = defineEmits<{ start: [player: Player] }>();

const MAX_NICKNAME_LENGTH = 20;

const nickname = ref(props.initial?.nickname ?? '');
const hand = ref<SelectedHand>(props.initial?.hand ?? 'RIGHT');
const touched = ref(false);

/** The backend rules: 1–20 code points after trimming, no control or format characters. */
const nicknameError = computed(() => {
    const value = nickname.value.trim();
    const length = [...value].length;
    if (length === 0) {
        return 'Podaj swój nick.';
    }
    if (length > MAX_NICKNAME_LENGTH) {
        return `Nick może mieć najwyżej ${MAX_NICKNAME_LENGTH} znaków.`;
    }
    if (/[\p{Cc}\p{Cf}]/u.test(value)) {
        return 'Nick zawiera niedozwolone znaki.';
    }
    return null;
});

function submit(): void {
    touched.value = true;
    if (nicknameError.value === null) {
        emit('start', { nickname: nickname.value.trim(), hand: hand.value });
    }
}
</script>

<template>
    <div class="start">
        <section class="start__intro">
            <h1 class="start__title">Przeliteruj słowo w PJM</h1>
            <p class="start__lead">
                Wylosujemy {{ WORD_LENGTH }}-literowe słowo. Pokaż kolejne litery alfabetu palcowego
                w ramce na obrazie z kamery, zanim skończy się czas.
            </p>

            <form class="card form" novalidate @submit.prevent="submit">
                <label class="form__field">
                    <span class="form__label">Nick</span>
                    <input
                        v-model="nickname"
                        class="input"
                        name="nickname"
                        autocomplete="nickname"
                        maxlength="40"
                        placeholder="np. Ola"
                        :aria-invalid="touched && nicknameError !== null"
                        @blur="touched = true"
                    />
                </label>
                <p v-if="touched && nicknameError" class="form__error" role="alert">
                    {{ nicknameError }}
                </p>
                <p v-else-if="error" class="form__error" role="alert">{{ error }}</p>

                <fieldset class="form__field hands">
                    <legend class="form__label">Którą ręką będziesz migać?</legend>
                    <label class="hands__option">
                        <input v-model="hand" type="radio" name="hand" value="LEFT" />
                        <span>Lewą</span>
                    </label>
                    <label class="hands__option">
                        <input v-model="hand" type="radio" name="hand" value="RIGHT" />
                        <span>Prawą</span>
                    </label>
                </fieldset>

                <button type="submit" class="button button--primary button--large">Zagraj</button>
            </form>

            <ol class="steps">
                <li>Zezwól przeglądarce na użycie kamery.</li>
                <li>Umieść dłoń w całości w podświetlonej ramce.</li>
                <li>Pokaż literę i przytrzymaj znak, aż kółko postępu się zapełni.</li>
                <li>Za każdą literę dostajesz punkty, a za szybkie ukończenie słowa – bonus.</li>
            </ol>
            <p class="start__letters">
                Litery w grze: <strong>{{ SUPPORTED_LETTERS.join(' ') }}</strong>
            </p>
        </section>

        <RankingPanel class="start__ranking" />
    </div>
</template>

<style scoped>
.start {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
    gap: 2rem;
    align-items: start;
}

.start__title {
    margin: 0 0 0.5rem;
    font-size: clamp(1.8rem, 4vw, 2.75rem);
}

.start__lead {
    margin: 0 0 1.5rem;
    color: var(--muted);
    font-size: 1.1rem;
    max-width: 40rem;
}

.form {
    display: grid;
    gap: 1rem;
    max-width: 30rem;
}

.form__field {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    border: 0;
}

.form__label {
    font-weight: 600;
}

.form__error {
    margin: -0.5rem 0 0;
    color: var(--danger);
}

.hands {
    grid-template-columns: 1fr 1fr;
}

.hands legend {
    margin-bottom: 0.4rem;
}

.hands__option {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    padding: 0.75rem 1rem;
    border: 2px solid var(--border);
    border-radius: 0.75rem;
    cursor: pointer;
}

.hands__option:has(input:checked) {
    border-color: var(--accent);
    background: rgb(56 189 248 / 0.12);
}

.hands__option input {
    accent-color: var(--accent);
}

.steps {
    margin: 1.5rem 0 0.75rem;
    padding-left: 1.25rem;
    color: var(--muted);
    line-height: 1.7;
}

.start__letters {
    margin: 0;
    color: var(--muted);
}

.start__letters strong {
    color: var(--text);
    letter-spacing: 0.08em;
}

@media (max-width: 760px) {
    .start {
        grid-template-columns: 1fr;
    }
}
</style>
