import {CalendarPlus,Layers,Route,Settings as SettingsIcon,CheckSquare,Star,Sun,Target,Timer,Play} from 'lucide-react';
import type {ComponentType,SVGProps} from 'react';
import {CloseDayMark} from '../../ui/v7/marks';
import type {SearchGroupName} from './searchModel';

type Icon=ComponentType<SVGProps<SVGSVGElement>>;
/** One icon per search group (F74/I-23: concepts use the star, not the sparkle). */
export const searchGroupIcon:Record<SearchGroupName,Icon>={Paths:Route,Checkpoints:Target,Cards:Layers,Concepts:Star,Tasks:CheckSquare,Settings:SettingsIcon,Actions:Play};
/** SE2: each action has its own icon; Close the day uses the drawn I-14 mark (F08). */
export const searchActionIcon:Record<string,Icon>={'action:focus':Timer,'action:review':Layers,'action:block':CalendarPlus,'action:close':CloseDayMark,'action:day':Sun};
export const searchActionIds=['action:focus','action:review','action:block','action:close','action:day'] as const;
