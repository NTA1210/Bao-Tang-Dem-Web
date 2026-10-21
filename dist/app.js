// Kiểm tra nếu chạy nhầm bằng Node.js trực tiếp thay vì trên trình duyệt
if (typeof window === 'undefined') {
  console.error('❌ dist/app.js là mã nguồn chạy trên trình duyệt Web (Client-side), không chạy trực tiếp bằng Node.js.');
  console.error('👉 Để chạy ứng dụng, hãy chạy lệnh: npm start (hoặc npm run dev) rồi mở trình duyệt tại http://localhost:8080');
  process.exit(1);
}

import {
  LIMIT,
  TARGET,
  DEADLINE,
  scoreAttempt,
  clockParts,
  litWindows,
  bestAttempt,
  LIGHT_LEVELS,
  secondsLabel
} from './game-core.js?v=3';

const $ = id => document.getElementById(id);
const config = window.GAME_CONFIG || {};
const live = !config.demoMode && Boolean(config.supabaseUrl) && Boolean(config.supabaseAnonKey);
const STORAGE = 'toi-gio-len-den-demo-v1';

let flashTimer;
let state = 'idle';
let activeAttempt = null;
let startedAt = 0;
let frame;
let toastTimer;
let soundOn = false;
let audio;
let supabase;
let user = null;
let profile = null;
let remoteAttempts = [];
let adminRows = [];
let cur = 'splash';
const RING = 2 * Math.PI * 128;
let rankingLimit = 50;
let rankingBusy = false;

// Khởi tạo danh sách ô cửa bảo tàng
const grid = [...document.querySelectorAll('#window-grid .museum-window')];
const lightingRules = $('lighting-rules');

// ==========================================
// DEMO / LOCAL STORAGE HELPERS
// ==========================================
let demo = readDemo();

function readDemo() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE));
    if (d && Array.isArray(d.attempts)) return d;
  } catch {}
  return { attempts: [] };
}

function saveDemo() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(demo));
  } catch {
    toast('Trình duyệt không cho lưu dữ liệu. Lượt chơi chỉ giữ trong phiên này.');
  }
}

function attempts() {
  return live ? remoteAttempts : demo.attempts;
}

function remaining() {
  return Math.max(0, LIMIT - attempts().length);
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}

function shortName(name) {
  const parts = (name || 'Người chơi').trim().split(/\s+/);
  return parts.length < 2 ? parts[0] : `${parts.slice(0, -1).join(' ')} ${parts.at(-1)[0]}.`;
}

function gate() {
  if (!live) return null;
  if (!user) return 'landing';
  return profile?.profile_done ? null : 'profile';
}

function closeMenu() {
  $('menu').hidden = true;
  $('menu-btn').setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
}

// ==========================================
// ĐIỀU HƯỚNG MÀN HÌNH (SCREENS / NAVIGATION)
// ==========================================
function go(name, push = true) {
  if (!$('s-' + name)) return;
  if (['running', 'starting', 'stopping'].includes(state) && name !== 'game' && name !== 'flash') {
    toast('Hãy hoàn tất lượt chơi hiện tại.');
    return;
  }

  const prev = cur;
  document.querySelectorAll('.screen').forEach(s => {
    const on = s.id === 's-' + name;
    s.classList.toggle('active', on);
    s.inert = !on;
    s.setAttribute('aria-hidden', String(!on));
  });

  cur = name;
  document.body.dataset.screen = name;
  closeMenu();
  $('s-' + name).scrollTop = 0;

  if (name === 'board') loadRanking();
  if (name === 'profile' && prev !== 'profile') fillProfile();

  if (push && prev !== name && !['splash', 'flash'].includes(name)) {
    try {
      history.pushState({ s: name }, '');
    } catch {}
  }

  window.dispatchEvent(new CustomEvent('screen-change', { detail: { from: prev, to: name } }));
}

window.addEventListener('popstate', e => {
  const s = e.state?.s;
  if (s && s !== cur && !['running', 'starting', 'stopping'].includes(state)) {
    go(s, false);
  }
});

function route() {
  if (cur === 'splash') return;
  const g = gate();
  if (g === 'profile') {
    if (cur !== 'profile') go('profile');
    return;
  }
  if (g === 'landing') {
    if (['game', 'profile', 'result', 'flash'].includes(cur)) go('landing');
    return;
  }
  if (cur === 'profile') go('how');
}

function leaveSplash() {
  if (cur === 'splash') {
    go(gate() === 'profile' ? 'profile' : 'landing');
  }
}

window.addEventListener('splash-done', leaveSplash);
setTimeout(leaveSplash, 7000);

function setTab(tab) {
  const admin = tab === 'admin';
  $('experience').classList.toggle('active', !admin);
  $('admin').classList.toggle('active', admin);

  if (admin) {
    closeMenu();
    loadAdmin();
    return;
  }
  if (tab === 'home') return go('landing');
  if (tab === 'rules') return go('how');
  if (tab === 'ranking') return go('board');
  if (tab === 'landing' || tab === 'profile') return go(tab);

  const g = gate();
  go(g === 'landing' ? 'landing' : g === 'profile' ? 'profile' : 'game');
}

document.querySelectorAll('[data-tab]').forEach(b => {
  b.addEventListener('click', () => setTab(b.dataset.tab));
});

$('menu-btn').onclick = () => {
  const open = $('menu').hidden;
  $('menu').hidden = !open;
  $('menu-btn').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('menu').hidden) {
    closeMenu();
  }
});

$('splash-skip').onclick = () => window.dispatchEvent(new Event('splash-done'));
$('hero-cta').onclick = () => {
  if (live && gate() === 'profile') return go('profile');
  go(attempts().length ? 'game' : 'how');
};
$('how-start').onclick = () => setTab('play');
$('finale-cta').onclick = () => setTab('play');
$('again').onclick = () => (remaining() ? setTab('play') : go('board'));
$('flash-skip').onclick = () => go('result');

$('share').onclick = async () => {
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Tới Giờ Lên Đèn · BẢO TÀNG: ĐÊM',
        text: 'Mười giây. Một khoảnh khắc. Thắp sáng bảo tàng.',
        url
      });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Đã sao chép liên kết trò chơi.');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Liên kết: ' + url);
  }
};

$('google-cancel').onclick = () => {
  $('google-wait').hidden = true;
  $('landing-google').disabled = !$('landing-consent').checked;
  $('google-login').disabled = !$('consent').checked;
};

document.querySelectorAll('[data-close]').forEach(b => {
  b.addEventListener('click', () => b.closest('dialog').close());
});

$('privacy-button').onclick = () => $('privacy-dialog').showModal();
$('login-privacy').onclick = () => $('privacy-dialog').showModal();
$('account').onclick = openLogin;
$('continue-demo').onclick = () => {
  $('login-dialog').close();
  setTab('play');
};
$('account').addEventListener('click', closeMenu);

// ==========================================
// ĐĂNG NHẬP GOOGLE & QUẢN LÝ TÀI KHOẢN
// ==========================================
function openLogin() {
  if (state === 'running' || state === 'starting' || state === 'stopping') {
    toast('Hãy hoàn tất lượt chơi hiện tại.');
    return;
  }
  if (live && !user) {
    go('landing');
    return;
  }

  $('logout').hidden = !user;
  $('google-login').hidden = Boolean(user);
  $('consent-label').hidden = Boolean(user) || !live;
  $('login-description').textContent = user
    ? `Bạn đang đăng nhập với tên ${user.user_metadata?.full_name || user.email}.`
    : live
      ? 'Đăng nhập Google để tham gia bản chính thức. Mỗi tài khoản có 3 lượt cho cả chiến dịch.'
      : 'Bản chơi thử đã sẵn sàng. Đăng nhập Google sẽ được mở khi ban tổ chức hoàn tất cấu hình bản chính thức.';
  $('login-note').textContent = live
    ? 'Chỉ nhận tài khoản đã xác minh email. Không yêu cầu quyền đọc Gmail hoặc Drive.'
    : 'Bạn có thể chơi thử ngay, không cần tài khoản. Kết quả chỉ lưu trong trình duyệt này.';
  $('google-login').disabled = !live || !$('consent').checked;
  $('continue-demo').hidden = live;
  $('login-dialog').showModal();
}

$('consent').onchange = () => {
  $('google-login').disabled = !live || !$('consent').checked;
};

async function signIn(button, consent) {
  if (!live || !consent.checked) return;
  if (!supabase) {
    toast('Chưa kết nối được dịch vụ đăng nhập. Vui lòng tải lại trang và thử lại.');
    return;
  }
  button.disabled = true;
  $('google-wait').hidden = false;
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: location.origin + location.pathname,
        scopes: 'openid email profile'
      }
    });
    if (error) throw error;
  } catch (error) {
    $('google-wait').hidden = true;
    toast('Không thể đăng nhập: ' + error.message);
    button.disabled = !consent.checked;
  }
}

$('google-login').onclick = () => signIn($('google-login'), $('consent'));
$('landing-consent').onchange = () => {
  $('landing-google').disabled = !live || !$('landing-consent').checked;
};
$('landing-google').onclick = () => signIn($('landing-google'), $('landing-consent'));
$('landing-privacy').onclick = () => $('privacy-dialog').showModal();

function fillProfile() {
  const meta = user?.user_metadata || {};
  $('profile-name').value = profile?.full_name || meta.full_name || meta.name || '';
  $('profile-email').value = user?.email || '';
  setTimeout(() => $('profile-name').focus(), 50);
}

$('profile-form').onsubmit = async e => {
  e.preventDefault();
  const name = $('profile-name').value.replace(/\s+/g, ' ').trim();
  if (name.length < 2) {
    toast('Vui lòng nhập họ và tên (ít nhất 2 ký tự).');
    $('profile-name').focus();
    return;
  }
  $('profile-submit').disabled = true;
  $('profile-submit-label').textContent = 'Đang lưu…';
  try {
    const data = await api('save-profile', { name });
    profile = { full_name: data.full_name, profile_done: true };
    updateAccount();
    go('how');
    toast('Chào ' + data.full_name + '! Bạn có 3 lượt chơi.');
    loadRanking().catch(() => {});
  } catch (err) {
    toast(err.message);
  } finally {
    $('profile-submit').disabled = false;
    $('profile-submit-label').textContent = 'Vào chơi';
  }
};

$('profile-logout').onclick = async () => {
  await supabase.auth.signOut();
};

$('logout').onclick = async () => {
  await supabase.auth.signOut();
  $('login-dialog').close();
  toast('Đã đăng xuất.');
};

function updateAccount() {
  const count = attempts().length;
  const name = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || 'Người chơi';

  $('account-label').textContent = user ? shortName(name) : live ? 'Đăng nhập Google' : 'Tham gia chơi';
  $('player-name').textContent = user ? shortName(name) : live ? 'Chưa đăng nhập' : 'Khách chơi thử';

  const avatar = user?.user_metadata?.avatar_url;
  const icon = document.querySelector('.account-icon');
  icon.replaceChildren();
  if (avatar) {
    const img = document.createElement('img');
    img.src = avatar;
    img.alt = '';
    img.width = 22;
    img.height = 22;
    img.style.borderRadius = '50%';
    icon.append(img);
  } else {
    icon.textContent = '◉';
  }

  const g = gate();
  const out = live && !user;

  $('landing-consent-row').hidden = out ? false : true;
  $('landing-google').hidden = out ? false : true;
  $('hero-cta').hidden = out ? true : false;

  $('hero-cta-label').textContent = !live
    ? count ? 'Tiếp tục chơi thử' : 'Chơi thử ngay'
    : g === 'profile' ? 'Hoàn tất thông tin' : 'Vào chơi';

  $('finale-cta-label').textContent = out ? 'Đăng nhập để chơi' : remaining() ? 'Chơi ngay' : 'Về trang chủ';
  $('again-label').textContent = remaining() ? `Chơi lại · còn ${remaining()} lượt` : 'Đã hết lượt · Xem xếp hạng';
  $('remaining').textContent = live && !user ? '3 lượt / tài khoản' : `Còn ${remaining()}/3 lượt`;

  [...$('attempt-circles').children].forEach((c, i) => {
    c.classList.toggle('available', i >= count);
  });

  if (['idle', 'result'].includes(state)) {
    $('play-button').disabled = Boolean(live && !supabase) || Boolean(!remaining() && (!live || user));
    $('play-button-label').textContent = live && !user
      ? 'Đăng nhập để chơi'
      : !remaining()
        ? 'Bạn đã hoàn tất 3 lượt'
        : state === 'result' ? `Bắt đầu lượt ${count + 1}` : 'Bắt đầu';
    $('play-button-icon').innerHTML = remaining() ? '→' : '✓';
  }
}

// ==========================================
// ĐỒNG HỒ & THẮP SÁNG CÁC Ô CỬA
// ==========================================
function showClock(elapsed) {
  const c = clockParts(elapsed);
  $('clock-main').textContent = c.main;
  $('clock-ms').textContent = c.ms;
  $('progress').style.width = `${Math.min(100, (elapsed / TARGET) * 100)}%`;
  $('dial-ring').style.strokeDashoffset = RING * (1 - Math.min(1, elapsed / TARGET));
  $('scene-time').textContent = elapsed >= TARGET ? '18:00' : '17:59';
}

if (lightingRules) {
  lightingRules.replaceChildren();
  LIGHT_LEVELS.forEach((level, i) => {
    const row = document.createElement('div');
    const range = document.createElement('span');
    range.textContent = (i ? '> ' + secondsLabel(LIGHT_LEVELS[i - 1].maxDeviation) + ' – ' : '≤ ') + secondsLabel(level.maxDeviation) + ' giây';
    const lights = document.createElement('b');
    lights.textContent = level.windows + ' ô sáng';
    row.append(range, lights);
    lightingRules.append(row);
  });
}

function illuminate(count) {
  grid.forEach((w, i) => {
    w.style.transitionDelay = count ? `${350 + i * 140}ms` : '0ms';
    w.classList.toggle('on', i < count);
  });
  $('lit-count').textContent = count;
  $('lit-mini').textContent = count;
  $('result-photo').style.setProperty('--lit', String(count / 8));
  $('result-photo').setAttribute('aria-label', count + ' trên 8 ô cửa bảo tàng được thắp sáng');
  $('window-grid').setAttribute('data-count', String(count));
  $('window-dots').replaceChildren(
    ...Array.from({ length: 8 }, (_, i) => {
      const dot = document.createElement('i');
      if (i < count) dot.className = 'on';
      return dot;
    })
  );
  $('window-dots').setAttribute('aria-label', `${count} trên 8 ô cửa sáng`);
}
illuminate(0);

$('sound').onclick = async () => {
  soundOn = !soundOn;
  $('sound').setAttribute('aria-pressed', String(soundOn));
  $('sound').setAttribute('aria-label', soundOn ? 'Tắt âm thanh' : 'Bật âm thanh');
  if (soundOn) {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    await audio.resume();
    chime(1);
  }
};

function chime(count) {
  if (!soundOn || !audio) return;
  [392, 494, 587, 784].slice(0, Math.max(1, Math.ceil(count / 2))).forEach((hz, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = audio.currentTime + i * 0.12;
    osc.type = 'sine';
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.85);
  });
}

// ==========================================
// TƯƠNG TÁC API (EDGE FUNCTIONS)
// ==========================================
async function api(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      message = (await error.context.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function fetchMe() {
  if (!user) {
    remoteAttempts = [];
    profile = null;
    updateAccount();
    return;
  }
  const data = await api('player-state');
  profile = data.profile || null;
  remoteAttempts = data.attempts.map(a => ({
    ...a,
    achievedAt: Date.parse(a.stopped_at || a.started_at),
    deviation: a.deviation_ms,
    timedOut: a.status === 'expired'
  }));
  updateAccount();
}

async function startDemo() {
  demo = readDemo();
  if (!remaining()) throw new Error('Bạn đã dùng đủ 3 lượt chơi thử.');
  const attempt = {
    id: crypto.randomUUID(),
    ...scoreAttempt(DEADLINE, true),
    status: 'expired',
    achievedAt: Date.now()
  };
  demo.attempts.push(attempt);
  saveDemo();
  return attempt;
}

// ==========================================
// VÒNG ĐỜI TRÒ CHƠI (START / TICK / FINISH)
// ==========================================
async function start() {
  if (!['idle', 'result'].includes(state)) return;
  if (live && gate()) {
    setTab('play');
    return;
  }

  state = 'starting';
  $('play-button').disabled = true;

  try {
    if (live) {
      activeAttempt = await api('start-attempt');
      // Bắt đầu hiển thị đồng hồ ngay lập tức, không chờ network
      remoteAttempts.push({ ...activeAttempt, status: 'running' });
    } else {
      activeAttempt = navigator.locks
        ? await navigator.locks.request(STORAGE, startDemo)
        : await startDemo();
    }

    state = 'running';
    startedAt = performance.now();

    $('result').hidden = true;
    document.querySelector('.timer-card').classList.remove('has-result');
    document.body.classList.add('is-running');
    document.querySelector('.clock').classList.add('running');
    illuminate(0);
    $('scene-caption').textContent = 'Tích tắc. Khoảnh khắc đang đến.';

    $('play-button').disabled = false;
    $('play-button').classList.add('stopping');
    $('play-button-label').textContent = 'Chạm để dừng';
    $('play-button-icon').textContent = '■';
    $('play-hint').textContent = 'Dừng đúng 18:00:00.000 · Có thể dùng phím cách';

    updateAccount();
    tick();
  } catch (e) {
    state = 'idle';
    updateAccount();
    toast(e.message);
    if (live && user) fetchMe().catch(() => {});
  }
}

function tick() {
  if (state !== 'running') return;
  const elapsed = performance.now() - startedAt;
  showClock(elapsed);
  if (elapsed >= DEADLINE) {
    finish(true);
    return;
  }
  frame = requestAnimationFrame(tick);
}

async function finish(timedOut = false) {
  if (state !== 'running') return;

  const elapsed = Math.min(DEADLINE, performance.now() - startedAt);
  state = 'stopping';
  cancelAnimationFrame(frame);
  showClock(elapsed);

  document.body.classList.remove('is-running');
  document.querySelector('.clock').classList.remove('running');
  $('play-button').disabled = true;
  $('play-button').classList.remove('stopping');
  $('play-button-label').textContent = 'Đang ghi lại khoảnh khắc…';

  try {
    let result;
    if (live) {
      const data = await api('stop-attempt', {
        attemptId: activeAttempt.id,
        clientElapsed: elapsed
      });
      result = {
        ...data,
        offset: data.elapsed_ms - TARGET,
        deviation: data.deviation_ms,
        elapsed: data.elapsed_ms,
        timedOut: data.status === 'expired'
      };
      await fetchMe();
    } else {
      result = {
        ...scoreAttempt(elapsed, timedOut),
        status: timedOut ? 'expired' : 'valid',
        achievedAt: Date.now(),
        id: activeAttempt.id
      };
      demo = readDemo();
      const index = demo.attempts.findIndex(a => a.id === activeAttempt.id);
      if (index >= 0) demo.attempts[index] = result;
      saveDemo();
    }

    displayResult(result);
    await loadRanking();
  } catch (e) {
    state = 'result';
    $('play-hint').textContent = 'Không ghi được kết quả. Lượt vẫn đã được tính.';
    toast('Lỗi lưu kết quả: ' + e.message);
    if (live) await fetchMe().catch(() => {});
  } finally {
    activeAttempt = null;
    updateAccount();
  }
}

function displayResult(result) {
  state = 'result';
  const count = litWindows(result.deviation, result.timedOut || result.status === 'rejected');
  const pending = result.status === 'suspicious';

  $('result-review').hidden = !pending;
  $('result-review').textContent = pending
    ? 'Đang chờ duyệt · Số ô sáng thể hiện độ chính xác; kết quả chưa được xếp hạng.'
    : '';

  const nextLevel = LIGHT_LEVELS.find(level => level.windows === count + 1);
  $('next-light').textContent = result.timedOut
    ? 'Hãy dừng trước 18:00:03 để ghi nhận khoảnh khắc.'
    : nextLevel
      ? 'Lệch không quá ' + secondsLabel(nextLevel.maxDeviation) + ' giây để sáng ' + nextLevel.windows + ' ô.'
      : 'Bạn đã chạm tới mức sáng cao nhất.';

  illuminate(count);
  chime(count);
  $('result').hidden = false;
  document.querySelector('.timer-card').classList.add('has-result');

  $('result-score').textContent = result.score.toLocaleString('vi-VN');
  $('result-title').textContent = result.status === 'suspicious'
    ? 'Kết quả đang chờ duyệt'
    : result.timedOut
      ? 'Lỡ một nhịp rồi!'
      : count === 8
        ? 'Cả bảo tàng bừng sáng!'
        : count > 0 ? 'Bạn đã thắp lên ánh sáng!' : 'Khoảnh khắc chưa đến';

  $('result-offset').textContent = result.timedOut
    ? 'Quá giờ · 0 điểm'
    : `${result.offset === 0 ? 'Đúng giờ ·' : result.offset < 0 ? 'Sớm' : 'Muộn'} ${secondsLabel(result.deviation)} giây`;

  $('scene-caption').textContent = count === 8
    ? 'Bảo tàng bừng sáng nhờ bạn.'
    : count
      ? `${count} ô cửa, ${count} đốm sáng của bạn.`
      : 'Hẹn bạn ở khoảnh khắc tiếp theo.';

  const t = clockParts(TARGET + (result.offset ?? 0));
  $('flash-title').textContent = result.status === 'suspicious'
    ? 'Đang chờ duyệt'
    : result.timedOut
      ? 'Lỡ một nhịp!'
      : result.deviation <= 20
        ? 'Chính xác!'
        : count >= 6 ? 'Rất gần!' : count > 0 ? 'Bừng sáng!' : 'Chưa tới giờ';

  $('flash-time').replaceChildren(
    document.createTextNode(result.timedOut ? '18:00:03' : t.main),
    Object.assign(document.createElement('small'), { textContent: result.timedOut ? '.000' : t.ms })
  );

  $('flash-dev').textContent = result.timedOut
    ? 'Quá giờ · 0 điểm'
    : `Độ lệch: ${(Math.round(result.deviation) / 1000).toLocaleString('vi-VN', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
      })} giây`;

  window.dispatchEvent(new CustomEvent('game-result', { detail: { score: result.score, count } }));
  go('flash');

  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    if (cur === 'flash') go('result');
  }, 2600);

  $('play-hint').textContent = result.status === 'suspicious'
    ? 'Kết quả cần ban tổ chức xác nhận.'
    : remaining()
      ? 'Mỗi lần chạm là một cơ hội mới.'
      : 'Đã giữ lại kết quả tốt nhất của bạn.';
}

$('play-button').onclick = () => (state === 'running' ? finish() : start());

document.addEventListener('keydown', e => {
  if (
    e.code !== 'Space' ||
    e.repeat ||
    /INPUT|BUTTON|SELECT|TEXTAREA/.test(e.target.tagName) ||
    document.querySelector('dialog[open]') ||
    !$('experience').classList.contains('active') ||
    cur !== 'game'
  ) {
    return;
  }
  e.preventDefault();
  if (state === 'running') finish();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state === 'running' && performance.now() - startedAt >= DEADLINE) {
    finish(true);
  }
});

window.addEventListener('storage', e => {
  if (e.key === STORAGE && !live) {
    demo = readDemo();
    updateAccount();
    loadRanking();
  }
});

// ==========================================
// BẢNG XẾP HẠNG (LEADERBOARD)
// ==========================================
function rankRows() {
  const best = bestAttempt(demo.attempts);
  return best
    ? [
        {
          display_name: 'Bạn · Chơi thử',
          deviation_ms: Math.round(best.deviation),
          score: best.score,
          player_id: 'demo',
          rank: 1
        }
      ]
    : [];
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

const rankingStateText = status =>
  ({
    pending: 'Chờ duyệt',
    no_valid: 'Chưa có lượt hợp lệ',
    unplayed: 'Chưa chơi'
  }[status] || 'Chưa xếp hạng');

async function loadRanking() {
  if (rankingBusy) return;
  rankingBusy = true;
  $('refresh-ranking').disabled = true;
  $('ranking-more').disabled = true;

  try {
    let rows = [];
    let total = 0;

    if (live) {
      if (!supabase) throw new Error('Chưa kết nối được bảng xếp hạng chung. Vui lòng tải lại trang.');
      const { data, error, count } = await supabase
        .from('leaderboard_directory')
        .select('player_id,display_name,deviation_ms,score,rank,status', { count: 'exact' })
        .order('rank', { ascending: true, nullsFirst: false })
        .order('display_name')
        .order('player_id')
        .range(0, rankingLimit - 1);

      if (error) throw error;
      rows = data || [];
      total = count ?? rows.length;

      const time = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      $('ranking-status').textContent = `${total} người chơi · ${time}`;
      $('ranking-note').textContent =
        'Bảng chung tự cập nhật mỗi 10 giây. Mỗi Gmail giữ một hồ sơ và kết quả hợp lệ tốt nhất; tên có thể trùng nhau.';
    } else {
      rows = rankRows().map(row => ({ ...row, status: 'ranked' }));
      total = rows.length;
      $('ranking-status').textContent = 'Kết quả chơi thử';
      $('ranking-note').textContent = 'Kết quả chơi thử chỉ lưu trong trình duyệt này.';
    }

    $('ranking-body').replaceChildren();
    $('ranking-more').hidden = rows.length >= total;
    $('ranking-more').textContent = `Xem thêm · đã hiện ${rows.length}/${total}`;

    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = cell('Chưa có người chơi. Đăng nhập Google để ghi tên của bạn.');
      td.colSpan = 4;
      td.className = 'ranking-empty';
      tr.append(td);
      $('ranking-body').append(tr);
    }

    for (const row of rows) {
      const ranked = row.status === 'ranked';
      const tr = document.createElement('tr');
      tr.className = ranked ? 'rank-row' : 'pending-row';
      if (user?.id === row.player_id) tr.classList.add('is-me');

      const nameCell = cell(row.display_name);
      if (user?.id === row.player_id) {
        const badge = document.createElement('small');
        badge.className = 'me-badge';
        badge.textContent = 'Bạn';
        nameCell.append(badge);
      }

      tr.append(cell(ranked ? String(row.rank).padStart(2, '0') : '—'), nameCell);

      if (ranked) {
        tr.append(cell(`${secondsLabel(row.deviation_ms)} s`), cell(row.score.toLocaleString('vi-VN')));
      } else {
        const statusCell = cell(rankingStateText(row.status));
        statusCell.colSpan = 2;
        statusCell.className = 'ranking-state';
        tr.append(statusCell);
      }
      $('ranking-body').append(tr);
    }

    window.dispatchEvent(new Event('ranking-rendered'));
    $('mini-ranking').replaceChildren();

    if (live && user) {
      let mine = rows.find(row => row.player_id === user.id);
      if (!mine) {
        const { data, error } = await supabase
          .from('leaderboard_directory')
          .select('rank,score,status,display_name')
          .eq('player_id', user.id)
          .maybeSingle();
        if (error) throw error;
        mine = data;
      }
      $('my-rank').textContent = mine?.status === 'ranked'
        ? `${mine.display_name} · Hạng ${mine.rank} · ${mine.score} điểm`
        : mine
          ? `${mine.display_name} · ${rankingStateText(mine.status)}. Hồ sơ đã được lưu.`
          : 'Hoàn tất thông tin người chơi để ghi tên vào bảng chung.';
    } else if (live) {
      $('my-rank').textContent = 'Mọi người đều xem được bảng này. Chỉ cần đăng nhập Google khi tham gia chơi.';
    } else {
      const best = bestAttempt(attempts());
      $('my-rank').textContent = best
        ? `Kết quả tốt nhất: ${best.score} điểm · lệch ${secondsLabel(best.deviation)} giây`
        : 'Chơi một lượt để ghi lại khoảnh khắc của bạn.';
    }
  } catch (e) {
    $('ranking-status').textContent = 'Chưa cập nhật được';
    $('ranking-note').textContent = 'Dữ liệu trên màn hình có thể chưa mới nhất. Bấm làm mới để thử lại.';
    toast('Không tải được bảng xếp hạng: ' + e.message);
  } finally {
    rankingBusy = false;
    $('refresh-ranking').disabled = false;
    $('ranking-more').disabled = false;
  }
}

$('ranking-more').onclick = () => {
  rankingLimit += 50;
  loadRanking();
};

window.addEventListener('focus', () => {
  if (cur === 'board') loadRanking();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && cur === 'board') loadRanking();
});

$('refresh-ranking').onclick = loadRanking;

// ==========================================
// BAN TỔ CHỨC / QUẢN TRỊ (#admin)
// ==========================================
async function loadAdmin() {
  if (!live || !user) {
    $('admin-message').textContent = 'Trang quản trị cần tài khoản ban tổ chức trong bản chính thức.';
    return;
  }
  try {
    const data = await api('admin', { action: 'list', filter: $('admin-filter').value });
    adminRows = data.rows;
    $('admin-message').textContent = data.closed ? 'Chiến dịch đã chốt.' : 'Chiến dịch đang mở.';
    $('admin-body').replaceChildren();

    for (const row of adminRows) {
      const tr = document.createElement('tr');
      const name = cell(row.full_name);
      const email = document.createElement('span');
      email.className = 'admin-email';
      email.textContent = row.email;
      name.append(email);

      tr.append(
        name,
        cell(String(row.attempt_number)),
        cell(row.deviation_ms === null ? '—' : `${secondsLabel(row.deviation_ms)} s`),
        cell(String(row.score)),
        cell(row.status)
      );

      const actions = cell('');
      if (row.status === 'suspicious') {
        for (const [decision, label] of [['valid', 'Chấp nhận'], ['rejected', 'Loại']]) {
          const b = document.createElement('button');
          b.className = 'review-button';
          b.textContent = label;
          b.onclick = async () => {
            try {
              await api('admin', { action: 'review', attemptId: row.id, decision });
              await loadAdmin();
            } catch (e) {
              toast(e.message);
            }
          };
          actions.append(b);
        }
      }
      tr.append(actions);
      $('admin-body').append(tr);
    }
  } catch (e) {
    $('admin-message').textContent = e.message;
  }
}

$('admin-filter').onchange = loadAdmin;

$('export-csv').onclick = async () => {
  try {
    const data = await api('admin', { action: 'export' });
    const blob = new Blob(['\ufeff' + data.csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'toi-gio-len-den-ket-qua.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    toast(e.message);
  }
};

$('close-campaign').onclick = async () => {
  if (!confirm('Chốt chiến dịch? Người chơi sẽ không thể bắt đầu lượt mới.')) return;
  try {
    await api('admin', { action: 'close' });
    await loadAdmin();
  } catch (e) {
    toast(e.message);
  }
};

// ==========================================
// KHỞI CHẠY ỨNG DỤNG (INIT)
// ==========================================
async function init() {
  if (live) {
    $('mode-badge').textContent = 'CHÍNH THỨC';
    $('demo-note').textContent = 'Mỗi tài khoản 3 lượt trong cả chiến dịch.';
    document.body.classList.add('is-live');
    $('play-button').disabled = true;

    try {
      const { createClient } = await import('./vendor/supabase-2.57.4.js');
      supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      user = data.session?.user || null;

      await fetchMe();

      supabase.auth.onAuthStateChange((_event, session) => {
        user = session?.user || null;
        setTimeout(() => {
          fetchMe()
            .catch(e => toast(e.message))
            .then(() => {
              $('google-wait').hidden = true;
              route();
              return loadRanking();
            })
            .catch(() => {});
        }, 0);
      });
    } catch (e) {
      toast('Chưa kết nối được bản chính thức: ' + e.message);
    }
  }

  updateAccount();
  route();
  await loadRanking();

  if (location.hash === '#admin') setTab('admin');

  setInterval(() => {
    if (live && supabase && cur === 'board' && !document.hidden && state !== 'running') {
      loadRanking();
    }
  }, 10000);
}

init();
