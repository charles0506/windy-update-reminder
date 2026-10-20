// ==UserScript==
// @name         Windy 預報更新提醒
// @namespace    https://github.com/charles0506/windy-update-reminder
// @version      1.0.0
// @description  在 windy.com 右下角顯示各國天氣模型上次執行時間與下次更新倒數（依週期推算的估計值）
// @match        *://*.windy.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/charles0506/windy-update-reminder/main/windy-update-reminder.user.js
// @downloadURL  https://raw.githubusercontent.com/charles0506/windy-update-reminder/main/windy-update-reminder.user.js
// ==/UserScript==

// Windy 預報更新提醒 - content script
// 注意：Windy 未公開提供「模型上次更新時間」的頁面元素或 API，
// 這裡是依各模型「公開的執行週期 + 一般發布延遲」反推出的估計值，
// 不是從 Windy 內部直接讀到的精確時間戳，僅供參考。

(function () {
  if (window.__windyUpdateReminderInjected) return;
  window.__windyUpdateReminderInjected = true;

  // cycleHours：每隔幾小時跑一次（UTC 整點對齊）
  // delayHours：從模式啟動到資料可用的一般延遲（估計值，各家實際會浮動）
  const MODELS = [
    { code: 'ECMWF', label: '🇪🇺 ECMWF', cycleHours: 6, delayHours: 6.5 },
    { code: 'GFS', label: '🇺🇸 GFS', cycleHours: 6, delayHours: 4.5 },
    { code: 'NAM', label: '🇺🇸 NAM', cycleHours: 6, delayHours: 3.5 },
    { code: 'ICON', label: '🇩🇪 ICON', cycleHours: 6, delayHours: 3.75 },
    { code: 'MSM', label: '🇯🇵 MSM', cycleHours: 3, delayHours: 2.5 },
    { code: 'UKMO', label: '🇬🇧 UKMO', cycleHours: 6, delayHours: 4.5 },
  ];

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function computeLatestRun(nowMs, cycleHours, delayHours) {
    const cycleMs = cycleHours * 3600 * 1000;
    const delayMs = delayHours * 3600 * 1000;
    const candidateMs = Math.floor((nowMs - delayMs) / cycleMs) * cycleMs;
    const runTime = new Date(candidateMs);
    const nextRunTime = new Date(candidateMs + cycleMs);
    const nextAvailableTime = new Date(candidateMs + cycleMs + delayMs);
    return { runTime, nextRunTime, nextAvailableTime };
  }

  function formatRunUTC(d) {
    return `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}Z`;
  }

  function formatDuration(ms) {
    const sign = ms < 0 ? '-' : '';
    ms = Math.abs(ms);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h <= 0) return `${sign}${m}分鐘`;
    return `${sign}${h}小時${m}分鐘`;
  }

  function buildRows(now) {
    const nowMs = now.getTime();
    return MODELS.map((m) => {
      const { runTime, nextAvailableTime } = computeLatestRun(nowMs, m.cycleHours, m.delayHours);
      return {
        label: m.label,
        runUTC: formatRunUTC(runTime),
        ago: formatDuration(nowMs - runTime.getTime()),
        nextIn: formatDuration(nextAvailableTime.getTime() - nowMs),
      };
    });
  }

  // ---- UI ----
  const host = document.createElement('div');
  host.id = 'windy-update-reminder-host';
  Object.assign(host.style, {
    position: 'fixed',
    right: '10px',
    bottom: '10px',
    zIndex: 2147483647,
  });
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .badge {
      font-family: -apple-system, "Segoe UI", "Microsoft JhengHei", sans-serif;
      font-size: 12px;
      background: rgba(20, 24, 30, 0.88);
      color: #e8eef5;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      line-height: 1.5;
      max-width: 280px;
    }
    .badge.expanded { cursor: default; }
    .headline { cursor: pointer; white-space: nowrap; }
    table { border-collapse: collapse; margin-top: 6px; width: 100%; }
    td { padding: 2px 6px 2px 0; white-space: nowrap; }
    td.k { color: #9fb0c0; }
    .note { margin-top: 6px; color: #8a97a5; font-size: 10px; line-height: 1.4; }
    .close { float: right; color: #8a97a5; margin-left: 8px; }
    .close:hover { color: #fff; }
  `;
  shadow.appendChild(style);

  const box = document.createElement('div');
  box.className = 'badge';
  shadow.appendChild(box);

  let expanded = localStorage.getItem('windyUpdateReminderExpanded') === '1';

  function render() {
    const now = new Date();
    const rows = buildRows(now);
    box.classList.toggle('expanded', expanded);

    if (!expanded) {
      const r0 = rows[0];
      box.innerHTML = `<div class="headline">🌀 ${r0.label} ${r0.runUTC}（${r0.ago}前）▾</div>`;
      box.querySelector('.headline').onclick = () => {
        expanded = true;
        localStorage.setItem('windyUpdateReminderExpanded', '1');
        render();
      };
    } else {
      let rowsHtml = rows
        .map(
          (r) =>
            `<tr><td class="k">${r.label}</td><td>${r.runUTC}</td><td>${r.ago}前</td><td>約 ${r.nextIn}後更新</td></tr>`
        )
        .join('');
      box.innerHTML = `
        <div class="headline">🌀 天氣模型執行時間 <span class="close">收合 ▴</span></div>
        <table>${rowsHtml}</table>
        <div class="note">依各模型執行週期（多為每 6 小時，日本 MSM 每 3 小時）與一般發布延遲反推估計，非 Windy 頁面直接提供的精確時間。</div>
      `;
      box.querySelector('.close').onclick = (e) => {
        e.stopPropagation();
        expanded = false;
        localStorage.setItem('windyUpdateReminderExpanded', '0');
        render();
      };
    }
  }

  function mount() {
    if (document.body) {
      document.body.appendChild(host);
      render();
      setInterval(render, 30000);
    } else {
      requestAnimationFrame(mount);
    }
  }
  mount();
})();
