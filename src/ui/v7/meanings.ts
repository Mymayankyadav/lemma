import {ArrowLeftRight, BookOpen, CheckSquare, Flag, Layers, Target} from 'lucide-react';
import type {ComponentType, SVGProps} from 'react';
import {CardMark, ChangedMark, ConstellationMark, DeadlineMark, PracticeMark, SuggestedMark} from './marks';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
/**
 * N156 · v7 UX audit r3, P6 (IC1, IC5; Owner decision E21): one glyph per meaning, one meaning per glyph. `Layers` was
 * Review, Cards, a card, cards due, practice due and "Switch path"; `Target` was checkpoints and practice; `Flag` both
 * a target date and a deadline; `Star` and `Waypoints` both the Atlas. Screens take their icon from here.
 */
export const MEANING_ICON = {
  review: Layers,
  card: CardMark,
  practice: PracticeMark,
  switchPath: ArrowLeftRight,
  concepts: ConstellationMark,
  checkpoint: Target,
  targetDate: Flag,
  deadline: DeadlineMark,
  task: CheckSquare,
  changed: ChangedMark,
  suggested: SuggestedMark,
  study: BookOpen,
} as const satisfies Record<string, Icon>;
export type Meaning = keyof typeof MEANING_ICON;
