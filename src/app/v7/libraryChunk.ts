import {lazy} from 'react';
import {createLazyModule} from '../lazyModule';

export const libraryChunk=createLazyModule(()=>import('./LibrarySplit'));
export const LibrarySplit=lazy(libraryChunk.read);
