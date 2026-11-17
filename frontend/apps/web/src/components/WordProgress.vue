<script setup lang="ts">
withDefaults(
    defineProps<{
        word: string;
        /** Index of the current letter. */
        position: number;
        /** Show the letters that are not spelled yet. */
        revealed?: boolean;
    }>(),
    { revealed: true },
);
</script>

<template>
    <ol class="word" :aria-label="`Słowo ${word}`">
        <li
            v-for="(letter, index) in word"
            :key="index"
            class="word__letter"
            :class="{
                'word__letter--done': index < position,
                'word__letter--current': index === position,
            }"
            :aria-current="index === position ? 'step' : undefined"
        >
            {{ revealed || index <= position ? letter : '' }}
        </li>
    </ol>
</template>

<style scoped>
.word {
    display: flex;
    gap: 0.6rem;
    justify-content: center;
    margin: 0;
    padding: 0;
    list-style: none;
}

.word__letter {
    display: grid;
    place-items: center;
    width: clamp(2.75rem, 8vw, 4.5rem);
    aspect-ratio: 1;
    border: 2px solid var(--border);
    border-radius: 0.75rem;
    background: var(--surface);
    color: var(--muted);
    font-size: clamp(1.5rem, 4.5vw, 2.6rem);
    font-weight: 800;
    transition:
        background 150ms ease,
        transform 150ms ease;
}

.word__letter--done {
    border-color: #22c55e;
    background: #166534;
    color: #fff;
}

.word__letter--current {
    border-color: var(--accent);
    color: var(--text);
    transform: translateY(-0.25rem);
    box-shadow: 0 0 0 4px rgb(56 189 248 / 0.25);
}
</style>
