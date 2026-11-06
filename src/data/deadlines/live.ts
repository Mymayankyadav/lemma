// N56.2 owns the live command adapter. N56.1 leaves live writes explicitly unimplemented.
import {emptyDeadlineApi} from './contract';
import type {DeadlineApi} from './contract';
export function createLiveDeadlineApi():DeadlineApi{return emptyDeadlineApi();}
