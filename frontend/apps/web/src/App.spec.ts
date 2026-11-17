import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';
import App from './App.vue';

const tracker = vi.hoisted(() => ({ useHandTracker: vi.fn() }));

vi.mock('@sllapp/hand-landmarker-vue', () => ({ useHandTracker: tracker.useHandTracker }));

class SilentSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = 0;
    bufferedAmount = 0;
    send(): void {}
    close(): void {
        this.readyState = 3;
    }
}

beforeEach(() => {
    tracker.useHandTracker.mockImplementation(() => ({
        hand: shallowRef(null),
        isRunning: shallowRef(false),
        error: shallowRef(null),
        start: vi.fn(async () => {}),
        stop: vi.fn(),
    }));
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('[{"rank":1,"nickname":"Jan","score":540}]')),
    );
    vi.stubGlobal('WebSocket', SilentSocket);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    tracker.useHandTracker.mockReset();
});

describe('App', () => {
    it('shows the start form and the ranking', async () => {
        const wrapper = mount(App);
        await flushPromises();

        expect(wrapper.find('input[name="nickname"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Jan');
        expect(wrapper.text()).toContain('540 pkt');
    });

    it('requires a nickname', async () => {
        const wrapper = mount(App);
        await wrapper.get('form').trigger('submit');

        expect(wrapper.get('[role="alert"]').text()).toBe('Podaj swój nick.');
        expect(tracker.useHandTracker).not.toHaveBeenCalled();
    });

    it('starts the game with the selected hand', async () => {
        const wrapper = mount(App);
        await wrapper.get('input[name="nickname"]').setValue('  Ola ');
        await wrapper.get('input[value="LEFT"]').setValue(true);
        await wrapper.get('form').trigger('submit');

        expect(wrapper.text()).toContain('Ola');
        expect(wrapper.text()).toContain('lewa ręka');
        expect(tracker.useHandTracker).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ preferredHand: 'Left' }),
        );
    });
});
