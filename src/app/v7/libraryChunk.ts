import {createLazyModule,lazyFromModule} from '../lazyModule';

export const libraryChunk=createLazyModule(()=>import('./LibrarySplit'));
export const LibrarySplit=lazyFromModule(libraryChunk.read);
