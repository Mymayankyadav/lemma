import {CalendarPlus,Route,Settings as SettingsIcon,Sun,Timer,Play} from 'lucide-react';
import {MEANING_ICON} from '../../ui/v7/meanings';
import type {ComponentType,SVGProps} from 'react';
import {CloseDayMark} from '../../ui/v7/marks';
import type {SearchGroupName} from './searchModel';

type Icon=ComponentType<SVGProps<SVGSVGElement>>;
/** One icon per search group; N156 (IC1): a card is a card, concepts the constellation, from the one meaning table. */
export const searchGroupIcon:Record<SearchGroupName,Icon>={Paths:Route,Checkpoints:MEANING_ICON.checkpoint,Cards:MEANING_ICON.card,Concepts:MEANING_ICON.concepts,Tasks:MEANING_ICON.task,Settings:SettingsIcon,Actions:Play};
/** SE2: each action has its own icon; Close the day uses the drawn I-14 mark (F08). */
export const searchActionIcon:Record<string,Icon>={'action:focus':Timer,'action:review':MEANING_ICON.review,'action:block':CalendarPlus,'action:close':CloseDayMark,'action:day':Sun};
export const searchActionIds=['action:focus','action:review','action:block','action:close','action:day'] as const;
