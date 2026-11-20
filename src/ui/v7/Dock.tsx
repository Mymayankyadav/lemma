import type {ComponentPropsWithoutRef} from 'react';
import './dock.css';

type Props = ComponentPropsWithoutRef<'div'> & {inset?: 'page' | 'edge'};

export function Dock({className, inset = 'page', ...props}: Props) {
  return <div {...props} className={['v7-pinned-dock', className].filter(Boolean).join(' ')} data-inset={inset}/>;
}
