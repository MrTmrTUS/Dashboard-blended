// Phân loại ý kiến tự do theo nhân tố + sắc thái + chủ đề (mục 5.5).
// Bản MVP dùng bộ quy tắc từ khóa (chạy được ngay trên trình duyệt); khi bật Ollama,
// cùng định dạng kết quả {nhan_to, sac_thai, chu_de} được lấy từ mô hình ngôn ngữ.
import { NEGATIVE_MARKERS, POSITIVE_MARKERS, TOPICS, TOPIC_BY_ID } from '../data/topics.js';

const norm = (s) => ` ${String(s || '').toLowerCase().normalize('NFC')} `;

export function classifyComment(text) {
  const t = norm(text);
  let best = null;
  for (const topic of TOPICS) {
    for (const kw of topic.keywords) {
      const pos = t.indexOf(kw);
      if (pos >= 0) {
        // ưu tiên từ khóa dài hơn; nếu bằng nhau, ưu tiên ý xuất hiện sau ("…, nhưng …")
        const score = kw.length * 10 + pos / 1000;
        if (!best || score > best.score) best = { topic, score };
      }
    }
  }
  let neg = 0;
  let pos = 0;
  for (const m of NEGATIVE_MARKERS) if (t.includes(m)) neg++;
  for (const m of POSITIVE_MARKERS) if (t.includes(m)) pos++;
  // "nhưng", "chỉ có điều": vế sau quyết định sắc thái
  const turn = t.search(/ nhưng | chỉ có điều | tuy nhiên /);
  if (turn >= 0) {
    const tail = t.slice(turn);
    let tn = 0;
    let tp = 0;
    for (const m of NEGATIVE_MARKERS) if (tail.includes(m)) tn++;
    for (const m of POSITIVE_MARKERS) if (tail.includes(m)) tp++;
    neg += tn;
    pos += tp;
  }
  const sentiment = neg > pos ? 'tieu_cuc' : pos > neg ? 'tich_cuc' : 'trung_tinh';
  const topic = best ? best.topic : TOPIC_BY_ID.khac;
  return { nhan_to: topic.factor, chu_de: topic.id, sac_thai: sentiment, engine: 'rules' };
}

// Chuẩn hóa nhãn trả về từ mô hình: nhãn ngoài danh mục → "khác".
export function normalizeLabel(label) {
  const topic = TOPIC_BY_ID[label?.chu_de];
  const validFactors = new Set(TOPICS.map((t) => t.factor));
  const sentiments = new Set(['tich_cuc', 'tieu_cuc', 'trung_tinh']);
  return {
    nhan_to: validFactors.has(label?.nhan_to) ? label.nhan_to : 'khac',
    chu_de: topic ? topic.id : 'khac',
    sac_thai: sentiments.has(label?.sac_thai) ? label.sac_thai : 'trung_tinh',
    engine: label?.engine || 'llm',
  };
}
