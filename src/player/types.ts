export type PlayerState = 'idle'|'preparing'|'ready'|'playing'|'paused'|'stopping'|'completed'|'error';
export type PlayerSnapshot={state:PlayerState;currentBlockId:string|null;elapsedSeconds:number;progress:number;caption:string;error:string|null};
export type PlayerCapabilities={fullscreen:boolean;speech:boolean;audioContext:boolean;objectUrls:boolean;reducedMotion:boolean};
