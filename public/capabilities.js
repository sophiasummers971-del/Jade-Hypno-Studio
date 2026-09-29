'use strict';
const byId = (id) => document.getElementById(id);
const say = (id, text) => {
  byId(id).textContent = text;
};
say(
  'environment',
  `Page protocol: ${location.protocol} · IndexedDB: ${typeof indexedDB !== 'undefined' ? 'API present' : 'unavailable'} · Secure randomness: ${Boolean(globalThis.crypto?.getRandomValues)}`,
);
say(
  'fullscreen-result',
  document.fullscreenEnabled
    ? 'Fullscreen API reports availability; use the button to test.'
    : 'Fullscreen not reported available by this host.',
);
say(
  'codecs',
  `Reported codecs — WAV: ${byId('audio-preview').canPlayType('audio/wav') || 'none'}; MP3: ${byId('audio-preview').canPlayType('audio/mpeg') || 'none'}; MP4: ${byId('video-preview').canPlayType('video/mp4') || 'none'}; WebM: ${byId('video-preview').canPlayType('video/webm') || 'none'}. Actual playback depends on the selected file and WebView.`,
);
function probe(write) {
  try {
    const request = indexedDB.open('jade-capability-probe', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('probe');
    request.onerror = () =>
      say('storage', `IndexedDB failed: ${request.error?.name}`);
    request.onblocked = () =>
      say('storage', 'Probe blocked by another window.');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('probe', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('probe');
      if (write) store.put(new Date().toISOString(), 'marker');
      const read = store.get('marker');
      tx.oncomplete = () => {
        say(
          'storage',
          read.result
            ? `Persistent test marker: ${read.result}. Reload and confirm this same value remains.`
            : 'IndexedDB opened. No marker yet; write one, then reload.',
        );
        db.close();
      };
      tx.onabort = () => {
        say('storage', `Probe aborted: ${tx.error?.name}`);
        db.close();
      };
    };
  } catch (error) {
    say('storage', `IndexedDB unavailable: ${error.message}`);
  }
}
probe(false);
byId('write-probe').onclick = () => probe(true);
byId('reload').onclick = () => location.reload();
byId('durable').onclick = async () => {
  try {
    say(
      'durability',
      navigator.storage?.persist
        ? (await navigator.storage.persist())
          ? 'Persistent storage granted by this browser. Uninstall/clear-data still removes it.'
          : 'Persistent storage not granted. Keep external JSON backups.'
        : 'Persistent-storage request API unavailable. Keep external JSON backups.',
    );
  } catch (error) {
    say('durability', `Request failed: ${error.message}`);
  }
};
byId('export').onclick = () => {
  const url = URL.createObjectURL(
    new Blob(
      [JSON.stringify({ jadeCapabilityProbe: 1, note: 'Local download test' })],
      { type: 'application/json' },
    ),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'jade-capability-test.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  say(
    'download',
    'Download requested. Check device Downloads before marking this capability verified.',
  );
};
byId('json').onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    say('json-result', 'Too large for this diagnostic (4 MiB maximum).');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      JSON.parse(String(reader.result));
      say('json-result', 'JSON selected and parsed locally. No data stored.');
    } catch {
      say('json-result', 'Selected file is not valid JSON.');
    }
  };
  reader.onerror = () => say('json-result', 'File could not be read.');
  reader.readAsText(file);
};
const urls = new Map();
for (const kind of ['image', 'audio', 'video']) {
  byId(kind).onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const previous = urls.get(kind);
    if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(file);
    urls.set(kind, url);
    const preview = byId(`${kind}-preview`);
    preview.hidden = false;
    preview.src = url;
    say(
      `${kind}-result`,
      `${kind} selected locally. ${kind === 'image' ? 'Waiting for image decode.' : 'Press Play to verify playback.'}`,
    );
  };
  const preview = byId(`${kind}-preview`);
  preview.addEventListener(kind === 'image' ? 'load' : 'playing', () =>
    say(
      `${kind}-result`,
      kind === 'image'
        ? 'Local image decoded successfully.'
        : `Local ${kind} playback started.`,
    ),
  );
  preview.addEventListener('error', () =>
    say(`${kind}-result`, 'This file could not be decoded by this browser.'),
  );
}
byId('fullscreen').onclick = async () => {
  try {
    await document.documentElement.requestFullscreen();
    say(
      'fullscreen-result',
      document.fullscreenElement
        ? 'Fullscreen entered.'
        : 'Request completed without fullscreen.',
    );
  } catch (error) {
    say(
      'fullscreen-result',
      `Fullscreen unavailable or denied: ${error.message}`,
    );
  }
};
window.addEventListener('pagehide', () => {
  for (const url of urls.values()) URL.revokeObjectURL(url);
});
