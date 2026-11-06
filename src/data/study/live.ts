// Live study adapter. Placeholder until N16 replaces this file with reads from the N10 tables and writes through
// public.study_command.
import { emptyStudyApi, type StudyApi } from './contract';

export function createLiveStudyApi(): StudyApi {
 return emptyStudyApi('live');
}
