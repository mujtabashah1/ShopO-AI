import api from './api';

// Incremental parser: network chunks need not align with SSE lines or events.
export function createEventParser(onEvent) {
  let buffer = '';
  return chunk => {
    buffer += chunk;
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      let event = 'message';
      const data = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) onEvent(event, data.join('\n'));
    }
  };
}

export function openSearchStream(params) {
  const controller = new AbortController();
  const listeners = new Map();
  const stream = {
    close: () => controller.abort(),
    addEventListener: (name, listener) => listeners.set(name, listener)
  };
  const emit = (name, data) => {
    if (!controller.signal.aborted) listeners.get(name)?.({ data });
  };
  // Start after callers have attached their listeners.
  Promise.resolve().then(async () => {
    let finished = false;
    const timeout = setTimeout(() => {
      emit('error', JSON.stringify({ message: 'Search timed out. Please try again.' }));
      controller.abort();
    }, 300000);
    try {
      const base = api.defaults.baseURL.replace(/\/$/, '');
      const response = await fetch(`${base}/products/search/stream?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('smartshop_token') || ''}` },
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('smartshop_token');
          localStorage.removeItem('smartshop_user');
          window.location.assign('/login');
        }
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Search unavailable (${response.status}). Please retry.`);
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
        throw new Error('The search service returned an unexpected response. Please retry.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parse = createEventParser((name, data) => {
        if (name === 'search_complete' || name === 'cached' || name === 'error') finished = true;
        emit(name, data);
      });
      try {
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          parse(decoder.decode(value, { stream: true }));
        }
      } finally { reader.releaseLock(); }
      if (!finished && !controller.signal.aborted) throw new Error('Search connection was interrupted. Please retry.');
    } catch (error) {
      if (!controller.signal.aborted) emit('error', JSON.stringify({ message: error.message || 'Search failed. Please retry.' }));
    } finally { clearTimeout(timeout); }
  });
  return stream;
}
