import {useEffect, useRef, useState} from 'react';
import {Button, Field} from '../../../ui/v7/components';
import {
  androidBytes, downloadUrl, installedAndroidPack, installedModelHasOfflineSupport, installAndroidPack,
  modelDownloadUrl, packageChanged, removeAndroidPack, webModelInstall,
} from './decoder/androidPack';

export function AndroidModelSettings({canInstall}: {canInstall: boolean}) {
  const [installed, setInstalled] = useState<boolean>(), [offlineReady, setOfflineReady] = useState(false);
  const [stage, setStage] = useState<'package' | 'support'>();
  const [received, setReceived] = useState(0), [message, setMessage] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [removing, setRemoving] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const busy = stage !== undefined;
  useEffect(() => {
    let mounted = true;
    let readVersion = 0;
    const read = () => {
      const version = ++readVersion;
      void Promise.all([installedAndroidPack(), installedModelHasOfflineSupport()]).then(([ready, offline]) => {
        if (mounted && version === readVersion) {setInstalled(ready); setOfflineReady(offline);}
      });
    };
    read();
    window.addEventListener(packageChanged, read);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(packageChanged);
    if (channel) channel.onmessage = read;
    return () => {mounted = false; window.removeEventListener(packageChanged, read); channel?.close(); controller.current?.abort();};
  }, []);

  async function install(source?: File | URL) {
    if (controller.current || removing) return;
    const pending = new AbortController();
    controller.current = pending;
    setStage('package'); setReceived(0); setMessage('');
    try {
      await installAndroidPack(source, pending.signal, setReceived, () => setStage('support'));
      setInstalled(true);
      if (webModelInstall) setOfflineReady(true);
      setCustomUrl('');
    } catch (error) {
      setMessage(pending.signal.aborted ? 'Installation canceled.' : error instanceof Error ? error.message : 'Installation failed. Try again.');
    } finally {controller.current = null; setStage(undefined);}
  }

  async function remove() {
    setRemoving(true); setMessage('');
    try {await removeAndroidPack(); setInstalled(false); setOfflineReady(false);}
    catch {setMessage('Could not remove the model.');}
    finally {setRemoving(false);}
  }

  function installFromLink() {
    const url = modelDownloadUrl(customUrl);
    if (url) void install(url);
    else setMessage('Enter a direct HTTPS download link for the model package.');
  }

  if (!webModelInstall && !canInstall && !installed) return null;
  const status = installed === undefined ? 'Checking for a saved model…'
    : stage === 'support' ? 'Saving the runtime and word suggestions for offline use…'
    : busy ? received === androidBytes ? 'Verifying model files…' : 'Downloading or reading the model package…'
    : installed ? offlineReady && webModelInstall ? 'Downloaded and available offline.' : 'Model installed on this device.'
    : canInstall ? 'Download the 68 MB model package. A first offline setup also saves up to 36 MB of support files.'
    : 'Turn on Try faster typing to install and use the suggestion model.';
  return <fieldset className={'writing-aid-package' + (webModelInstall ? ' writing-aid-package-web' : '')}>
    <legend>{webModelInstall ? 'Suggestion model' : 'Optional FP16 model'}</legend>
    {webModelInstall ? <p role="status">{status}{installed && !canInstall ? ' Turn on Try faster typing to use it.' : ''}</p>
      : <p>512-token context · {androidBytes.toLocaleString()} bytes. {canInstall
        ? 'The typing experiment can use this model when installed and fall back to the count model.'
        : 'The model is installed on this device. Turn on the typing experiment to use it.'}</p>}
    {installed && <div className="writing-aid-package-actions">
      {webModelInstall && !offlineReady && <Button type="button" small disabled={busy || removing}
        onClick={() => {void install();}}>Prepare for offline use</Button>}
      <Button type="button" small disabled={busy || removing} onClick={() => {void remove();}}>Remove model</Button>
    </div>}
    {installed === false && canInstall && <>
      {downloadUrl && <Button type="button" small disabled={busy} onClick={() => {void install();}}>Download model</Button>}
      {webModelInstall && <>
        <Field label="Custom model download link" hint="Use a direct HTTPS link that allows downloads from this app." type="url" inputMode="url" autoCapitalize="off" spellCheck={false} autoComplete="off"
          value={customUrl} disabled={busy} onChange={event => {setCustomUrl(event.currentTarget.value); setMessage('');}}
          onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); installFromLink();}}}/>
        <Button type="button" small disabled={busy || !customUrl.trim()} onClick={installFromLink}>
          {message && customUrl.trim() ? 'Retry custom download' : 'Download from link'}
        </Button>
      </>}
      <label className="writing-aid-package-file">Install model file <input type="file" disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
        if (file) void install(file);
      }}/></label>
    </>}
    {busy && <>
      {stage === 'package' && <progress aria-label="Model installation progress" max={androidBytes} value={received}/>}
      <Button type="button" small onClick={() => controller.current?.abort()}>Cancel installation</Button>
    </>}
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
