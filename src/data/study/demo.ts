// Demo study adapter. Placeholder until N14.2 replaces this file with the in-memory implementation.
import { emptyStudyApi, type StudyApi } from './contract';

export function createDemoStudyApi(): StudyApi {
 return emptyStudyApi('demo');
}
