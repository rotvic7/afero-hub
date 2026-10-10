import { parseHunterCsv } from './afero-csv-core.js';

self.onmessage = async ({ data }) => {
  try {
    const parsed = await parseHunterCsv(new Uint8Array(data));
    // Small messages keep deserialization on the UI thread below a frame budget.
    for (let offset = 0; offset < parsed.rows.length; offset += 250) {
      self.postMessage({ rows: parsed.rows.slice(offset, offset + 250) });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    self.postMessage({ meta: parsed.meta, done: true });
  } catch (error) {
    self.postMessage({ error: { code: error.code || 'invalid_csv', message: error.message || 'Não foi possível ler o CSV.' } });
  }
};
