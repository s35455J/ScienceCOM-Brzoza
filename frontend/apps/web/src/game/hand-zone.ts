import type { Landmark } from '@sllapp/hand-landmarker-vue';

/** A rectangle in normalized image coordinates (0–1) of the camera frame, before mirroring. */
export interface Zone {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type ZoneSide = 'LEFT' | 'RIGHT';

/** Height of the square zone as a part of the frame height. */
const ZONE_HEIGHT = 0.7;

/**
 * Returns a square zone (in pixels of the frame) for the player's hand.
 * The camera image is not mirrored: the player's right hand is on the left side of the image,
 * so the zone for the right hand is on the left of the image (and on the right of a mirrored view).
 */
export function zoneFor(hand: ZoneSide, frameWidth: number, frameHeight: number): Zone {
    const aspect = frameWidth > 0 && frameHeight > 0 ? frameWidth / frameHeight : 4 / 3;
    const height = ZONE_HEIGHT;
    const width = Math.min(height / aspect, 0.9);
    const centerX = hand === 'RIGHT' ? 0.32 : 0.68;
    const x = clamp(centerX - width / 2, 0.02, 0.98 - width);
    const y = (1 - height) / 2;
    return { x, y, width, height };
}

/**
 * True when every landmark is inside the zone. `tolerance` allows points slightly outside,
 * as a part of the frame size.
 */
export function isHandInZone(
    landmarks: readonly Landmark[],
    zone: Zone,
    tolerance = 0.02,
): boolean {
    if (landmarks.length === 0) {
        return false;
    }
    return landmarks.every(
        ({ x, y }) =>
            x >= zone.x - tolerance &&
            x <= zone.x + zone.width + tolerance &&
            y >= zone.y - tolerance &&
            y <= zone.y + zone.height + tolerance,
    );
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
