// Băm mật khẩu PBKDF2-HMAC-SHA256, muối ngẫu nhiên 16 byte – tệp tài khoản không chứa mật khẩu gốc.
// Dùng Web Crypto khi có; trang mở qua HTTP thường (máy chủ nội bộ) không có crypto.subtle nên dùng
// bản JavaScript bên dưới, cho cùng kết quả (kiểm thử đối chiếu với node:crypto).

export const PBKDF2_ITERATIONS = 100000;

const enc = new TextEncoder();
export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export const fromHex = (hex) => Uint8Array.from(String(hex).match(/[0-9a-f]{2}/gi) ?? [], (h) => parseInt(h, 16));

export function newSalt() {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const pass = enc.encode(String(password).normalize('NFC'));
  const salt = fromHex(saltHex);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const key = await subtle.importKey('raw', pass, 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
      return toHex(new Uint8Array(bits));
    } catch {
      /* dùng bản JavaScript */
    }
  }
  return toHex(pbkdf2Sha256(pass, salt, iterations));
}

export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = newSalt();
  return { salt, iterations, hash: await deriveKey(password, salt, iterations) };
}

export async function verifyPassword(password, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const h = await deriveKey(password, rec.salt, rec.iterations || PBKDF2_ITERATIONS);
  const expected = String(rec.hash).toLowerCase();
  if (h.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ---- SHA-256, HMAC, PBKDF2 bằng JavaScript (FIPS 180-4, RFC 2104, RFC 8018) ------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

function compress(H, W, block, off) {
  for (let i = 0; i < 16; i++) {
    const j = off + i * 4;
    W[i] = (block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3];
  }
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
    const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
    W[i] = W[i - 16] + s0 + W[i - 7] + s1;
  }
  let [a, b, c, d, e, f, g, h] = H;
  for (let i = 0; i < 64; i++) {
    const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  H[0] += a;
  H[1] += b;
  H[2] += c;
  H[3] += d;
  H[4] += e;
  H[5] += f;
  H[6] += g;
  H[7] += h;
}

// Băm tiếp `msg` từ trạng thái `state` (đã băm `prefixLen` byte trước đó).
function finish(state, msg, prefixLen, W) {
  const H = Uint32Array.from(state);
  const block = new Uint8Array((((msg.length + 9 + 63) >> 6) << 6));
  block.set(msg);
  block[msg.length] = 0x80;
  const bits = (prefixLen + msg.length) * 8;
  const view = new DataView(block.buffer);
  view.setUint32(block.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(block.length - 4, bits >>> 0);
  for (let off = 0; off < block.length; off += 64) compress(H, W, block, off);
  return H;
}

function wordsToBytes(words, out = new Uint8Array(words.length * 4)) {
  for (let i = 0; i < words.length; i++) {
    out[i * 4] = words[i] >>> 24;
    out[i * 4 + 1] = words[i] >>> 16;
    out[i * 4 + 2] = words[i] >>> 8;
    out[i * 4 + 3] = words[i];
  }
  return out;
}

export function sha256(data) {
  return wordsToBytes(finish(IV, data, 0, new Uint32Array(64)));
}

function hmacStates(key, W) {
  const k = key.length > 64 ? sha256(key) : key;
  const ipad = new Uint8Array(64).fill(0x36);
  const opad = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < k.length; i++) {
    ipad[i] ^= k[i];
    opad[i] ^= k[i];
  }
  const inner = Uint32Array.from(IV);
  const outer = Uint32Array.from(IV);
  compress(inner, W, ipad, 0);
  compress(outer, W, opad, 0);
  return { inner, outer };
}

export function hmacSha256(key, msg) {
  const W = new Uint32Array(64);
  const st = hmacStates(key, W);
  return wordsToBytes(finish(st.outer, wordsToBytes(finish(st.inner, msg, 64, W)), 64, W));
}

// PBKDF2-HMAC-SHA256 cho khóa 32 byte (một khối). Mỗi vòng chỉ nén 2 khối nhờ giữ sẵn trạng thái ipad/opad.
export function pbkdf2Sha256(password, salt, iterations) {
  const W = new Uint32Array(64);
  const st = hmacStates(password, W);
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  first[salt.length + 3] = 1;
  const U = finish(st.outer, wordsToBytes(finish(st.inner, first, 64, W)), 64, W);
  const T = Uint32Array.from(U);
  // Khối 64 byte của thông điệp 32 byte sau khối pad: 0x80, rồi độ dài (64 + 32) × 8 = 768 bit.
  const block = new Uint8Array(64);
  block[32] = 0x80;
  block[62] = 0x03;
  const H = new Uint32Array(8);
  for (let i = 1; i < iterations; i++) {
    wordsToBytes(U, block);
    H.set(st.inner);
    compress(H, W, block, 0);
    wordsToBytes(H, block);
    U.set(st.outer);
    compress(U, W, block, 0);
    for (let j = 0; j < 8; j++) T[j] ^= U[j];
  }
  return wordsToBytes(T);
}
