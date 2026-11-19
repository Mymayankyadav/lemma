import {useState} from 'react';
import {LocalPadEditor} from './LocalPadEditor';
import {LocalPadInk} from './LocalPadInk';
import {makePadFile, startPadDownload} from './padExport';
import type {PadEdit} from './padEdit';
import type {PadInkHistory} from './padInk';

interface Props {
  value: PadEdit;
  onEdit: (value: PadEdit) => void;
  ink: PadInkHistory;
  onInk: (history: PadInkHistory) => void;
}

/** Still unmounted: the owner/checkpoint host owns reads and transactional writes. */
export function LocalPadWorkspace({value, onEdit, ink, onInk}: Props) {
  const [result, setResult] = useState('');
  function exportFile(format: 'backup' | 'readable') {
    try {
      startPadDownload(makePadFile(value, ink.strokes, format));
      setResult('Pad export started.');
    } catch {
      setResult('Could not start the export. Your Pad is unchanged.');
    }
  }
  return <section className="local-pad" aria-label="Local Pad workspace">
    <LocalPadEditor value={value} onEdit={onEdit}/>
    <LocalPadInk history={ink} onInk={onInk}/>
    <div className="local-pad-controls" role="group" aria-label="Pad export">
      <button type="button" onClick={() => exportFile('readable')}>Export readable Pad</button>
      <button type="button" onClick={() => exportFile('backup')}>Export Pad backup</button>
    </div>
    <p role="status">{result}</p>
  </section>;
}
