import type { Repository } from '../storage/repository';
export interface LifecycleCallbacks {
  isDirty(): boolean;
  flush(): Promise<void>;
  requestClose(): Promise<boolean>;
  report(message: string, problem: unknown): void;
}
export type Lifecycle = (callbacks: LifecycleCallbacks) => Promise<() => void>;
export interface Platform {
  repository: Repository;
  lifecycle: Lifecycle;
  storageLabel: string;
}
