import {useEffect, useRef, useState} from 'react';
import {androidBytes, downloadUrl, installedAndroidPack, installAndroidPack, removeAndroidPack, packageChanged} from './decoder/androidPack';

export function AndroidModelSettings() {
  const [installed, setInstalled] = useState(false), [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(0), [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let mounted = true;
    const read = () => {void installedAndroidPack().then(ready => {if (mounted) setInstalled(ready);});};
    read();
    window.addEventListener(packageChanged, read);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(packageChanged);
    if (channel) channel.onmessage = read;
    return () => {mounted = false; window.removeEventListener(packageChanged, read); channel?.close(); controller.current?.abort();};
  }, []);
  async function install(file?: File) {
    if (controller.current) return;
    const pending = new AbortController();
    controller.current = pending; setBusy(true); setReceived(0); setMessage('');
    try {await installAndroidPack(file, pending.signal, setReceived); setInstalled(true);}
    catch (error) {setMessage(pending.signal.aborted ? 'Installation canceled.' : error instanceof Error ? error.message : 'Installation failed. Try again.');}
    finally {controller.current = null; setBusy(false);}
  }
  return <fieldset><legend>Optional FP16 model</legend>
    <p>512-token context · {androidBytes.toLocaleString()} bytes. Android qualification is pending.</p>
    {installed ? <button type="button" onClick={() => {void removeAndroidPack().then(() => setInstalled(false)).catch(() => setMessage('Could not remove the model.'));}}>Remove model</button>
      : <>{downloadUrl && <button type="button" disabled={busy} onClick={() => {void install();}}>Download model</button>}
        <label>Install model file <input type="file" disabled={busy} onChange={event => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
          if (file) void install(file);
        }}/></label></>}
    {busy && <><progress aria-label="Model installation progress" max={androidBytes} value={received}/>
      <button type="button" onClick={() => controller.current?.abort()}>Cancel installation</button></>}
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
