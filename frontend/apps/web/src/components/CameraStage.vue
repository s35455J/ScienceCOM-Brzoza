<script setup lang="ts">
import type { Hand } from '@sllapp/hand-landmarker-vue';
import { computed, ref, useTemplateRef, watch } from 'vue';
import type { Zone } from '../game/hand-zone';

export type ZoneState = 'idle' | 'outside' | 'inside' | 'holding' | 'done';

const props = defineProps<{
    hand: Hand | null;
    zone: Zone;
    mirrored: boolean;
    zoneState: ZoneState;
    /** 0–1 */
    holdProgress: number;
}>();

const emit = defineEmits<{ 'frame-size': [width: number, height: number] }>();

const video = useTemplateRef<HTMLVideoElement>('video');
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
const frame = ref({ width: 4, height: 3 });

// Bones of the 21 MediaPipe hand landmarks.
const CONNECTIONS: readonly [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]; // prettier-ignore

function onMetadata(): void {
    const element = video.value;
    if (element && element.videoWidth > 0 && element.videoHeight > 0) {
        frame.value = { width: element.videoWidth, height: element.videoHeight };
        emit('frame-size', element.videoWidth, element.videoHeight);
    }
}

function draw(hand: Hand | null): void {
    const element = canvas.value;
    const context = element?.getContext('2d');
    if (!element || !context) {
        return;
    }
    const { width, height } = frame.value;
    if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
    }
    context.clearRect(0, 0, width, height);
    if (hand === null) {
        return;
    }
    const points = hand.landmarks.map(({ x, y }) => [x * width, y * height] as const);
    const scale = Math.max(width, height) / 640;

    context.lineCap = 'round';
    context.lineWidth = 4 * scale;
    context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    context.beginPath();
    for (const [from, to] of CONNECTIONS) {
        const a = points[from];
        const b = points[to];
        if (a && b) {
            context.moveTo(a[0], a[1]);
            context.lineTo(b[0], b[1]);
        }
    }
    context.stroke();

    context.fillStyle = '#38bdf8';
    for (const [x, y] of points) {
        context.beginPath();
        context.arc(x, y, 5 * scale, 0, Math.PI * 2);
        context.fill();
    }
}

watch(() => props.hand, draw);

const aspect = computed(() => frame.value.width / frame.value.height);

const zoneStyle = computed(() => ({
    left: `${props.zone.x * 100}%`,
    top: `${props.zone.y * 100}%`,
    width: `${props.zone.width * 100}%`,
    height: `${props.zone.height * 100}%`,
}));

/** The zone position in the displayed (possibly mirrored) view, for text that must not flip. */
const zoneLabelStyle = computed(() => {
    const left = props.mirrored ? 1 - props.zone.x - props.zone.width : props.zone.x;
    return {
        left: `${left * 100}%`,
        top: `${props.zone.y * 100}%`,
        width: `${props.zone.width * 100}%`,
        height: `${props.zone.height * 100}%`,
    };
});

const RING_RADIUS = 46;
const ringLength = 2 * Math.PI * RING_RADIUS;
const ringOffset = computed(() => ringLength * (1 - Math.min(Math.max(props.holdProgress, 0), 1)));

defineExpose({ video });
</script>

<template>
    <div class="stage" :style="{ '--aspect': aspect }">
        <div class="stage__layer" :class="{ 'stage__layer--mirrored': mirrored }">
            <video
                ref="video"
                class="stage__video"
                muted
                playsinline
                @loadedmetadata="onMetadata"
            />
            <canvas ref="canvas" class="stage__canvas" />
            <div class="stage__shade" :style="zoneStyle" />
            <div class="zone" :class="`zone--${zoneState}`" :style="zoneStyle" />
        </div>
        <div class="stage__labels">
            <div class="zone-label" :style="zoneLabelStyle">
                <slot name="zone" />
                <svg
                    v-if="holdProgress > 0"
                    class="zone-label__ring"
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                >
                    <circle class="zone-label__track" cx="50" cy="50" :r="RING_RADIUS" />
                    <circle
                        class="zone-label__progress"
                        cx="50"
                        cy="50"
                        :r="RING_RADIUS"
                        :stroke-dasharray="ringLength"
                        :stroke-dashoffset="ringOffset"
                    />
                </svg>
            </div>
            <slot />
        </div>
    </div>
</template>

<style scoped>
.stage {
    position: relative;
    width: min(100%, calc((100dvh - 15rem) * var(--aspect)));
    min-width: min(100%, 20rem);
    aspect-ratio: var(--aspect);
    margin-inline: auto;
    border-radius: 1rem;
    overflow: hidden;
    background: #000;
    box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.45);
}

.stage__layer,
.stage__labels {
    position: absolute;
    inset: 0;
}

.stage__layer--mirrored {
    transform: scaleX(-1);
}

.stage__video,
.stage__canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
}

/* Darkens everything outside the zone. */
.stage__shade {
    position: absolute;
    box-shadow: 0 0 0 100vmax rgb(2 6 23 / 0.45);
    pointer-events: none;
}

.zone {
    position: absolute;
    border: 4px dashed rgb(255 255 255 / 0.8);
    border-radius: 1rem;
    transition:
        border-color 120ms ease,
        box-shadow 120ms ease;
}

.zone--outside {
    border-color: #f97316;
}

.zone--inside {
    border-style: solid;
    border-color: #38bdf8;
}

.zone--holding {
    border-style: solid;
    border-color: #a3e635;
    box-shadow: 0 0 2rem rgb(163 230 53 / 0.5);
}

.zone--done {
    border-style: solid;
    border-color: #22c55e;
    box-shadow: 0 0 3rem rgb(34 197 94 / 0.7);
}

.zone-label {
    position: absolute;
    pointer-events: none;
}

.zone-label__ring {
    position: absolute;
    right: 0.75rem;
    bottom: 0.75rem;
    width: 4.5rem;
    height: 4.5rem;
    transform: rotate(-90deg);
}

.zone-label__track,
.zone-label__progress {
    fill: none;
    stroke-width: 8;
}

.zone-label__track {
    stroke: rgb(255 255 255 / 0.25);
}

.zone-label__progress {
    stroke: #a3e635;
    stroke-linecap: round;
}
</style>
