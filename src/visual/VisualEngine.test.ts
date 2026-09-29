import { describe, expect, it, vi } from 'vitest';
import { VisualEngine } from './VisualEngine';
import { createBlock, createSessionFromTemplate } from '../domain/scriptBuilder';
import { defaultSettings } from '../domain/schema';

describe('VisualEngine',()=>{ it('follows audio snapshots rather than creating a second playback clock',async()=>{ let listener:(s:any)=>void=()=>{}; const audio:any={subscribe:vi.fn((l:any)=>{listener=l;l({state:'idle',currentBlockId:null,elapsedSeconds:0,error:null});return()=>{};}),playSession:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn()}; const e=new VisualEngine(audio); const s=createSessionFromTemplate('x','blank',defaultSettings);const b=createBlock();b.narration='caption';s.blocks=[b];await e.playSession(s);listener({state:'playing',currentBlockId:b.id,elapsedSeconds:3,error:null});let snap:any;e.subscribe(x=>snap=x)();expect(snap.currentBlockId).toBe(b.id);expect(snap.caption).toBe('caption');e.pause();expect(audio.pause).toHaveBeenCalled();e.stop();expect(audio.stop).toHaveBeenCalled();e.dispose(); }); });
