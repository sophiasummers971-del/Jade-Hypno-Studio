import { describe, expect, it } from 'vitest';
import { createBlock } from '../domain/scriptBuilder';
import { effectClass, effectStyle } from './effects';
describe('visual effects',()=>{ it('applies conservative effects and suppresses motion when requested',()=>{ const s=createBlock().visualSettings; s.zoomAmount=3;s.pulseAmount=1;s.fixation='spiral'; expect(effectClass(s,false)).toContain('visual-slow-zoom'); expect(effectClass(s,true)).toBe(''); expect(effectStyle(s,true).transform).toBe('none'); }); });
