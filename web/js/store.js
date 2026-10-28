// Trạng thái ứng dụng và lưu trữ cục bộ.
// Bản MVP lưu thao tác của người dùng trong trình duyệt (localStorage / IndexedDB);
// bản chính thức lưu trong PostgreSQL trên máy chủ của Trường (mục 5.4).

const PREFIX = 'tdu-bl:';

export function load(key, fallback) {
  try {
    const s = localStorage.getItem(PREFIX + key);
    return s === null ? fallback : JSON.parse(s);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* bỏ qua */
  }
}

// ---- IndexedDB cho bộ dữ liệu nhập (có mảng Uint8Array, kích thước lớn) -----------
function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no-idb'));
    const req = indexedDB.open('tdu-bl', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const idb = {
  async get(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const r = db.transaction('kv').objectStore('kv').get(key);
        r.onsuccess = () => resolve(r.result ?? null);
        r.onerror = () => reject(r.error);
      });
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch {
      return false;
    }
  },
  async del(key) {
    try {
      const db = await openDb();
      await new Promise((resolve) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    } catch {
      /* bỏ qua */
    }
  },
};

// ---- Trạng thái dùng chung ---------------------------------------------------------
export const state = {
  dataset: null,
  datasetKey: 'synthetic',
  mart: null,
  cfg: null,
  account: null, // tài khoản đăng nhập (không kèm mã băm)
  user: null, // người dùng hiệu lực: chính tài khoản, hoặc vai trò quản trị đang "xem thử"
  users: [],
  version: 0,
};

const listeners = new Map();
export function onEvent(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name).delete(fn);
}
export function emit(name, payload) {
  for (const fn of listeners.get(name) || []) fn(payload);
}

const ns = (key) => `${state.datasetKey}:${key}`;

// ---- Kế hoạch cải tiến (PDCA) --------------------------------------------------------
export const plans = {
  all() {
    const stored = load(ns('plans'), null);
    if (stored) return stored;
    return (state.dataset?.seedPlans || []).map((p) => ({ ...p }));
  },
  saveAll(list) {
    save(ns('plans'), list);
  },
  upsert(plan) {
    const list = plans.all();
    const i = list.findIndex((p) => p.id === plan.id);
    if (i >= 0) list[i] = { ...list[i], ...plan, updatedAt: new Date().toISOString() };
    else list.push({ ...plan, id: plan.id || nextPlanId(list), createdAt: new Date().toISOString() });
    plans.saveAll(list);
    return list;
  },
  remove(id) {
    plans.saveAll(plans.all().filter((p) => p.id !== id));
  },
};

function nextPlanId(list) {
  const max = list.reduce((m, p) => Math.max(m, Number(String(p.id).replace(/\D/g, '')) || 0), 0);
  return `KH-${String(max + 1).padStart(4, '0')}`;
}

// ---- Cấu hình và lịch sử thay đổi ----------------------------------------------------
export const configStore = {
  overrides() {
    return load('config', {});
  },
  history() {
    return load('config-history', []);
  },
  apply(changes, user, note = '') {
    const current = configStore.overrides();
    const hist = configStore.history();
    const time = new Date().toISOString();
    for (const { key, from, to } of changes) {
      current[key] = to;
      hist.unshift({ time, userId: user.id, userName: user.name, role: user.roleLabel, account: state.account?.username, key, from, to, note });
    }
    save('config', current);
    save('config-history', hist.slice(0, 300));
  },
  reset(user, defaults) {
    const hist = configStore.history();
    hist.unshift({ time: new Date().toISOString(), userId: user.id, userName: user.name, role: user.roleLabel, account: state.account?.username, key: '*', from: 'tùy chỉnh', to: 'mặc định', note: 'Khôi phục mặc định' });
    save('config', {});
    save('config-history', hist.slice(0, 300));
    return defaults;
  },
};

// ---- Nhật ký truy cập: đăng nhập, đăng xuất và mọi lượt xem dữ liệu cấp sinh viên --------
// Luôn ghi tài khoản đăng nhập thật, kể cả khi quản trị đang "xem thử" dưới vai trò khác.
export const accessLog = {
  add(entry) {
    const list = load('access-log', []);
    list.unshift({ time: new Date().toISOString(), account: state.account?.username, ...entry });
    save('access-log', list.slice(0, 1000));
  },
  list() {
    return load('access-log', []);
  },
  clear() {
    save('access-log', []);
  },
};

// ---- Ô "đã liên hệ" ở M3 --------------------------------------------------------------
export const contacted = {
  map() {
    return load(ns('contacted'), {});
  },
  set(key, value, user) {
    const m = contacted.map();
    if (value) m[key] = { time: new Date().toISOString(), by: user.name };
    else delete m[key];
    save(ns('contacted'), m);
  },
};

// ---- Phản hồi 👍/👎 cho văn bản AI (phục vụ TC4) ------------------------------------
export const feedback = {
  list() {
    return load('ai-feedback', []);
  },
  get(target, userId) {
    return feedback.list().find((f) => f.target === target && f.userId === userId) || null;
  },
  set(entry) {
    const list = feedback.list().filter((f) => !(f.target === entry.target && f.userId === entry.userId));
    if (entry.value) list.unshift({ time: new Date().toISOString(), ...entry });
    save('ai-feedback', list.slice(0, 2000));
  },
};

// ---- Phiếu SUS (TC3) --------------------------------------------------------------------
export const sus = {
  list() {
    return load('sus', []);
  },
  add(resp) {
    const list = sus.list();
    list.push({ time: new Date().toISOString(), ...resp });
    save('sus', list);
  },
  clear() {
    save('sus', []);
  },
};

// ---- Chấm AI của 2 chuyên gia (TC4) -----------------------------------------------------
export const grading = {
  all() {
    return load(ns('grading'), { E1: { summaries: {}, comments: {} }, E2: { summaries: {}, comments: {} } });
  },
  set(expert, kind, itemId, value) {
    const g = grading.all();
    g[expert] ||= { summaries: {}, comments: {} };
    if (value === null) delete g[expert][kind][itemId];
    else g[expert][kind][itemId] = value;
    save(ns('grading'), g);
  },
  clear() {
    save(ns('grading'), { E1: { summaries: {}, comments: {} }, E2: { summaries: {}, comments: {} } });
  },
};

// ---- Trạng thái công bố đợt và thư viện biện pháp do người dùng chỉnh -------------------
export const waveStatus = {
  map() {
    return load(ns('wave-status'), {});
  },
  publish(waveId, user) {
    const m = waveStatus.map();
    m[waveId] = { status: 'published', publishedAt: new Date().toISOString(), by: user.name };
    save(ns('wave-status'), m);
  },
};

export const measureStore = {
  overlay() {
    return load(ns('measures'), { added: [], changed: {} });
  },
  add(measure) {
    const o = measureStore.overlay();
    o.added.push(measure);
    save(ns('measures'), o);
  },
  change(code, patch) {
    const o = measureStore.overlay();
    const added = o.added.find((m) => m.code === code);
    if (added) Object.assign(added, patch);
    else o.changed[code] = { ...(o.changed[code] || {}), ...patch };
    save(ns('measures'), o);
  },
};

export const aiReview = {
  approved() {
    return load(ns('ai-approved'), {});
  },
  approve(key, user) {
    const m = aiReview.approved();
    m[key] = { time: new Date().toISOString(), by: user.name };
    save(ns('ai-approved'), m);
  },
};

export const notifRead = {
  set() {
    return new Set(load(ns('notif-read'), []));
  },
  markAll(ids) {
    const s = notifRead.set();
    ids.forEach((id) => s.add(id));
    save(ns('notif-read'), [...s].slice(-500));
  },
};

export function resetLocalData() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* bỏ qua */
  }
}
