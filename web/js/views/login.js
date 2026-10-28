// Màn hình đăng nhập: hiện trước mọi màn hình khác; đăng nhập xong mới nạp và tính dữ liệu.
import { accountsStatus, login, takeNotice } from '../auth.js';
import { hasLogo, logoMark, ORG_NAME } from '../ui/brand.js';
import { html } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export function renderLogin(root, { onSuccess }) {
  const notice = takeNotice();
  const { error } = accountsStatus();
  root.innerHTML = String(html`<main class="login" id="login-main">
    <section class="login__brand" aria-labelledby="login-title">
      <div class="login__logo${hasLogo() ? ' login__logo--seal' : ''}">${logoMark('login__mark', `Logo ${ORG_NAME}`)}</div>
      <p class="login__org">${ORG_NAME}</p>
      <h1 class="login__title" id="login-title">Dashboard chất lượng giảng dạy <span>Blended Learning</span></h1>
      <p class="login__lead">Theo dõi chất lượng giảng dạy theo 7 phương diện, phát hiện sớm lớp học phần cần hỗ trợ và đo hiệu quả cải tiến qua từng đợt đánh giá.</p>
    </section>
    <section class="login__panel">
      <form class="login__card" id="login-form" novalidate aria-labelledby="login-heading">
        <h2 class="login__heading" id="login-heading">Đăng nhập</h2>
        <p class="login__hint">Dùng tài khoản do quản trị hệ thống cấp.</p>
        ${notice ? html`<p class="login__notice" role="status">${icon('info', { size: 16 })}<span>${notice}</span></p>` : ''}
        ${error ? html`<p class="login__error login__error--static">${error}</p>` : ''}
        <div class="form-field">
          <label for="login-user">Tên đăng nhập</label>
          <input class="input" id="login-user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
        </div>
        <div class="form-field">
          <label for="login-pass">Mật khẩu</label>
          <span class="pass-field">
            <input class="input" id="login-pass" name="password" type="password" autocomplete="current-password" required>
            <button type="button" class="pass-field__toggle" data-toggle-pass aria-controls="login-pass" aria-label="Hiện mật khẩu">${icon('eye', { size: 18 })}<span>Hiện</span></button>
          </span>
        </div>
        <label class="check"><input type="checkbox" name="remember"> Ghi nhớ đăng nhập trên máy này (7 ngày)</label>
        <p class="login__error" id="login-error" role="alert"></p>
        <button type="submit" class="btn btn--primary login__submit">${icon('arrowRight')}<span>Đăng nhập</span></button>
        <p class="login__help">Quên mật khẩu hoặc cần tài khoản mới? Liên hệ quản trị hệ thống (Nhóm nghiên cứu Nội dung 3).</p>
      </form>
      <p class="login__foot">Bản MVP · dữ liệu mô phỏng · Nội dung 3 – đề tài đánh giá chất lượng giảng dạy BL tại ${ORG_NAME}</p>
    </section>
  </main>`);

  const form = root.querySelector('#login-form');
  const err = root.querySelector('#login-error');
  const submit = form.querySelector('.login__submit');
  const label = submit.querySelector('span');
  let countdown = null;

  // Báo một lần qua vùng thông báo; số giây còn lại chỉ đếm trên nút (không đọc lặp mỗi giây).
  const lockFor = (seconds) => {
    clearInterval(countdown);
    let left = seconds;
    submit.disabled = true;
    err.textContent = `Nhập sai nhiều lần – tạm khóa ${seconds} giây, sau đó thử lại.`;
    const tick = () => {
      label.textContent = `Thử lại sau ${left} giây`;
      if (left-- <= 0) {
        clearInterval(countdown);
        submit.disabled = false;
        label.textContent = 'Đăng nhập';
        err.textContent = '';
      }
    };
    tick();
    countdown = setInterval(tick, 1000);
  };

  root.querySelector('[data-toggle-pass]').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const input = form.elements.password;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    btn.querySelector('span').textContent = show ? 'Ẩn' : 'Hiện';
    input.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    if (!username || !password) {
      err.textContent = 'Nhập tên đăng nhập và mật khẩu.';
      (username ? form.elements.password : form.elements.username).focus();
      return;
    }
    submit.disabled = true;
    label.textContent = 'Đang kiểm tra…';
    err.textContent = '';
    const res = await login(username, password, { remember: form.elements.remember.checked });
    label.textContent = 'Đăng nhập';
    if (res.ok) return onSuccess(res.account);
    submit.disabled = false;
    form.elements.password.select();
    if (res.code === 'locked') return lockFor(res.wait);
    err.textContent = {
      invalid: `Tên đăng nhập hoặc mật khẩu chưa đúng.${res.left <= 2 ? ` Còn ${res.left} lần thử trước khi tạm khóa 30 giây.` : ''}`,
      disabled: 'Tài khoản này đã bị khóa. Liên hệ quản trị hệ thống.',
      storage: 'Trình duyệt đang chặn bộ nhớ của trang (chế độ riêng tư?) nên chưa lưu được phiên đăng nhập.',
    }[res.code];
  });

  form.elements.username.focus();
}
