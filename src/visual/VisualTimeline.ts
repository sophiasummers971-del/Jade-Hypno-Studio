import type { Session } from '../domain/schema';
import { timelineForSession } from '../domain/scriptBuilder';
export function visualTimeline(session: Session, wordsPerMinute: number) { return timelineForSession(session, wordsPerMinute).filter((item) => item.enabled); }
