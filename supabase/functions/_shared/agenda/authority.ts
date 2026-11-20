import type { Interleaving, PreparedTask } from './types.ts';

export function tutorState(task:PreparedTask, now:number) {
  if (!task.remaining) return 'resolved';
  if (task.expiry <= now) return 'expired';
  if (task.declined) return 'declined';
  if (task.due <= now) return 'missed';
  if (task.authority === 'confirmed' || (task.authority === 'delegated' &&
      task.severity >= 3 && task.remaining <= 10)) return 'authorized';
  return 'awaiting approval';
}

export function canOfferTip({atBoundary, alreadyMixed, urgent, offered, headroom,
  typicalMinutes, alternativeMinutes, promptMinutes, switchMinutes}:Interleaving & {headroom:number}) {
  if (!atBoundary || alreadyMixed || urgent || offered || typicalMinutes <= 0 ||
      alternativeMinutes <= 0) return false;
  const ordinary = Math.floor(headroom / typicalMinutes);
  const leftover = headroom - promptMinutes - switchMinutes - alternativeMinutes;
  return ordinary >= 1 && leftover >= 0 && 1 + Math.floor(leftover / typicalMinutes) >= ordinary;
}
