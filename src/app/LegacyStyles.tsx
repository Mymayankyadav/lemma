import type {ReactNode} from 'react';
import '../ui/v6/tokens.css';
import '../ui/v6/mockup.css';
import '../ui/v6/mockup-bindings.css';
import './v6-atlas-shell.css';

export default function LegacyStyles({children}: {children: ReactNode}) {
  return <>{children}</>;
}
