// CSV, kiểm tra tệp nhập (Phụ lục A), bộ kiểm số AI, xóa thông tin nhận diện.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv } from '../web/js/core/csv.js';
import { checkText, extractNumbers } from '../web/js/core/factcheck.js';
import { fmtScore, fmtSigned, parseViNumber } from '../web/js/core/format.js';
import { normalizeSemester, parseDateTime, validateCsv } from '../web/js/core/importer.js';
import { redact } from '../web/js/core/redact.js';
import { classifyComment } from '../web/js/ai/classify.js';
import { cfg } from './helpers.mjs';

test('CSV: dấu ngoặc kép, xuống dòng trong ô, BOM, dấu chấm phẩy', () => {
  const text = '﻿a;b;c\r\n1;"x;y";"dòng 1\ndòng 2"\r\n2;"nói ""chào""";\r\n';
  const p = parseCsv(text);
  assert.equal(p.delimiter, ';');
  assert.deepEqual(p.header, ['a', 'b', 'c']);
  assert.equal(p.rows[0].b, 'x;y');
  assert.equal(p.rows[0].c, 'dòng 1\ndòng 2');
  assert.equal(p.rows[1].b, 'nói "chào"');
  assert.deepEqual(p.lines, [2, 4]);
  const back = parseCsv(toCsv(['a', 'b'], [{ a: 'x,y', b: 'z' }]));
  assert.equal(back.rows[0].a, 'x,y');
});

test('số và ngày kiểu Việt Nam', () => {
  assert.equal(fmtScore(3.7234), '3,72');
  assert.equal(fmtSigned(-0.2), '−0,20');
  assert.equal(parseViNumber('3,72'), 3.72);
  assert.equal(parseViNumber('1.234'), 1234);
  assert.equal(parseViNumber('6.5'), 6.5);
  assert.equal(normalizeSemester('HK1 2026-2027').id, 'HK1-2627');
  assert.equal(normalizeSemester('HK2-2526').label, 'HK2 2025–2026');
  assert.equal(normalizeSemester('HK1 2026-2028'), null);
  assert.ok(parseDateTime('16/10/2026 08:30'));
  assert.equal(parseDateTime('31/02/2026'), null);
});

const CLASS_HEADER = 'ma_lop_hp,ten_hoc_phan,ma_khoa,ma_giang_vien,hoc_ky,si_so';

test('danh mục lớp: báo lỗi theo dòng (trống, học kỳ sai, sĩ số, trùng mã)', () => {
  const csv = [
    CLASS_HEADER,
    'L1,Marketing căn bản,KT,GV01,HK1-2627,32',
    'L2,,KT,GV01,HK1-2627,30',
    'L3,Kinh tế vi mô,KT,GV02,HK7-2627,30',
    'L4,Kinh tế vi mô,KT,GV02,HK1-2627,abc',
    'L1,Marketing căn bản,KT,GV01,HK1-2627,32',
  ].join('\n');
  const r = validateCsv('danh_muc_lop', csv, {});
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => [e.line, e.column]), [[3, 'ten_hoc_phan'], [4, 'hoc_ky'], [5, 'si_so'], [6, 'ma_lop_hp']]);
  assert.equal(r.records.length, 1);
});

test('thiếu cột bắt buộc thì dừng kiểm tra', () => {
  const r = validateCsv('diem_hoc_vu', 'ma_nghien_cuu,ma_lop_hp\nNC-1,L1', {});
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /Thiếu cột bắt buộc: diem_qua_trinh, diem_hoc_phan, gpa0/);
});

test('điểm học vụ: từ chối mã sinh viên thật, điểm ngoài thang', () => {
  const csv = [
    'ma_nghien_cuu,ma_lop_hp,diem_qua_trinh,diem_hoc_phan,gpa0',
    'NC-10001,L1,"6,5",7,"3,1"',
    '2021123456,L1,6,7,3',
    'NC-10002,L1,11,7,3',
    'NC-10003,L9,6,,3',
  ].join('\n');
  const r = validateCsv('diem_hoc_vu', csv, { classIds: new Set(['L1']) });
  assert.deepEqual(r.errors.map((e) => [e.line, e.column]), [[3, 'ma_nghien_cuu'], [4, 'diem_qua_trinh'], [5, 'ma_lop_hp']]);
  assert.equal(r.records[0].process, 6.5);
  assert.equal(r.records[0].gpa0, 3.1);
});

test('bộ kiểm số phát hiện số lạ, câu thiếu mã nguồn, mã nguồn không tồn tại', () => {
  const facts = [
    { ma: 'F1', noi_dung: 'Chỉ số chất lượng 3,52; TB Trường 3,72' },
    { ma: 'F2', noi_dung: 'IN1 Học liệu số và hạ tầng 3,21; mục tiêu 3,5; thấp hơn giới hạn 2σ' },
  ];
  const good = 'Chỉ số chất lượng của lớp là 3,52, thấp hơn trung bình Trường 3,72 [F1]. IN1 đạt 3,21, dưới 3,5 và thấp hơn giới hạn 2σ [F2].';
  assert.equal(checkText(good, facts).ok, true);
  const bad = checkText('IN1 chỉ đạt 3,05 [F2]. Cần cải thiện ngay. Xem thêm [F9].', facts);
  assert.deepEqual(bad.unknownNumbers, ['3,05']);
  assert.deepEqual(bad.badCodes, ['F9']);
  assert.equal(bad.uncited.length, 1);
  assert.deepEqual(extractNumbers('BP-IN1-03 cho IN1, PS1; HK1 2026–2027; 18/32 phiếu').map((n) => n.value), [18, 32]);
});

test('xóa tên người, số điện thoại, mã số, email trong ý kiến', () => {
  const r = redact('Em là Nguyễn Văn Nam, SĐT 0912 345 678, email nam@gmail.com (MSSV 2021123456). Thầy Trần Minh trả bài chậm.');
  assert.equal(r.text, 'Em là [tên], SĐT [số điện thoại], email [email] ([mã số]). Thầy [tên] trả bài chậm.');
  assert.equal(redact('Tiếng Anh 1 hơi khó, thầy giảng dễ hiểu.').found.length, 0);
});

test('phân loại ý kiến theo chủ đề và sắc thái', () => {
  assert.deepEqual(
    (({ nhan_to, chu_de, sac_thai }) => ({ nhan_to, chu_de, sac_thai }))(classifyComment('Tài liệu trên LMS khó tìm, để lẫn lộn giữa các tuần.')),
    { nhan_to: 'IN1', chu_de: 'lms_kho_tim', sac_thai: 'tieu_cuc' },
  );
  assert.equal(classifyComment('Thầy giảng dễ hiểu, có nhiều ví dụ minh họa.').sac_thai, 'tich_cuc');
  assert.equal(classifyComment('Mong nhà trường mở rộng chỗ để xe.').nhan_to, 'khac');
  assert.equal(cfg.nMin, 10);
});
