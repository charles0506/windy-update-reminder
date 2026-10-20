// ==UserScript==
// @name         Windy 颱風各國預報路徑 + 模型更新時間
// @namespace    https://github.com/charles0506/windy-update-reminder
// @version      2.1.0
// @description  在 windy.com 地圖上疊加台灣氣象署、中國中央氣象台、日本氣象廳的颱風預報路徑，加上 GFS 集合平均、Google WeatherNext 2、英/加/美海軍模式路徑，並顯示各模型更新時間（估計）
// @match        *://*.windy.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      www.cwa.gov.tw
// @connect      www.jma.go.jp
// @connect      typhoon.nmc.cn
// @connect      deepmind.google.com
// @connect      hurricanes.ral.ucar.edu
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/charles0506/windy-update-reminder/main/windy-update-reminder.user.js
// @downloadURL  https://raw.githubusercontent.com/charles0506/windy-update-reminder/main/windy-update-reminder.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (window.__windyTyphoonInjected) return;
  window.__windyTyphoonInjected = true;

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const KT_PER_MS = 1.943844;
  const REFRESH_MS = 30 * 60 * 1000;

  // ---------- 機構 ----------
  const AGENCIES = {
    CWA: { label: '🇹🇼 台灣 氣象署', color: '#e53935' },
    CMA: { label: '🇨🇳 中國 中央氣象台', color: '#fb8c00' },
    JMA: { label: '🇯🇵 日本 氣象廳', color: '#1e88e5' },
    GFS: { label: '🇺🇸 GFS 集合平均', color: '#43a047' },
    GOOG: { label: '🤖 Google WeatherNext 2 集合平均', color: '#8e24aa' },
    UKM: { label: '🇬🇧 英國 UKMO 模式', color: '#00acc1' },
    CMC: { label: '🇨🇦 加拿大 CMC 模式', color: '#8d6e63' },
    NGX: { label: '🇺🇸 美國海軍 NAVGEM 模式', color: '#9e9e9e' },
  };
  // 預設畫哪幾條（其餘在面板自己勾）
  const DEFAULT_VISIBLE = ['CWA', 'CMA', 'JMA', 'GFS', 'GOOG'];

  // ---------- 網路 ----------
  function httpGet(url, headers) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: headers || {},
        timeout: 30000,
        onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error(url + ' HTTP ' + r.status))),
        onerror: () => reject(new Error(url + ' 連線失敗')),
        ontimeout: () => reject(new Error(url + ' 逾時')),
      });
    });
  }

  // 每筆預報點：{ t: 毫秒時間戳(UTC), lat, lon, kt }
  // 每個結果：{ name: 大寫英文名, init: 毫秒, pts: [...] }

  async function fetchJMA() {
    const list = JSON.parse(await httpGet('https://www.jma.go.jp/bosai/typhoon/data/targetTc.json'));
    const out = [];
    for (const tc of list) {
      const spec = JSON.parse(await httpGet(`https://www.jma.go.jp/bosai/typhoon/data/${tc.tropicalCyclone}/specifications.json`));
      const name = (spec[0].name && spec[0].name.en ? spec[0].name.en : '').toUpperCase();
      if (!name) continue;
      const pts = spec.slice(1).map((p) => {
        const sus = p.maximumWind && p.maximumWind.sustained && p.maximumWind.sustained.kt;
        return { lat: +p.position.deg[0], lon: +p.position.deg[1], kt: sus ? +sus : null, h: p.advancedHours };
      });
      const issue = Date.parse(spec[0].issue.UTC);
      pts.forEach((p) => { p.t = issue + p.h * 3600000; });
      out.push({ name, init: issue, pts });
    }
    return out;
  }

  // CMA 回傳 JSONP：取第一個 { 到最後一個 } 之間
  function parseJsonp(txt) {
    return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  }

  async function fetchCMA() {
    const lstTxt = await httpGet('https://typhoon.nmc.cn/weatherservice/typhoon/jsons/list_default');
    const lst = parseJsonp(lstTxt).typhoonList;
    const out = [];
    for (const e of lst) {
      if (e[e.length - 1] !== 'start') continue; // 只取仍在生效的
      const vTxt = await httpGet('https://typhoon.nmc.cn/weatherservice/typhoon/jsons/view_' + e[0]);
      const body = parseJsonp(vTxt);
      const last = body.typhoon[8][body.typhoon[8].length - 1];
      const s = last[1];
      const init = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
      const pts = [{ t: init, lat: +last[5], lon: +last[4], kt: last[7] != null ? Math.round(last[7] * KT_PER_MS) : null, h: 0 }];
      ((last[11] && last[11].BABJ) || []).forEach((f) => {
        pts.push({ t: init + f[0] * 3600000, lat: +f[3], lon: +f[2], kt: f[5] != null ? Math.round(f[5] * KT_PER_MS) : null, h: +f[0] });
      });
      out.push({ name: String(e[1]).trim().toUpperCase(), init, pts });
    }
    return out;
  }

  async function fetchCWA() {
    const js = await httpGet('https://www.cwa.gov.tw/Data/js/typhoon/TY_NEWS-Data.js');
    const m = js.match(/TY_DataTime = '(\d{12})'/);
    if (!m) return [];
    const s = m[1];
    const init = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
    const initYear = +s.slice(0, 4);
    const cBlock = js.split("TY_LIST_1['C']")[1].split("TY_LIST_1['E']")[0];
    const parts = cBlock.split('<div class="panel panel-default" id="').slice(1);
    const out = [];
    for (const part of parts) {
      const name = part.slice(0, part.indexOf('"')).toUpperCase();
      const text = part.replace(/'\+/g, '').replace(/'/g, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      const c = text.match(/中心位置在北緯\s*([\d.]+)\s*度，東經\s*([\d.]+)/);
      if (!c) continue;
      const w0 = text.match(/近中心最大風速每秒\s*(\d+)/);
      const pts = [{ t: init, lat: +c[1], lon: +c[2], kt: w0 ? Math.round(w0[1] * KT_PER_MS) : null, h: 0 }];
      const re = /預測\s*(\d+)月(\d+)日(\d+)時\s*中心位置在北緯\s*([\d.]+)\s*度，東經\s*([\d.]+)\s*度(?:(?:(?!預測).)*?近中心最大風速每秒\s*(\d+))?/g;
      let f;
      while ((f = re.exec(text))) {
        // 預報時間是台灣時間（UTC+8）
        let t = Date.UTC(initYear, +f[1] - 1, +f[2], +f[3]) - 8 * 3600000;
        if (t < init - 30 * 86400000) t = Date.UTC(initYear + 1, +f[1] - 1, +f[2], +f[3]) - 8 * 3600000;
        pts.push({ t, lat: +f[4], lon: +f[5], kt: f[6] ? Math.round(f[6] * KT_PER_MS) : null, h: Math.round((t - init) / 3600000) });
      }
      out.push({ name, init, pts });
    }
    return out;
  }

  // Google WeatherNext 2 Cyclones（網址代號 FNV3P2）：集合平均路徑 CSV，免登入。
  // 資料使用條款：https://storage.googleapis.com/weathernext-public/terms-of-use.pdf
  // （1 小時內的即時資料受條款約束，超過 1 小時為 CC BY 4.0；本腳本只在你自己的瀏覽器讀取，不轉存）
  // 回傳 [{ trackId, init, pts }]，trackId 例如 WP292026，不分颱風全抓，之後用位置比對對上颱風。
  async function fetchGoogle() {
    const base = 'https://deepmind.google.com/science/weatherlab/download/cyclones/FNV3P2/ensemble_mean/paired/csv/FNV3P2_';
    let run = Math.floor(Date.now() / 21600000) * 21600000;
    let text = null;
    for (let i = 0; i < 6 && text === null; i++) {
      const d = new Date(run);
      const url = `${base}${d.getUTCFullYear()}_${pad2(d.getUTCMonth() + 1)}_${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}_00_paired.csv`;
      try { text = await httpGet(url); } catch (e) { run -= 21600000; } // 最新一報可能還沒出，往前找 36 小時
    }
    if (text === null) throw new Error('Weather Lab 最近 36 小時沒有檔案');
    const lines = text.split(/\r?\n/).filter((l) => l && l[0] !== '#');
    const head = lines[0].split(',');
    const ix = (n) => head.indexOf(n);
    const iT = ix('track_id'), iV = ix('valid_time'), iH = ix('lead_time_hours'), iLa = ix('lat'), iLo = ix('lon'), iW = ix('maximum_sustained_wind_speed_knots');
    const tracks = {};
    lines.slice(1).forEach((l) => {
      const f = l.split(',');
      const w = parseFloat(f[iW]);
      (tracks[f[iT]] = tracks[f[iT]] || []).push({
        t: Date.parse(f[iV].replace(' ', 'T') + 'Z'), lat: +f[iLa], lon: +f[iLo], kt: isNaN(w) ? null : Math.round(w), h: +f[iH],
      });
    });
    return Object.keys(tracks).map((trackId) => ({ trackId, init: run, pts: tracks[trackId].sort((a, b) => a.h - b.h) }));
  }

  // RAL（NCAR）熱帶氣旋預報模式專案的 a-deck（ATCF 格式，各模式路徑預報）。
  // 檔案很大（9MB），只用 HTTP Range 抓尾端 3MB，涵蓋最近一兩天的預報。
  // 這裡沒有 ECMWF（授權限制），GFS 只有集合平均（AEMN），沒有單一定值 AVNO。
  const RAL_BASIN = { WP: 'northwestpacific', AL: 'atlantic', EP: 'northeastpacific', CP: 'centralpacific' };
  const ATCF_TECH = { AEMN: 'GFS', UKM: 'UKM', CMC: 'CMC', NGX: 'NGX' };
  function atcfCoord(s, pos, neg) {
    const v = parseFloat(s) / 10;
    return s.endsWith(neg) ? -v : v;
  }
  async function fetchAtcf(trackId) {
    const basin = trackId.slice(0, 2), year = trackId.slice(4), id = trackId.toLowerCase();
    if (!RAL_BASIN[basin]) return {};
    const url = `https://hurricanes.ral.ucar.edu/realtime/plots/${RAL_BASIN[basin]}/${year}/${id}/a${id}.dat`;
    const text = await httpGet(url, { Range: 'bytes=-3000000' });
    const rows = {}; // rows[agencyKey][dtg][tau] = pt
    text.split(/\r?\n/).slice(1).forEach((line) => { // 第一行可能被 Range 截斷
      const f = line.split(',').map((x) => x.trim());
      const key = ATCF_TECH[f[4]];
      if (!key || f.length < 9) return;
      const tau = +f[5];
      const d = f[2];
      const lat = atcfCoord(f[6], 'N', 'S'), lon = atcfCoord(f[7], 'E', 'W');
      if (isNaN(lat) || isNaN(lon)) return;
      const init = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10));
      const byDtg = (rows[key] = rows[key] || {});
      const byTau = (byDtg[init] = byDtg[init] || {});
      if (!byTau[tau]) byTau[tau] = { t: init + tau * 3600000, lat, lon, kt: +f[8] || null, h: tau };
    });
    const out = {};
    Object.keys(rows).forEach((key) => {
      const latest = Math.max(...Object.keys(rows[key]).map(Number));
      const pts = Object.values(rows[key][latest]).sort((a, b) => a.h - b.h);
      if (pts.length > 1) out[key] = { init: latest, pts };
    });
    return out;
  }

  // ---------- 資料狀態 ----------
  const state = {
    data: {}, // data[agency] = [{name, init, pts}]
    errors: {},
    storms: [], // 大寫英文名
    selected: null,
    visible: Object.fromEntries(Object.keys(AGENCIES).map((k) => [k, DEFAULT_VISIBLE.includes(k)])),
    loadedAt: null,
  };

  // 用目前位置把 Google / ATCF 的颱風對上名字（三個官方單位的現況位置當基準）
  function currentPos(name) {
    for (const k of ['JMA', 'CMA', 'CWA']) {
      const s = (state.data[k] || []).find((x) => x.name === name);
      if (s && s.pts.length) return s.pts[0];
    }
    return null;
  }

  async function loadAll() {
    const jobs = { CWA: fetchCWA, CMA: fetchCMA, JMA: fetchJMA };
    const fail = (k, e) => { state.data[k] = []; state.errors[k] = e.message; };
    await Promise.all(
      Object.keys(jobs).map(async (k) => {
        try {
          state.data[k] = await jobs[k]();
          delete state.errors[k];
        } catch (e) {
          fail(k, e);
        }
      })
    );
    const names = new Set();
    Object.values(state.data).forEach((arr) => arr.forEach((s) => names.add(s.name)));

    // 第二階段：Google + ATCF 模式路徑（需要先知道有哪些颱風、在哪）
    ['GFS', 'GOOG', 'UKM', 'CMC', 'NGX'].forEach((k) => { state.data[k] = []; delete state.errors[k]; });
    if (names.size) {
      let google = [];
      try { google = await fetchGoogle(); } catch (e) { fail('GOOG', e); }
      for (const name of names) {
        const cur = currentPos(name);
        if (!cur) continue;
        let best = null, bestD = 5; // 現況位置差 5 度以內才算同一颱風
        google.forEach((g) => {
          const d = Math.hypot(g.pts[0].lat - cur.lat, g.pts[0].lon - cur.lon);
          if (d < bestD) { best = g; bestD = d; }
        });
        if (!best) continue;
        state.data.GOOG.push({ name, init: best.init, pts: best.pts });
        try {
          const atcf = await fetchAtcf(best.trackId);
          Object.keys(atcf).forEach((k) => state.data[k].push({ name, init: atcf[k].init, pts: atcf[k].pts }));
        } catch (e) {
          ['GFS', 'UKM', 'CMC', 'NGX'].forEach((k) => { state.errors[k] = e.message; });
        }
      }
    }
    state.storms = [...names];
    if (!state.selected || !names.has(state.selected)) state.selected = state.storms[0] || null;
    state.loadedAt = Date.now();
  }

  // ---------- 地圖 ----------
  let layerGroup = null;

  function twTime(ms) {
    return new Date(ms).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function drawTracks() {
    const L = win.L;
    const map = win.W && win.W.map && win.W.map.map;
    if (!L || !map) return;
    if (layerGroup) layerGroup.remove();
    layerGroup = L.layerGroup();
    if (state.selected) {
      Object.keys(AGENCIES).forEach((k) => {
        if (!state.visible[k]) return;
        const s = (state.data[k] || []).find((x) => x.name === state.selected);
        if (!s || !s.pts.length) return;
        const color = AGENCIES[k].color;
        L.polyline(s.pts.map((p) => [p.lat, p.lon]), { color, weight: 3, opacity: 0.95 }).addTo(layerGroup);
        // Windy 地圖是 Leaflet + MapLibre GL 混合版，圓點不支援 tooltip，改用 divIcon 直接把時間標在點旁邊
        s.pts.forEach((p, i) => {
          const size = i === 0 ? 12 : 8;
          const label = (i === 0 ? '現況 ' : '') + twTime(p.t) + (p.kt ? ` ${p.kt}kt` : '');
          const html =
            `<div style="display:flex;align-items:center;gap:3px;white-space:nowrap;pointer-events:none">` +
            `<span style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:1.5px solid #fff;display:inline-block"></span>` +
            `<span style="font:600 11px sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 0 2px #000">${label}</span></div>`;
          L.marker([p.lat, p.lon], {
            icon: L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [size / 2, size / 2] }),
            interactive: false,
          }).addTo(layerGroup);
        });
      });
    }
    layerGroup.addTo(map);
  }

  function fitTracks() {
    const L = win.L;
    const map = win.W && win.W.map && win.W.map.map;
    if (!L || !map || !state.selected) return;
    const pts = [];
    Object.keys(AGENCIES).forEach((k) => {
      if (!state.visible[k]) return;
      const s = (state.data[k] || []).find((x) => x.name === state.selected);
      if (s) s.pts.forEach((p) => pts.push([p.lat, p.lon]));
    });
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60] });
  }

  // ---------- 模型更新時間（估計） ----------
  const MODELS = [
    { label: '🇪🇺 ECMWF', cycleHours: 6, delayHours: 6.5 },
    { label: '🇺🇸 GFS', cycleHours: 6, delayHours: 4.5 },
    { label: '🇺🇸 NAM', cycleHours: 6, delayHours: 3.5 },
    { label: '🇩🇪 ICON', cycleHours: 6, delayHours: 3.75 },
    { label: '🇯🇵 MSM', cycleHours: 3, delayHours: 2.5 },
    { label: '🇬🇧 UKMO', cycleHours: 6, delayHours: 4.5 },
  ];
  const pad2 = (n) => String(n).padStart(2, '0');
  function fmtDur(ms) {
    const sign = ms < 0 ? '-' : '';
    ms = Math.abs(ms);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h <= 0 ? `${sign}${m}分鐘` : `${sign}${h}小時${m}分鐘`;
  }
  function modelRows(nowMs) {
    return MODELS.map((m) => {
      const cyc = m.cycleHours * 3600000;
      const del = m.delayHours * 3600000;
      const run = Math.floor((nowMs - del) / cyc) * cyc;
      const d = new Date(run);
      return {
        label: m.label,
        run: `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}Z`,
        ago: fmtDur(nowMs - run),
        next: fmtDur(run + cyc + del - nowMs),
      };
    });
  }

  // ---------- 面板 ----------
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', right: '10px', bottom: '10px', zIndex: 2147483647 });
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .box { font-family: -apple-system,"Segoe UI","Microsoft JhengHei",sans-serif; font-size:12px; background:rgba(20,24,30,.9);
      color:#e8eef5; border-radius:8px; padding:6px 10px; box-shadow:0 2px 8px rgba(0,0,0,.35); line-height:1.5; max-width:310px; }
    .head { cursor:pointer; white-space:nowrap; user-select:none; }
    .sec { margin-top:8px; padding-top:6px; border-top:1px solid #3a4452; }
    .sec b { color:#9fb0c0; font-weight:600; }
    label.ag { display:flex; align-items:center; gap:6px; cursor:pointer; margin:2px 0; }
    .sw { display:inline-block; width:14px; height:4px; border-radius:2px; }
    select, button { font-size:12px; background:#2a323d; color:#e8eef5; border:1px solid #46525f; border-radius:4px; padding:1px 6px; }
    button { cursor:pointer; }
    table { border-collapse:collapse; width:100%; } td { padding:1px 6px 1px 0; white-space:nowrap; }
    .dim { color:#8a97a5; font-size:10px; } .err { color:#ff8a80; font-size:11px; }
  `;
  shadow.appendChild(style);
  const box = document.createElement('div');
  box.className = 'box';
  shadow.appendChild(box);

  let expanded = true;
  try { expanded = localStorage.getItem('windyTyphoonExpanded') !== '0'; } catch (e) {}

  function render() {
    const nowMs = Date.now();
    if (!expanded) {
      box.innerHTML = `<div class="head">🌀 颱風路徑${state.selected ? '：' + state.selected : ''} ▾</div>`;
      box.querySelector('.head').onclick = () => { expanded = true; try { localStorage.setItem('windyTyphoonExpanded', '1'); } catch (e) {} render(); };
      return;
    }
    let html = `<div class="head">🌀 各國颱風預報路徑 ▴</div><div class="sec">`;
    if (!state.loadedAt) {
      html += '載入中…';
    } else if (!state.storms.length) {
      html += '目前三個氣象單位都沒有生效中的颱風。';
    } else {
      html += `颱風：<select id="storm">${state.storms.map((n) => `<option ${n === state.selected ? 'selected' : ''}>${n}</option>`).join('')}</select> <button id="fit">飛到颱風</button>`;
      html += Object.keys(AGENCIES).map((k) => {
        const s = (state.data[k] || []).find((x) => x.name === state.selected);
        const info = s ? `發布 ${twTime(s.init)}` : '<span class="dim">沒有這顆颱風的資料</span>';
        return `<label class="ag"><input type="checkbox" data-k="${k}" ${state.visible[k] ? 'checked' : ''}><span class="sw" style="background:${AGENCIES[k].color}"></span>${AGENCIES[k].label}<span class="dim">${info}</span></label>`;
      }).join('');
      html += `<div class="dim">地圖上每個點標示預報時間（台灣時間）與最大風速（kt 節）。</div>`;
    }
    Object.keys(state.errors).forEach((k) => { html += `<div class="err">${AGENCIES[k].label} 抓取失敗：${state.errors[k]}</div>`; });
    html += `</div><div class="sec"><b>模型更新時間（估計）</b><table>` +
      modelRows(nowMs).map((r) => `<tr><td>${r.label}</td><td>${r.run}</td><td>${r.ago}前</td><td>約${r.next}後更新</td></tr>`).join('') +
      `</table><div class="dim">依各模型週期與一般延遲推算，非 Windy 官方時間。</div></div>`;
    box.innerHTML = html;
    box.querySelector('.head').onclick = () => { expanded = false; try { localStorage.setItem('windyTyphoonExpanded', '0'); } catch (e) {} render(); };
    const sel = box.querySelector('#storm');
    if (sel) sel.onchange = () => { state.selected = sel.value; drawTracks(); render(); fitTracks(); };
    const fit = box.querySelector('#fit');
    if (fit) fit.onclick = fitTracks;
    box.querySelectorAll('input[data-k]').forEach((cb) => {
      cb.onchange = () => { state.visible[cb.dataset.k] = cb.checked; drawTracks(); };
    });
  }

  async function refresh(firstTime) {
    await loadAll();
    drawTracks();
    render();
    if (firstTime) fitTracks();
  }

  function start() {
    if (!document.body) return requestAnimationFrame(start);
    document.body.appendChild(host);
    render();
    const wait = setInterval(() => {
      if (win.W && win.W.map && win.W.map.map && win.L) {
        clearInterval(wait);
        refresh(true);
        setInterval(() => refresh(false), REFRESH_MS);
        setInterval(render, 60000);
      }
    }, 500);
  }
  start();
})();
