import {saveTutorModelWasmForOffline} from '../../input/modelAssets';
import {saveCompleteLexiconForOffline} from './completeLexicon';
import {fetchVerifiedTypeaheadFile} from './assets';
import general from '../../../../../public/models/typeahead/ngram-v2/manifest.json';

export async function saveWritingModelSupport(signal: AbortSignal): Promise<void> {
  await saveTutorModelWasmForOffline(signal);
  await saveCompleteLexiconForOffline(signal);
  await fetchVerifiedTypeaheadFile('ngram-v2', {...general, path: general.file}, 20 * 1024 * 1024, true, signal);
}
