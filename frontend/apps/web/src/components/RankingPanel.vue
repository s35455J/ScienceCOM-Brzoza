<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { fetchRanking, type RankingEntry } from '../api/ranking';

const props = withDefaults(
    defineProps<{
        limit?: number;
        /** Change the value to load the ranking again. */
        refreshKey?: number;
        /** Highlight rows with this nickname. */
        highlight?: string;
    }>(),
    { limit: 10, refreshKey: 0, highlight: undefined },
);

const entries = ref<RankingEntry[]>([]);
const loading = ref(false);
const failed = ref(false);

async function load(): Promise<void> {
    loading.value = true;
    try {
        entries.value = await fetchRanking(props.limit);
        failed.value = false;
    } catch {
        failed.value = true;
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(() => props.refreshKey, load);
</script>

<template>
    <section class="ranking" aria-labelledby="ranking-title">
        <header class="ranking__header">
            <h2 id="ranking-title">Ranking</h2>
            <button
                type="button"
                class="button button--ghost button--small"
                :disabled="loading"
                @click="load"
            >
                Odśwież
            </button>
        </header>
        <p v-if="failed" class="ranking__message">Nie udało się pobrać rankingu z serwera.</p>
        <p v-else-if="!loading && entries.length === 0" class="ranking__message">
            Brak wyników. Bądź pierwszy!
        </p>
        <ol v-else class="ranking__list">
            <li
                v-for="entry in entries"
                :key="`${entry.rank}-${entry.nickname}-${entry.score}`"
                class="ranking__row"
                :class="{ 'ranking__row--me': highlight && entry.nickname === highlight }"
            >
                <span class="ranking__rank">{{ entry.rank }}.</span>
                <span class="ranking__name">{{ entry.nickname }}</span>
                <span class="ranking__score">{{ entry.score }} pkt</span>
            </li>
        </ol>
    </section>
</template>

<style scoped>
.ranking {
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--surface);
}

.ranking__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
}

.ranking__header h2 {
    margin: 0;
    font-size: 1.25rem;
}

.ranking__message {
    margin: 0;
    color: var(--muted);
}

.ranking__list {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.ranking__row {
    display: grid;
    grid-template-columns: 2.5rem 1fr auto;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border-radius: 0.5rem;
    background: rgb(255 255 255 / 0.03);
}

.ranking__row--me {
    background: rgb(56 189 248 / 0.18);
}

.ranking__rank {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}

.ranking__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ranking__score {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}
</style>
