// Lớp chuyển động cho app dọc. Không đụng logic game: chỉ nghe sự kiện 'screen-change', 'game-result'.
// Không có hiệu ứng nào chạy trước thời điểm dừng; khi đang chơi, mọi hiệu ứng nền đều tạm dừng.
const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lite = reduce || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
const KEY = 'bao-tang-dem-intro-v1';
let seen = false; try { seen = !!localStorage.getItem(KEY); } catch {}
const cfg = window.GAME_CONFIG || {};
const g = window.gsap;

// Logo / ảnh mặt tiền thay thế qua config.js (logo, facade)
if (cfg.logo) { const l = $('brand-logo'); l.src = cfg.logo; l.hidden = false; document.querySelector('.brand-mark').hidden = true; document.querySelector('.brand-text').hidden = true; }
if (cfg.facade) document.querySelectorAll('.facade').forEach(i => { i.src = cfg.facade; });

// Vạch chia mặt đồng hồ (60 vạch, mỗi 5 vạch đậm)
const ticks = $('dial-ticks');
if (ticks && !ticks.children.length) {
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < 60; i++) {
    const t = document.createElementNS(ns, 'line'), major = i % 5 === 0, a = i / 60 * Math.PI * 2, r1 = major ? 112 : 117, r2 = 122;
    t.setAttribute('x1', 150 + Math.sin(a) * r1); t.setAttribute('y1', 150 - Math.cos(a) * r1); t.setAttribute('x2', 150 + Math.sin(a) * r2); t.setAttribute('y2', 150 - Math.cos(a) * r2);
    t.setAttribute('stroke', major ? '#F4E4C8' : '#8B683A'); t.setAttribute('stroke-width', major ? 1.6 : 1); ticks.append(t);
  }
}

// Chú thích màn hình bên trái (laptop)
function caption(name) {
  const s = $('s-' + name); if (!s?.dataset.cap) return;
  const [n, t, d] = s.dataset.cap.split('|');
  $('cap-num').textContent = n; $('cap-title').textContent = t; $('cap-desc').textContent = d;
  if (g && !reduce) g.fromTo('.stage-caption', { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: .6, ease: 'power3.out' });
}
caption('splash');

// 01 · Splash: các mảnh hình học ráp thành biểu tượng, thanh nạp chạy, rồi vào sảnh
const done = () => { try { localStorage.setItem(KEY, '1'); } catch {} window.dispatchEvent(new Event('splash-done')); };
let splashTl;
if (!g || reduce) { setTimeout(done, reduce ? 600 : 300); }
else {
  const k = seen ? .4 : 1;
  g.set('#i-moon,#i-ring,#i-sq1,#i-semi,#i-star,#i-sq2,#i-glow', { opacity: 0, transformOrigin: '50% 50%' });
  g.set('#splash-word', { opacity: 0, y: 12 });
  splashTl = g.timeline({ onComplete: done })
    .to('#i-glow', { opacity: 1, duration: .9 * k })
    .fromTo('#i-ring', { scale: .2 }, { scale: 1, opacity: 1, duration: .9 * k, ease: 'power3.out' }, '<')
    .fromTo('#i-moon', { scale: .3, rotate: -50 }, { scale: 1, rotate: 0, opacity: 1, duration: .9 * k, ease: 'power3.out' }, '<.1')
    .fromTo('#i-sq1,#i-sq2', { scale: 0, rotate: 45 }, { scale: 1, rotate: 0, opacity: 1, duration: .6 * k, ease: 'back.out(1.7)', stagger: .1 * k }, '<.25')
    .fromTo('#i-semi', { y: 24 }, { y: 0, opacity: 1, duration: .5 * k }, '<.1')
    .fromTo('#i-star', { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, opacity: 1, duration: .6 * k, ease: 'back.out(2)' }, '<.1')
    .to('#splash-word', { opacity: 1, y: 0, duration: .8 * k, ease: 'power3.out' }, '<.1')
    .fromTo('#splash-fill', { scaleX: 0 }, { scaleX: 1, duration: 2.6 * k, ease: 'power1.inOut' }, 0)
    .to({}, { duration: seen ? .1 : .25 });
}

// Chuyển cảnh giữa các màn
const ambient = [];
window.addEventListener('screen-change', e => {
  const { from, to } = e.detail;
  caption(to);
  if (from === 'splash' && splashTl) { splashTl.kill(); try { localStorage.setItem(KEY, '1'); } catch {} }
  if (!g || reduce) return;
  const s = $('s-' + to);
  g.killTweensOf(s);
  if (to === 'flash') return flashIn();
  if (to === 'landing') return landingIn(s, from === 'splash');
  // Màn mới mở ra như ánh đèn lan từ dưới lên (hình bán nguyệt của nhận diện)
  g.fromTo(s, { clipPath: 'circle(18% at 50% 110%)', opacity: .6 }, { clipPath: 'circle(150% at 50% 110%)', opacity: 1, duration: .75, ease: 'power3.inOut', clearProps: 'clipPath,opacity' });
  const items = s.querySelectorAll('.title-md, .center-note, .field, .steps li, .rules, .dial-box, .scale, .btn-play, .game-foot, .result-photo, .window-grid, .result, .board-tools, .table-wrap, .my-rank, .board-cta, #how-start, #profile-submit, #again');
  g.fromTo(items, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: .7, stagger: .05, ease: 'power3.out', delay: .12, clearProps: 'transform,opacity' });
  if (to === 'result') resultIn();
});

function landingIn(s, first) {
  const tl = g.timeline({ defaults: { ease: 'power3.out' } });
  tl.fromTo(s, { opacity: 0 }, { opacity: 1, duration: .5, clearProps: 'opacity' })
    .fromTo(s.querySelector('.facade'), { scale: first ? 1.18 : 1.06, filter: 'brightness(.35)' }, { scale: 1, filter: 'brightness(1)', duration: first ? 2.2 : 1.2, clearProps: 'filter' }, 0)
    .fromTo('.photo-moon', { opacity: 0, y: 14, rotate: -30 }, { opacity: 1, y: 0, rotate: 0, duration: 1.4 }, .4)
    .fromTo(s.querySelectorAll('.ln>span'), { yPercent: 110 }, { yPercent: 0, duration: 1, stagger: .12, ease: 'power4.out' }, .35)
    .fromTo(s.querySelectorAll('.land-body .kicker, .lede, .consent, .btn, .link-more'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .7, stagger: .07, clearProps: 'transform,opacity' }, .6);
  if (!lite && !ambient.moon) { ambient.moon = true; ambient.push(g.to('.photo-moon', { y: -6, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut' })); }
}

// 07 · Khoảnh khắc: chỉ chạy SAU khi kết quả đã được chốt (server hoặc bản chơi thử)
function flashIn() {
  const tl = g.timeline({ defaults: { ease: 'power3.out' } });
  tl.fromTo('#s-flash', { opacity: 0 }, { opacity: 1, duration: .25, clearProps: 'opacity' })
    .fromTo('#ray-group', { opacity: 0, scaleY: .3, transformOrigin: '50% 94%' }, { opacity: 1, scaleY: 1, duration: 1.1 }, 0)
    .fromTo('#flash-r1,#flash-r2', { scale: .4, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 1.2, stagger: .1 }, 0)
    .fromTo('#flash-title', { opacity: 0, y: 18, letterSpacing: '.3em' }, { opacity: 1, y: 0, letterSpacing: '.06em', duration: .8 }, .15)
    .fromTo('.flash-line', { scaleX: 0 }, { scaleX: 1, duration: .6 }, .35)
    .fromTo('#flash-time', { opacity: 0, scale: .9 }, { opacity: 1, scale: 1, duration: .7 }, .4)
    .fromTo('#flash-dev', { opacity: 0 }, { opacity: 1, duration: .5 }, .7);
}

let lastScore = 0;
window.addEventListener('game-result', e => {
  lastScore = e.detail.score;
  try { if (e.detail.count > 0) navigator.vibrate?.(e.detail.count === 8 ? [30, 60, 30, 60, 90] : 25); } catch {}
  const p = $('progress-ping'); p.classList.remove('go'); void p.offsetWidth; p.classList.add('go');
});
function resultIn() {
  const el = $('result-score'), final = lastScore.toLocaleString('vi-VN');
  if (lite) { el.textContent = final; return; }
  const o = { v: 0 };
  g.to(o, { v: lastScore, duration: 1.3, delay: .5, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString('vi-VN'); }, onComplete: () => { el.textContent = final; } });
}

// Khi đang chơi: dừng mọi hiệu ứng nền để luồng chính chỉ lo đồng hồ và nút dừng
new MutationObserver(() => { const run = document.body.classList.contains('is-running'); ambient.forEach(t => run ? t.pause() : t.resume()); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// Nền hình học ngoài khung (laptop) trôi rất chậm
if (g && !lite && matchMedia('(min-width:600px)').matches) {
  document.querySelectorAll('.bd').forEach((b, i) => ambient.push(g.to(b, { y: i % 2 ? 18 : -18, rotate: i % 2 ? 6 : -6, duration: 7 + i, yoyo: true, repeat: -1, ease: 'sine.inOut' })));
}
