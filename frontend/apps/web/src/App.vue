<script setup lang="ts">
import { ref } from 'vue';
import GameScreen from './components/GameScreen.vue';
import StartScreen, { type Player } from './components/StartScreen.vue';

const player = ref<Player | null>(null);
const playing = ref(false);
const startError = ref<string | null>(null);

function start(next: Player): void {
    player.value = next;
    startError.value = null;
    playing.value = true;
}

function exit(error?: string): void {
    startError.value = error ?? null;
    playing.value = false;
}
</script>

<template>
    <div class="app">
        <header class="app__header">
            <span class="app__logo" aria-hidden="true">🤟</span>
            <span class="app__name">SLLAPP</span>
            <span class="app__tagline">Nauka polskiego alfabetu palcowego</span>
        </header>
        <main class="app__main">
            <GameScreen
                v-if="playing && player"
                :nickname="player.nickname"
                :hand="player.hand"
                @exit="exit"
            />
            <StartScreen v-else :initial="player" :error="startError" @start="start" />
        </main>
    </div>
</template>
