const MAX_BYTES = 20 * 1024 * 1024;
const ZIP_HEADER = 0x504b0304;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin !== env.DASHBOARD_ORIGIN) return new Response(null, { status: 403 });

    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    };
    const reply = (body, status) => Response.json(body, { headers, status });
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    if (request.method !== 'POST') return reply({ error: 'Use POST to upload a file.' }, 405);
    if (request.headers.get('Content-Type') !== 'application/zip') {
      return reply({ error: 'Choose a ZIP file.' }, 415);
    }

    const length = Number(request.headers.get('Content-Length'));
    if (!Number.isSafeInteger(length) || length < 4 || length > MAX_BYTES) {
      return reply({ error: 'Choose a non-empty ZIP file up to 20 MiB.' }, 413);
    }
    const clientIp = request.headers.get('CF-Connecting-IP');
    const limit = await env.UPLOAD_LIMIT.limit({ key: clientIp ?? 'unknown' });
    if (!limit.success) return reply({ error: 'Too many uploads. Wait a minute and try again.' }, 429);

    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== length || new DataView(bytes).getUint32(0) !== ZIP_HEADER) {
      return reply({ error: 'The file is not a valid ZIP upload.' }, 422);
    }

    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const receipt = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    try {
      await env.RESULTS_INBOX.put(`pending/${receipt}.zip`, bytes, {
        httpMetadata: { contentType: 'application/zip' },
      });
    } catch {
      return reply({ error: 'The upload could not be stored. Try again.' }, 503);
    }
    return reply({ receipt }, 201);
  },
};
