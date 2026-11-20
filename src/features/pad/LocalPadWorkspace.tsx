import {useState} from 'react';
import {isNative} from '../../platform/native';
import {LocalPadEditor} from './LocalPadEditor';
import {LocalPadInk} from './LocalPadInk';
import {makePadFile, startPadDownload} from './padExport';
import type {PadEdit} from './padEdit';
import type {PadInkHistory} from './padInk';

interface Props {
  value: PadEdit;
  onEdit: (value: PadEdit) => void;
  onSendSelection?: (text: string) => void;
  ink: PadInkHistory;
  onInk: (history: PadInkHistory) => void;
}

export function LocalPadWorkspace({value, onEdit, ink, onInk, onSendSelection}: Props) {
  const [result, setResult] = useState('');
  const [exporting, setExporting] = useState(false);
  async function exportFile(format: 'backup' | 'readable') {
    if (exporting) return;
    setExporting(true);
    try {
      const file = makePadFile(value, ink.strokes, format);
      if (isNative()) {
        const {shareFile} = await import('../../platform/files');
        const blob = new Blob([file.contents], {type: file.type.split(';')[0]});
        if (!await shareFile(blob, file.filename, 'Save your Local Pad')) throw new Error('Share sheet unavailable');
        setResult('Choose where to save your Pad.');
      } else {
        startPadDownload(file);
        setResult('Pad export started.');
      }
    } catch {
      setResult('Could not start the export. Your Pad is unchanged.');
    } finally {setExporting(false);}
  }
  return <section className="local-pad" aria-label="Local Pad workspace">
    <LocalPadEditor value={value} onEdit={onEdit} onSendSelection={onSendSelection}/>
    <LocalPadInk history={ink} onInk={onInk}/>
    <div className="local-pad-controls" role="group" aria-label="Pad export">
      <button type="button" disabled={exporting} onClick={() => void exportFile('readable')}>Export readable Pad</button>
      <button type="button" disabled={exporting} onClick={() => void exportFile('backup')}>Export Pad backup</button>
    </div>
    <p role="status">{result}</p>
  </section>;
}
