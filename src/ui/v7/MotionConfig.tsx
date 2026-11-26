import type {ReactNode} from 'react';
import {MotionConfig} from 'motion/react';
import {useMotionReduced} from './effects';
import {durations} from './motion';

export function V7MotionConfig({children}: {children: ReactNode}) {
  const reduced = useMotionReduced();
  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={reduced ? {duration: durations.reduced} : undefined}>
    {children}
  </MotionConfig>;
}
