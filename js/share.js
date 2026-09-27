// Encode a whole scene into a short URL-safe string so a drawing
// can live entirely inside a link (no server needed on GitHub Pages).

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encodeScene(scene) {
  const bytes = new TextEncoder().encode(JSON.stringify(scene));
  if (canCompress()) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'z' + toB64(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return 'j' + toB64(bytes);
}

export async function decodeScene(code) {
  const kind = code[0], bytes = fromB64(code.slice(1));
  if (kind === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
