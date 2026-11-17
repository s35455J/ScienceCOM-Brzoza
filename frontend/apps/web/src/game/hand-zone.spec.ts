import { describe, expect, it } from 'vitest';
import { isHandInZone, zoneFor } from './hand-zone';

function landmarksAt(x: number, y: number) {
    return Array.from({ length: 21 }, (_, index) => ({ x: x + index * 0.001, y, z: 0 }));
}

describe('zoneFor', () => {
    it('is a square in pixels', () => {
        const zone = zoneFor('RIGHT', 1280, 720);
        expect(zone.width * 1280).toBeCloseTo(zone.height * 720);
    });

    it('places the right hand zone on the left of the (not mirrored) image', () => {
        const right = zoneFor('RIGHT', 640, 480);
        const left = zoneFor('LEFT', 640, 480);

        expect(right.x + right.width / 2).toBeLessThan(0.5);
        expect(left.x + left.width / 2).toBeGreaterThan(0.5);
    });

    it('stays inside the frame', () => {
        for (const [width, height] of [
            [640, 480],
            [480, 640],
            [1920, 1080],
        ] as const) {
            const zone = zoneFor('LEFT', width, height);
            expect(zone.x).toBeGreaterThanOrEqual(0);
            expect(zone.x + zone.width).toBeLessThanOrEqual(1);
        }
    });
});

describe('isHandInZone', () => {
    const zone = { x: 0.2, y: 0.2, width: 0.4, height: 0.6 };

    it('is true when every landmark is inside', () => {
        expect(isHandInZone(landmarksAt(0.3, 0.5), zone)).toBe(true);
    });

    it('is false when a landmark is outside', () => {
        const landmarks = landmarksAt(0.3, 0.5);
        landmarks[8] = { x: 0.7, y: 0.5, z: 0 };
        expect(isHandInZone(landmarks, zone)).toBe(false);
    });

    it('is false without landmarks', () => {
        expect(isHandInZone([], zone)).toBe(false);
    });
});
