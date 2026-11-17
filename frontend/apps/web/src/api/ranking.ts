import { config } from '../config';

/** One row of `GET /api/ranking` (see `docs/api.md`). */
export interface RankingEntry {
    rank: number;
    nickname: string;
    score: number;
}

export async function fetchRanking(
    limit = 10,
    fetchImpl: typeof fetch = fetch,
): Promise<RankingEntry[]> {
    const response = await fetchImpl(`${config.backendUrl}/api/ranking?limit=${limit}`, {
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
        throw new Error(`Ranking request failed with status ${response.status}.`);
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
        throw new Error('Unexpected ranking response.');
    }
    return body.map((entry: Record<string, unknown>) => ({
        rank: Number(entry.rank),
        nickname: String(entry.nickname),
        score: Number(entry.score),
    }));
}
