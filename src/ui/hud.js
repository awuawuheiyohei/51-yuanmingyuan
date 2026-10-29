/**
 * HUD：景点列表、镜头控制、时段调节、说明面板
 */
import { SCENE_ORDER } from '../scene/scenes-program.js';

/** 非四十景的景点（接在四十景之后） */
const EXTRA_ORDER = ['福海', '西洋楼', '绮春园'];

export function initHud(ctx) {
  const { state, sceneData, controls, tour, onTimeChange, onFocusScene, onShot } = ctx;

  const el = (id) => document.getElementById(id);

  /* ---------- 景点列表 ---------- */
  const list = el('scene-list');
  const scenes = (sceneData.scenes || []).filter((s) => s.name);
  // 顺序取自 scenes-program.js 的 SCENE_ORDER（四十景的唯一真源），
  // 另有福海、西洋楼等非四十景的景点接在后面。
  const rank = (name) => {
    const i = SCENE_ORDER.indexOf(name);
    if (i >= 0) return i;
    const j = EXTRA_ORDER.indexOf(name);
    return SCENE_ORDER.length + (j >= 0 ? j : EXTRA_ORDER.length);
  };
  const sorted = [...scenes].sort((a, b) => rank(a.name) - rank(b.name));
  for (const s of sorted) {
    const li = document.createElement('button');
    li.className = 'scene-item';
    li.innerHTML = `<span class="nm">${s.name}</span>${
      s.note ? '<span class="note">有说明</span>' : ''
    }`;
    li.onclick = () => {
      onFocusScene(s);
      showInfo(s);
      for (const x of list.children) x.classList.remove('active');
      li.classList.add('active');
    };
    list.appendChild(li);
  }

  function showInfo(s) {
    const info = el('info');
    info.innerHTML = `
      <button class="close" onclick="this.parentElement.classList.remove('show')">×</button>
      <h3>${s.name}</h3>
      <p class="desc">${s.note || ''}</p>
      <p class="coords">${s.lat.toFixed(5)}° N, ${s.lon.toFixed(5)}° E</p>
      <p class="tip">位置取自 OpenStreetMap 园内实测标注</p>
    `;
    info.classList.add('show');
  }

  /* ---------- 模式切换 ---------- */
  const modeBtn = el('btn-mode');
  const playBtn = el('btn-play');
  const shotTitle = el('shot-title');
  const progress = el('progress-bar');
  const progressWrap = el('shot-progress');

  function setMode(m) {
    state.mode = m;
    modeBtn.textContent = m === 'tour' ? '退出巡游' : '一镜到底巡游';
    modeBtn.classList.toggle('active', m === 'tour');
    progressWrap.style.display = m === 'tour' ? 'block' : 'none';
    if (m === 'tour') state.tourTime = 0;
    window.dispatchEvent(new CustomEvent('ymy-mode', { detail: m }));
  }
  modeBtn.onclick = () => setMode(state.mode === 'tour' ? 'free' : 'tour');
  window.addEventListener('ymy-mode', (e) => {
    state.mode = e.detail;
    modeBtn.textContent = e.detail === 'tour' ? '退出巡游' : '一镜到底巡游';
    modeBtn.classList.toggle('active', e.detail === 'tour');
    progressWrap.style.display = e.detail === 'tour' ? 'block' : 'none';
  });

  playBtn.onclick = () => {
    state.tourPlaying = !state.tourPlaying;
    playBtn.textContent = state.tourPlaying ? '暂停' : '播放';
  };

  /* ---------- 镜头跳转 ---------- */
  const shots = el('shot-list');
  tour?.shots.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'shot-item';
    b.textContent = `${i + 1}. ${s.title}`;
    b.onclick = () => {
      window.dispatchEvent(new CustomEvent('ymy-tour-goto', { detail: i }));
      setMode('tour');
    };
    shots.appendChild(b);
  });

  /* ---------- 时段 ---------- */
  const timeSlider = el('time-slider');
  const timeLabel = el('time-label');
  function fmtHour(h) {
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  timeSlider.oninput = () => {
    state.timeOfDay = parseFloat(timeSlider.value);
    timeLabel.textContent = fmtHour(state.timeOfDay);
    onTimeChange(state.timeOfDay);
  };
  timeSlider.value = state.timeOfDay;
  timeLabel.textContent = fmtHour(state.timeOfDay);
  onTimeChange(state.timeOfDay);

  /* ---------- 截图 ---------- */
  el('btn-shot').onclick = onShot;

  /* ---------- 面板折叠 ---------- */
  for (const btn of document.querySelectorAll('.panel-toggle')) {
    btn.onclick = () => {
      const body = btn.nextElementSibling;
      body.classList.toggle('collapsed');
      btn.textContent = body.classList.contains('collapsed') ? '＋' : '－';
    };
  }

  /* ---------- 巡游进度 ---------- */
  let lastShot = -1;
  function tick() {
    if (state.mode === 'tour' && tour) {
      const total = tour.totalDur;
      progress.style.width = `${(state.tourTime / total) * 100}%`;
      const idx = tour.index;
      if (idx !== lastShot) {
        lastShot = idx;
        shotTitle.textContent = tour.shots[idx]?.title || '';
        const items = shots.children;
        for (let i = 0; i < items.length; i++)
          items[i].classList.toggle('active', i === idx);
      }
    }
    requestAnimationFrame(tick);
  }
  tick();

  el('loading').classList.add('hide');
}
