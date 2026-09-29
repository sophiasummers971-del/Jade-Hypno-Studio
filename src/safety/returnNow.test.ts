import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RETURN_NOW_ACTION,
  RETURN_NOW_EVENT,
  registerReturnNowHooks,
  returnNow,
} from './returnNow';

describe('RETURN NOW contract', () => {
  afterEach(() => {
    registerReturnNowHooks({})();
    document.body.innerHTML = '';
  });

  it('runs the permanent shutdown sequence without consulting session data', async () => {
    const order: string[] = [];
    const media = document.createElement('audio');
    const pause = vi.spyOn(media, 'pause').mockImplementation(() => undefined);
    document.body.append(media);
    const onReturned = () => order.push('ordinary-interface');
    window.addEventListener(RETURN_NOW_EVENT, onReturned, { once: true });
    registerReturnNowHooks({
      stopNarration: () => {
        order.push('narration');
      },
      stopActiveMedia: () => {
        order.push('media');
      },
      stopVisualEffects: () => {
        order.push('visuals');
      },
      fadeOrStopAudio: () => {
        order.push('audio');
      },
      clearTemporarySessionState: () => {
        order.push('clear');
      },
    });
    const hostileSessionData = {
      returnNow: false,
      RETURN_NOW_ACTION: 'disabled',
    };
    expect(hostileSessionData.returnNow).toBe(false);
    await returnNow();
    expect(order).toEqual([
      'narration',
      'media',
      'visuals',
      'audio',
      'clear',
      'ordinary-interface',
    ]);
    expect(pause).toHaveBeenCalled();
    expect(RETURN_NOW_ACTION).toEqual({
      id: 'return-now',
      label: 'RETURN NOW',
    });
    expect(Object.isFrozen(RETURN_NOW_ACTION)).toBe(true);
  });
});
