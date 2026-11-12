/* Virtual Lab: กรอบการทดลองกลาง
   แต่ละหน้าการทดลองเรียก Lab.init(cfg) โดย cfg มี
   id, title, level, intro{objective[], theory, equipment[], procedure[], safety?},
   table{columns[], rows}, graph{x, y, xlabel, ylabel, origin, xFrom?}, results(fit, rows, truth),
   questions[], apparatus(stageEl, ctrlEl, api)
   คอลัมน์ตาราง: {key, label, input:true} หรือ {key, label, calc:(r, rows, i) => number, digits} */
(function () {
  'use strict';
  const Lab = (window.Lab = {});

  /* ---------- ที่เก็บข้อมูลบนเครื่อง (ไม่พังถ้าเบราว์เซอร์ปิด storage) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  Lab.store = store;

  /* ---------- สุ่มแบบมี seed: นักเรียนแต่ละเครื่องได้ค่าซ่อน (เช่น k, R, n) ต่างกันเล็กน้อย ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Lab.rng = function (id) {
    let seed = store.get('vl-seed-' + id, null);
    if (seed == null) { seed = Math.floor(Math.random() * 2147483647); store.set('vl-seed-' + id, seed); }
    return mulberry32(seed);
  };
  Lab.gauss = function (rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const noise = mulberry32((Date.now() & 0xffff) + 7);
  Lab.noise = (sd) => Lab.gauss(noise) * sd;

  /* ---------- ตัวเลข ---------- */
  Lab.fmt = function (v, d) {
    if (!isFinite(v)) return '–';
    return (d == null ? +v.toPrecision(4) : v.toFixed(d)).toString();
  };
  // ตัวเลขนัยสำคัญตามความไม่แน่นอน: ปัดความไม่แน่นอนเป็น 1–2 หลัก แล้วปัดค่าตามหลักเดียวกัน
  Lab.fmtUnc = function (v, u) {
    if (!isFinite(v)) return '–';
    if (!isFinite(u) || u <= 0) return Lab.fmt(v);
    const p = Math.floor(Math.log10(u));
    const lead = u / Math.pow(10, p);
    const dec = Math.max(0, -(p - (lead < 2 ? 1 : 0)));
    return v.toFixed(dec) + ' ± ' + u.toFixed(dec);
  };
  Lab.parse = function (s) {
    if (s == null) return NaN;
    s = String(s).trim().replace(',', '.').replace('−', '-');
    if (s === '') return NaN;
    const v = Number(s);
    return isFinite(v) ? v : NaN;
  };

  /* ---------- กำลังสองน้อยที่สุด ---------- */
  Lab.fit = function (xs, ys, origin) {
    const n = xs.length;
    if (n < 2) return null;
    let m, b, sm, sb, ssr = 0, sst = 0;
    const my = ys.reduce((a, c) => a + c, 0) / n;
    if (origin) {
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
      if (sxx === 0) return null;
      m = sxy / sxx; b = 0;
      for (let i = 0; i < n; i++) ssr += (ys[i] - m * xs[i]) ** 2;
      sm = n > 1 ? Math.sqrt(ssr / (n - 1) / sxx) : NaN; sb = 0;
    } else {
      const mx = xs.reduce((a, c) => a + c, 0) / n;
      let sxx = 0, sxy = 0;
      for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
      if (sxx === 0) return null;
      m = sxy / sxx; b = my - m * mx;
      for (let i = 0; i < n; i++) ssr += (ys[i] - (m * xs[i] + b)) ** 2;
      sm = n > 2 ? Math.sqrt(ssr / (n - 2) / sxx) : NaN;
      sb = n > 2 ? Math.sqrt(ssr / (n - 2) * (1 / n + mx * mx / sxx)) : NaN;
    }
    for (let i = 0; i < n; i++) sst += (ys[i] - my) ** 2;
    return { m, b, sm, sb, r2: sst > 0 ? 1 - ssr / sst : 1, n, origin: !!origin };
  };

  /* ---------- canvas ที่ปรับตามขนาดจอและ devicePixelRatio ---------- */
  Lab.canvas = function (canvas, onResize) {
    const ctx = canvas.getContext('2d');
    const o = { canvas, ctx, w: 0, h: 0, dpr: 1, onResize };
    function fit() {
      const r = canvas.getBoundingClientRect();
      if (r.width === 0) return;
      o.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      o.w = r.width; o.h = r.height;
      canvas.width = Math.round(r.width * o.dpr); canvas.height = Math.round(r.height * o.dpr);
      ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
      if (o.onResize) o.onResize(o);
    }
    o.fit = fit;
    if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas); else window.addEventListener('resize', fit);
    fit();
    return o;
  };
  Lab.css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; };
  Lab.dark = function () {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  };

  // ลูปแอนิเมชัน: fn(dt) คืนค่า true เมื่อต้องการให้วาดต่อ ระบบหยุดเองเมื่อแท็บถูกซ่อน
  // maxDt: เพดานช่วงเวลาต่อเฟรม (การทดลองที่ต้องจับเวลาจริงให้ใช้ค่าสูง เพื่อให้เวลาในฉากตรงกับนาฬิกา)
  Lab.loop = function (fn, maxDt) {
    let last = 0;
    maxDt = maxDt || 0.05;
    function tick(t) {
      const dt = last ? Math.min((t - last) / 1000, maxDt) : 0;
      last = t;
      fn(dt, t / 1000);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  /* ---------- แว่นขยาย: ใช้อ่านสเกลละเอียด
     scene(ctx, zoom) ต้องวาดฉากทั้งหมดในพิกัด CSS px โดย zoom บอกระดับการขยายเพื่อเลือกวาดขีดย่อย ---------- */
  Lab.lens = function (cv, opts) {
    opts = opts || {};
    const L = { on: false, x: cv.w * 0.5, y: cv.h * 0.5, zoom: opts.zoom || 5, r: opts.r || 70, touch: false, placed: false };
    L.draw = function (scene) {
      if (!L.on || !L.placed) return;
      const ctx = cv.ctx;
      const off = L.touch ? L.r + 30 : 0;
      const cx = Math.min(Math.max(L.x, L.r + 4), cv.w - L.r - 4);
      const cy = Math.min(Math.max(L.y - off, L.r + 4), cv.h - L.r - 4); // ไม่ให้แว่นล้นขอบบนหรือล่าง
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, L.r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = Lab.css('--soft'); ctx.fillRect(cx - L.r, cy - L.r, 2 * L.r, 2 * L.r);
      ctx.translate(cx, cy); ctx.scale(L.zoom, L.zoom); ctx.translate(-L.x, -L.y);
      scene(ctx, L.zoom);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = Lab.css('--ink'); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, L.r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(220,40,40,.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - L.r, cy); ctx.lineTo(cx + L.r, cy); ctx.stroke();
      ctx.font = '12px Sarabun, sans-serif'; ctx.fillStyle = Lab.css('--muted');
      ctx.fillText('×' + L.zoom, cx + L.r * 0.55, cy + L.r * 0.85);
      ctx.restore();
    };
    // ใช้ร่วมกับตัวจัดการ pointer ของการทดลอง: คืน true ถ้าแว่นขยายรับเหตุการณ์นี้ไปแล้ว
    L.handle = function (e, x, y) {
      if (!L.on) return false;
      if (e.type === 'pointerdown' || (e.type === 'pointermove' && e.buttons)) {
        L.x = x; L.y = y; L.placed = true; L.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      }
      return true;
    };
    L.button = function (parent) {
      const b = document.createElement('button');
      b.className = 'btn lensbtn no-print';
      b.innerHTML = '🔍 แว่นขยาย';
      b.title = 'เปิดแว่นขยายแล้วแตะหรือลากบนภาพเพื่ออ่านสเกล';
      b.onclick = () => { L.on = !L.on; b.classList.toggle('on', L.on); if (opts.onToggle) opts.onToggle(L.on); };
      parent.appendChild(b);
      L.btn = b;
      return b;
    };
    return L;
  };
  // แปลงตำแหน่ง pointer เป็นพิกัด CSS px ของ canvas
  Lab.pos = function (canvas, e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  /* ---------- นาฬิกาจับเวลา ---------- */
  Lab.stopwatch = function (parent, api, opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.innerHTML =
      '<div class="watch"><span class="readout">0.00</span><small>นาฬิกาจับเวลา (s)</small></div>' +
      '<div class="row"><button class="btn primary sw-go">เริ่ม</button><button class="btn sw-reset">รีเซ็ต</button></div>' +
      (opts.send ? '<div class="row"><button class="btn sw-send" disabled>บันทึกเวลาลงตาราง</button></div>' : '');
    parent.appendChild(el);
    const out = el.querySelector('.readout'), go = el.querySelector('.sw-go'), send = el.querySelector('.sw-send');
    let running = false, t0 = 0, acc = 0;
    const now = () => performance.now() / 1000;
    function value() { return acc + (running ? now() - t0 : 0); }
    function show() { out.textContent = value().toFixed(2); if (running) requestAnimationFrame(show); }
    go.onclick = function () {
      if (running) { acc += now() - t0; running = false; go.textContent = 'เริ่ม'; go.classList.add('primary'); }
      else { t0 = now(); running = true; go.textContent = 'หยุด'; go.classList.remove('primary'); requestAnimationFrame(show); }
      if (send) send.disabled = running || value() === 0;
      show();
    };
    el.querySelector('.sw-reset').onclick = function () {
      running = false; acc = 0; go.textContent = 'เริ่ม'; go.classList.add('primary'); if (send) send.disabled = true; show();
    };
    if (send) send.onclick = function () {
      const v = Math.round(value() * 100) / 100;
      if (!api.fillNext(opts.send, v.toFixed(2))) alert('ตารางเต็มแล้ว กด "เพิ่มแถว" ก่อน');
    };
    return { value, get running() { return running; } };
  };

  /* ---------- สร้างหน้าการทดลอง ---------- */
  Lab.init = function (cfg) {
    const KEY = 'vl-' + cfg.id;
    // โหมดเด็ก (ป.6–ม.1): ตัวอักษรใหญ่ ทายผลก่อนทดลอง คำถามแบบเลือกตอบ กราฟลากเส้นเชื่อมจุดแทนการหาเส้นตรง
    if (cfg.kid) document.body.classList.add('kid');
    // graph.mode: 'line' ลากเส้นเชื่อมจุด, 'bar' กราฟแท่ง (ป้ายจากคอลัมน์ข้อความ graph.label) ทั้งสองแบบไม่หาเส้นตรง
    const BAR = cfg.graph.mode === 'bar';
    const LINE = cfg.graph.mode === 'line' || BAR;
    const PRED = cfg.predict || [];
    const saved = store.get(KEY, {});
    const qStep = +new URLSearchParams(location.search).get('step'); // ลิงก์ตรงไปยังขั้น เช่น ?step=2
    const state = {
      step: qStep >= 1 && qStep <= 4 ? qStep : saved.step || 1,
      answers: saved.answers || {},
      student: saved.student || store.get('vl-student', { name: '', cls: '', no: '' }),
      origin: saved.origin != null ? saved.origin : !!cfg.graph.origin,
    };
    const inputCols = cfg.table.columns.filter((c) => c.input);
    const nRows0 = cfg.table.rows || 6;
    // ชุดข้อมูล: การทดลองที่วัดหลายอุปกรณ์ (เช่น ตัวต้านทาน A, B, หลอดไฟ) แยกตารางละชุด แต่แสดงบนกราฟเดียวกัน
    const multi = !!cfg.table.sets;
    const SETS = cfg.table.sets || [{ key: '_', label: '' }];
    state.sets = saved.sets || {};
    if (saved.rows && !saved.sets) state.sets[SETS[0].key] = saved.rows;
    SETS.forEach((st) => {
      const r = (state.sets[st.key] = state.sets[st.key] || []);
      while (r.length < nRows0) r.push({});
    });
    state.cur = saved.cur && state.sets[saved.cur] ? saved.cur : SETS[0].key;
    state.rows = state.sets[state.cur];
    const SET_COLORS = ['--accent', '--bad', '--ok', '--warn'];
    const setLabel = (k) => (SETS.find((x) => x.key === k) || {}).label || '';
    function save() {
      store.set(KEY, { step: state.step, sets: state.sets, cur: state.cur, answers: state.answers, student: state.student, origin: state.origin });
      store.set('vl-student', state.student);
    }

    const app = document.getElementById('app');
    const intro = cfg.intro;
    const list = (a, tag) => '<' + tag + '>' + a.map((x) => '<li>' + x + '</li>').join('') + '</' + tag + '>';
    app.innerHTML =
      '<div class="wrap">' +
      '<div class="crumbs no-print"><a href="../../">ห้องปฏิบัติการเสมือน</a><span>›</span><a href="../">' + (cfg.subject || 'ฟิสิกส์') + '</a><span>›</span>' + cfg.short + '</div>' +
      '<div class="exp-head"><h1>' + cfg.title + '</h1><span class="chip">' + cfg.level + '</span></div>' +
      '<div class="print-only" id="pStudent"></div>' +
      '<div class="steps no-print">' +
      ['เตรียมการทดลอง', 'ทดลองและบันทึกผล', 'วิเคราะห์ผล', 'สรุปและส่งรายงาน']
        .map((s, i) => '<button data-go="' + (i + 1) + '"><b>' + (i + 1) + '</b>' + s + '</button>').join('') +
      '</div>' +
      // ขั้น 1
      '<section class="step" data-step="1">' +
      '<div class="two">' +
      '<div class="card"><h2>จุดประสงค์</h2>' + list(intro.objective, 'ul') + '<h2 style="margin-top:14px">' + (cfg.kid ? 'ความรู้ก่อนทดลอง' : 'ทฤษฎีที่เกี่ยวข้อง') + '</h2>' + intro.theory + '</div>' +
      '<div class="card">' + (intro.plan ? '<h2>แผนการเรียน (ประมาณ ' + intro.plan.reduce((a, p) => a + p[0], 0) + ' นาที)</h2><table class="res plan">' +
        intro.plan.map((p) => '<tr><td>' + p[1] + '</td><td>' + p[0] + ' นาที</td></tr>').join('') + '</table><h2 style="margin-top:14px">อุปกรณ์</h2>' : '<h2>อุปกรณ์</h2>') + list(intro.equipment, 'ul') + '<h2 style="margin-top:14px">วิธีการทดลอง</h2>' + list(intro.procedure, 'ol') +
      (intro.tip ? '<div class="note">' + intro.tip + '</div>' : '') + '</div>' +
      '</div>' +
      (PRED.length ? '<div class="card qa" style="margin-top:14px"><h2>ทายก่อนทดลอง</h2><p class="muted" style="font-size:14px">ยังไม่ต้องรู้คำตอบ เลือกข้อที่คิดว่าน่าจะเป็น แล้วไปทดลองดูว่าจริงหรือไม่</p><div id="predQ"></div></div>' : '') +
      '<div class="card no-print" style="margin-top:14px"><h2>ผู้ทำการทดลอง</h2><div class="field">' +
      '<div><label>ชื่อ-นามสกุล</label><input id="stName"></div><div><label>ชั้น</label><input id="stCls"></div><div><label>เลขที่</label><input id="stNo" inputmode="numeric"></div>' +
      '</div></div>' +
      '<div class="navrow"><span></span><button class="btn primary" data-go="2">เริ่มทดลอง →</button></div>' +
      '</section>' +
      // ขั้น 2
      '<section class="step" data-step="2">' +
      '<div class="bench"><div class="card stage" id="stage"></div><div class="card ctrls" id="ctrls"></div></div>' +
      '<div class="card"><h2>ตารางบันทึกผลการทดลอง</h2>' + (cfg.table.hint ? '<p class="muted no-print" style="font-size:14px">' + cfg.table.hint + '</p>' : '') +
      (multi ? '<div class="seg no-print setseg" style="max-width:520px"></div><p class="print-only" id="pSet"></p>' : '') +
      '<div class="tablewrap"><table class="data" id="dataTable"></table></div>' +
      '<div class="row no-print" style="margin-top:10px"><button class="btn" id="addRow">+ เพิ่มแถว</button><button class="btn" id="delRow">− ลบแถวสุดท้าย</button>' +
      '<button class="btn" id="clrTable">ล้างตาราง</button><button class="btn" id="csv">ดาวน์โหลด CSV</button></div></div>' +
      '<div class="navrow"><button class="btn" data-go="1">← เตรียมการ</button><button class="btn primary" data-go="3">วิเคราะห์ผล →</button></div>' +
      '</section>' +
      // ขั้น 3
      '<section class="step" data-step="3">' +
      '<div class="bench"><div class="card graph"><h2>กราฟ ' + cfg.graph.title + '</h2><canvas id="graph"></canvas>' +
      '<p class="fitline" id="fitLine"></p></div>' +
      '<div class="card"><h2>การวิเคราะห์</h2>' +
      '<label class="no-print" style="display:' + (LINE ? 'none' : 'flex') + ';gap:8px;align-items:center;margin-bottom:8px"><input type="checkbox" id="origin"> บังคับเส้นตรงผ่านจุด (0, 0)</label>' +
      (multi ? '<p style="font-size:14px;margin:0 0 4px">แสดงผลของชุดข้อมูล</p><div class="seg no-print setseg"></div>' : '') +
      '<p class="muted" style="font-size:14px">' + (cfg.graph.explain || '') + '</p>' +
      '<table class="res" id="results"></table><div id="truth"></div></div></div>' +
      '<div class="navrow"><button class="btn" data-go="2">← กลับไปทดลอง</button><button class="btn primary" data-go="4">สรุปผล →</button></div>' +
      '</section>' +
      // ขั้น 4
      '<section class="step" data-step="4">' +
      (PRED.length ? '<div class="card qa"><h2>เทียบกับที่ทายไว้</h2><div id="predCheck"></div></div>' : '') +
      '<div class="card qa"><h2>คำถามท้ายการทดลอง</h2><div id="qs"></div></div>' +
      '<div class="card qa"><h2>สรุปผลการทดลอง</h2><div id="concl"></div></div>' +
      '<div class="card no-print"><h2>ส่งรายงาน</h2><p class="muted" style="font-size:14px">กด "พิมพ์รายงาน" แล้วเลือก "บันทึกเป็น PDF" เพื่อส่งครู ข้อมูลทั้งหมดบันทึกอัตโนมัติบนเครื่องนี้</p>' +
      '<div class="row"><button class="btn primary" id="print">พิมพ์รายงาน / บันทึก PDF</button><button class="btn" id="csv2">ดาวน์โหลด CSV</button><button class="btn" id="resetAll">เริ่มการทดลองใหม่ทั้งหมด</button></div></div>' +
      '<div class="navrow"><button class="btn" data-go="3">← วิเคราะห์ผล</button><a class="btn" href="../" style="text-decoration:none">กลับหน้ารวมการทดลอง</a></div>' +
      '</section>' +
      '</div>';

    // ---------- เปลี่ยนขั้น ----------
    function go(n) {
      state.step = n; save();
      app.querySelectorAll('.step').forEach((s) => s.classList.toggle('on', +s.dataset.step === n));
      app.querySelectorAll('.steps button').forEach((b) => b.classList.toggle('on', +b.dataset.go === n));
      if (n === 3) { analyse(); }
      if (n === 4) PRED.forEach((p, i) => { const el = document.getElementById('pv' + i); if (el) el.textContent = state.answers['p' + i] != null ? p.choices[state.answers['p' + i]] : 'ยังไม่ได้ทาย'; });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (api.onStep) api.onStep(n);
    }
    app.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) go(+b.dataset.go);
    });

    // ---------- ข้อมูลนักเรียน ----------
    [['stName', 'name'], ['stCls', 'cls'], ['stNo', 'no']].forEach(([id, k]) => {
      const el = document.getElementById(id);
      el.value = state.student[k] || '';
      el.oninput = () => { state.student[k] = el.value; save(); };
    });

    // ---------- ตาราง ----------
    const tbl = document.getElementById('dataTable');
    function values(r) {
      const o = {};
      inputCols.forEach((c) => (o[c.key] = Lab.parse(r[c.key])));
      return o;
    }
    // คำนวณคอลัมน์ calc ตามลำดับ (คอลัมน์หลังใช้ผลคอลัมน์ก่อนได้)
    function computed(rows) {
      const base = (rows || state.rows).map(values);
      cfg.table.columns.forEach((c) => {
        if (!c.calc) return;
        base.forEach((r, i) => { try { r[c.key] = c.calc(r, base, i); } catch (e) { r[c.key] = NaN; } });
      });
      return base;
    }
    Lab.computed = computed;
    function renderTable() {
      const cols = cfg.table.columns;
      let h = '<thead><tr><th>ครั้งที่</th>' + cols.map((c) => '<th class="' + (c.calc ? 'calc' : '') + '">' + c.label + '</th>').join('') + '</tr></thead><tbody>';
      state.rows.forEach((r, i) => {
        h += '<tr><td class="n">' + (i + 1) + '</td>' + cols.map((c) =>
          c.input
            ? '<td><input data-r="' + i + '" data-k="' + c.key + '"' + (c.text ? ' class="txt"' : ' inputmode="decimal"') + ' autocomplete="off" value="' + (r[c.key] != null ? String(r[c.key]).replace(/"/g, '') : '') + '"></td>'
            : '<td class="calc" data-r="' + i + '" data-c="' + c.key + '"></td>').join('') + '</tr>';
      });
      tbl.innerHTML = h + '</tbody>';
      updateCalc();
    }
    function updateCalc() {
      const cv = computed();
      tbl.querySelectorAll('td.calc').forEach((td) => {
        const c = cfg.table.columns.find((x) => x.key === td.dataset.c);
        const v = cv[+td.dataset.r][c.key];
        td.textContent = isFinite(v) ? Lab.fmt(v, c.digits) : '';
      });
    }
    tbl.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.dataset.k) return;
      state.rows[+el.dataset.r][el.dataset.k] = el.value;
      const col = cfg.table.columns.find((c) => c.key === el.dataset.k);
      el.classList.toggle('bad', !(col && col.text) && el.value.trim() !== '' && !isFinite(Lab.parse(el.value)));
      save(); updateCalc();
    });
    // Enter เลื่อนไปช่องถัดไปในคอลัมน์เดียวกัน
    tbl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.dataset.k) return;
      e.preventDefault();
      const nx = tbl.querySelector('input[data-r="' + (+e.target.dataset.r + 1) + '"][data-k="' + e.target.dataset.k + '"]');
      if (nx) nx.focus(); else e.target.blur();
    });
    document.getElementById('addRow').onclick = () => { state.rows.push({}); save(); renderTable(); };
    document.getElementById('delRow').onclick = () => { if (state.rows.length > 1) { state.rows.pop(); save(); renderTable(); } };
    document.getElementById('clrTable').onclick = () => {
      if (!confirm(multi ? 'ล้างข้อมูลในตารางของ "' + setLabel(state.cur) + '"?' : 'ล้างข้อมูลในตารางทั้งหมด?')) return;
      state.rows = state.sets[state.cur] = []; while (state.rows.length < nRows0) state.rows.push({}); save(); renderTable();
    };
    function csv() {
      const cols = cfg.table.columns;
      const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const lines = [(multi ? ['ชุดข้อมูล'] : []).concat(['ครั้งที่'], cols.map((c) => strip(c.label)))];
      SETS.forEach((st) => {
        const rows = state.sets[st.key], cv = computed(rows);
        rows.forEach((r, i) => lines.push((multi ? [st.label] : []).concat([i + 1], cols.map((c) => (c.input ? r[c.key] || '' : isFinite(cv[i][c.key]) ? Lab.fmt(cv[i][c.key], c.digits) : '')))));
      });
      const text = '﻿' + lines.map((l) => l.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      a.download = cfg.id + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    }
    document.getElementById('csv').onclick = csv;
    document.getElementById('csv2').onclick = csv;

    function renderSetSeg(el) {
      el.innerHTML = SETS.map((st) => '<button data-set="' + st.key + '" class="' + (st.key === state.cur ? 'on' : '') + '">' + st.label + '</button>').join('');
    }
    function useSet(k, fromApparatus) {
      if (!state.sets[k] || k === state.cur) return;
      state.cur = k; state.rows = state.sets[k]; save(); renderTable();
      app.querySelectorAll('.setseg').forEach(renderSetSeg);
      const ps = document.getElementById('pSet'); if (ps) ps.textContent = 'ชุดข้อมูล: ' + setLabel(k);
      if (state.step === 3) analyse();
      if (!fromApparatus && api.onSetChange) api.onSetChange(k);
    }
    app.addEventListener('click', (e) => { const b = e.target.closest('[data-set]'); if (b) useSet(b.dataset.set); });
    app.querySelectorAll('.setseg').forEach(renderSetSeg);
    { const ps = document.getElementById('pSet'); if (ps) ps.textContent = 'ชุดข้อมูล: ' + setLabel(state.cur); }

    // ---------- กราฟ ----------
    const gEl = document.getElementById('graph');
    let gcv = null;
    const originBox = document.getElementById('origin');
    originBox.checked = state.origin;
    originBox.onchange = () => { state.origin = originBox.checked; save(); analyse(); };
    let lastFit = null, fits = {};
    function points(rows) {
      const cv = computed(rows), g = cfg.graph;
      return cv.map((r) => [r[g.x], r[g.y]]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
    }
    function niceStep(range, target) {
      const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
      return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
    }
    // ข้อมูลกราฟแท่ง: [{lab, y}] ของชุดข้อมูลหนึ่ง (ป้ายเป็นข้อความดิบจากตาราง)
    function barRows(key) {
      const g = cfg.graph, raw = state.sets[key], cv = computed(raw);
      return cv.map((r, i) => ({ lab: String(raw[i][g.label] || '').trim(), y: r[g.y] })).filter((p) => p.lab && isFinite(p.y));
    }
    function drawBar() {
      const { ctx, w, h } = gcv;
      ctx.clearRect(0, 0, w, h);
      const g = cfg.graph, ink = Lab.css('--ink'), muted = Lab.css('--muted'), line = Lab.css('--line');
      const series = SETS.map((st, k) => ({ st, rows: barRows(st.key), col: Lab.css(multi ? SET_COLORS[k % 4] : '--accent') })).filter((d) => d.rows.length);
      const labels = [];
      series.forEach((d) => d.rows.forEach((p) => { if (!labels.includes(p.lab)) labels.push(p.lab); }));
      const ys = [].concat(...series.map((d) => d.rows.map((p) => p.y)));
      const ml = 62, mr = 16, mt = multi && series.length ? 36 : 14, mb = 64; // คำอธิบายสีอยู่เหนือพื้นที่กราฟ ไม่ทับแท่ง
      let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys); if (!ys.length) y1 = g.ymax || 1; y1 = y1 || 1;
      const sy = niceStep(y1 - y0, 6); y1 = Math.ceil((y1 * 1.06) / sy) * sy; y0 = Math.floor(y0 / sy) * sy;
      const Y = (v) => h - mb - ((v - y0) / (y1 - y0)) * (h - mt - mb);
      ctx.font = '12px Sarabun, sans-serif'; ctx.lineWidth = 1;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = muted;
      const dec = Math.max(0, -Math.floor(Math.log10(sy) + 1e-9));
      for (let v = y0; v <= y1 + 1e-9; v += sy) {
        ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(ml, Y(v)); ctx.lineTo(w - mr, Y(v)); ctx.stroke();
        ctx.fillText(v.toFixed(dec), ml - 6, Y(v));
      }
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ml, Y(Math.max(y0, 0))); ctx.lineTo(w - mr, Y(Math.max(y0, 0))); ctx.stroke();
      const gw = (w - ml - mr) / Math.max(1, labels.length);
      labels.forEach((lab, j) => {
        const n = series.length, bw = Math.min(46, (gw * 0.72) / Math.max(1, n));
        series.forEach((d, k) => {
          const p = d.rows.find((q) => q.lab === lab); if (!p) return;
          const x = ml + gw * (j + 0.5) - (n * bw) / 2 + k * bw;
          ctx.fillStyle = d.col; ctx.globalAlpha = d.st.key === state.cur || !multi ? 0.9 : 0.55;
          ctx.fillRect(x + 1, Math.min(Y(p.y), Y(0)), bw - 2, Math.abs(Y(p.y) - Y(0)));
          ctx.globalAlpha = 1;
        });
        ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '12.5px Sarabun, sans-serif';
        let s = lab; while (s.length > 2 && ctx.measureText(s).width > gw - 6) s = s.slice(0, -1);
        ctx.fillText(s === lab ? s : s + '…', ml + gw * (j + 0.5), Y(Math.max(y0, 0)) + 6);
      });
      ctx.fillStyle = ink; ctx.font = '13.5px Sarabun, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(g.xlabel, (ml + w - mr) / 2, h - 4);
      ctx.save(); ctx.translate(14, (mt + h - mb) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(g.ylabel, 0, 0); ctx.restore();
      if (multi && series.length) {
        ctx.font = '12.5px Sarabun, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        let lx = ml;
        series.forEach((d) => { ctx.fillStyle = d.col; ctx.fillRect(lx, 9, 10, 10); ctx.fillStyle = ink; ctx.fillText(d.st.label, lx + 15, 14); lx += 30 + ctx.measureText(d.st.label).width; });
      }
      if (!labels.length) { ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ยังไม่มีข้อมูล กลับไปขั้นที่ 2 เพื่อทดลองและบันทึกผล', (ml + w) / 2, (mt + h - mb) / 2); }
    }
    function drawGraph() {
      if (!gcv) { gcv = Lab.canvas(gEl); gcv.onResize = drawGraph; } // กำหนดหลังสร้าง กันการเรียกซ้อนไม่รู้จบ
      if (BAR) { if (gcv.w) drawBar(); return; }
      const { ctx, w, h } = gcv;
      if (!w) return;
      ctx.clearRect(0, 0, w, h);
      const g = cfg.graph;
      const all = SETS.map((st, k) => ({ st, pts: points(state.sets[st.key]), fit: fits[st.key], col: Lab.css(SET_COLORS[k % 4]) })).filter((d) => d.pts.length);
      const pts = [].concat(...all.map((d) => d.pts));
      const ml = 62, mr = 16, mt = 14, mb = 48;
      let x1 = Math.max(0, ...pts.map((p) => p[0])), y1 = Math.max(0, ...pts.map((p) => p[1]));
      let x0 = Math.min(0, ...pts.map((p) => p[0])), y0 = Math.min(0, ...pts.map((p) => p[1]));
      if (!pts.length) { x1 = g.xmax || 1; y1 = g.ymax || 1; }
      x1 = x1 || 1; y1 = y1 || 1;
      const sx = niceStep(x1 - x0, 6), sy = niceStep(y1 - y0, 6);
      x1 = Math.ceil((x1 * 1.04) / sx) * sx; y1 = Math.ceil((y1 * 1.06) / sy) * sy;
      x0 = Math.floor(x0 / sx) * sx; y0 = Math.floor(y0 / sy) * sy;
      const X = (v) => ml + ((v - x0) / (x1 - x0)) * (w - ml - mr);
      const Y = (v) => h - mb - ((v - y0) / (y1 - y0)) * (h - mt - mb);
      const ink = Lab.css('--ink'), muted = Lab.css('--muted'), line = Lab.css('--line'), acc = Lab.css('--accent');
      ctx.font = '12px Sarabun, sans-serif'; ctx.lineWidth = 1;
      // เส้นตาราง: ช่องใหญ่ + ช่องย่อย 5 ช่อง เหมือนกระดาษกราฟ
      ctx.strokeStyle = line; ctx.globalAlpha = 0.45;
      for (let v = x0; v <= x1 + 1e-9; v += sx / 5) { ctx.beginPath(); ctx.moveTo(X(v), Y(y0)); ctx.lineTo(X(v), Y(y1)); ctx.stroke(); }
      for (let v = y0; v <= y1 + 1e-9; v += sy / 5) { ctx.beginPath(); ctx.moveTo(X(x0), Y(v)); ctx.lineTo(X(x1), Y(v)); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const dec = (s) => Math.max(0, -Math.floor(Math.log10(s) + 1e-9));
      for (let v = x0; v <= x1 + 1e-9; v += sx) {
        ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(X(v), Y(y0)); ctx.lineTo(X(v), Y(y1)); ctx.stroke();
        ctx.fillText(v.toFixed(dec(sx)), X(v), Y(y0) + 5);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let v = y0; v <= y1 + 1e-9; v += sy) {
        ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(X(x0), Y(v)); ctx.lineTo(X(x1), Y(v)); ctx.stroke();
        ctx.fillText(v.toFixed(dec(sy)), X(x0) - 6, Y(v));
      }
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(X(x0), Y(Math.max(y0, 0))); ctx.lineTo(X(x1), Y(Math.max(y0, 0))); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(Math.max(x0, 0)), Y(y0)); ctx.lineTo(X(Math.max(x0, 0)), Y(y1)); ctx.stroke();
      ctx.fillStyle = ink; ctx.font = '13.5px Sarabun, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(g.xlabel, (ml + w - mr) / 2, h - 4);
      ctx.save(); ctx.translate(14, (mt + h - mb) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(g.ylabel, 0, 0); ctx.restore();
      all.forEach((d) => {
        const fit = d.fit, cur = d.st.key === state.cur;
        if (fit) {
          ctx.save(); ctx.beginPath(); ctx.rect(ml, mt, w - ml - mr, h - mt - mb); ctx.clip();
          ctx.strokeStyle = multi ? d.col : acc; ctx.lineWidth = cur ? 2 : 1.2; ctx.globalAlpha = cur ? 1 : 0.55;
          ctx.beginPath(); ctx.moveTo(X(x0), Y(fit.m * x0 + fit.b)); ctx.lineTo(X(x1), Y(fit.m * x1 + fit.b)); ctx.stroke();
          ctx.restore();
        }
        if (LINE && d.pts.length > 1) {
          const sp = d.pts.slice().sort((a, b) => a[0] - b[0]);
          ctx.strokeStyle = multi ? d.col : acc; ctx.lineWidth = cur || !multi ? 2 : 1.3; ctx.globalAlpha = cur || !multi ? 1 : 0.6;
          ctx.beginPath(); sp.forEach((p, j) => (j ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = multi ? d.col : Lab.css('--bad');
        d.pts.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 4.2, 0, Math.PI * 2); ctx.fill(); });
      });
      if (multi && all.length) {
        // คำอธิบายสี: วางที่มุมบนที่มีจุดข้อมูลน้อยกว่า พร้อมพื้นหลังทึบเล็กน้อย
        ctx.font = '12.5px Sarabun, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const lw = 34 + Math.max(...all.map((d) => ctx.measureText(d.st.label).width)), lh = 8 + all.length * 18;
        const inBox = (x0) => pts.filter((p) => X(p[0]) > x0 - 6 && X(p[0]) < x0 + lw + 6 && Y(p[1]) < mt + lh + 6).length;
        const lx = inBox(ml + 4) <= inBox(w - mr - lw - 4) ? ml + 4 : w - mr - lw - 4;
        ctx.fillStyle = Lab.css('--panel'); ctx.globalAlpha = 0.85; ctx.fillRect(lx, mt + 1, lw, lh); ctx.globalAlpha = 1;
        all.forEach((d, k) => {
          const yy = mt + 10 + k * 18;
          ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(lx + 10, yy, 4.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = ink; ctx.fillText(d.st.label, lx + 20, yy);
        });
      }
      if (!pts.length) {
        ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ยังไม่มีข้อมูล กลับไปขั้นที่ 2 เพื่อทดลองและบันทึกผล', (ml + w) / 2, (mt + h - mb) / 2);
      }
    }
    function analyse() {
      fits = {};
      SETS.forEach((st) => {
        const p = points(state.sets[st.key]);
        fits[st.key] = p.length >= 2 ? Lab.fit(p.map((q) => q[0]), p.map((q) => q[1]), state.origin) : null;
      });
      if (LINE) fits = {};
      lastFit = fits[state.cur];
      app.querySelectorAll('.setseg').forEach(renderSetSeg);
      requestAnimationFrame(drawGraph);
      const fl = document.getElementById('fitLine'), res = document.getElementById('results');
      let rows;
      if (LINE) {
        const np = BAR ? barRows(state.cur).length : points(state.rows).length;
        fl.innerHTML = '<span style="font-family:Sarabun,sans-serif;font-size:15px">' + (np ? (multi ? setLabel(state.cur) + ' · ' : '') + (BAR ? 'ข้อมูล ' + np + ' แท่ง' : 'จุดข้อมูล ' + np + ' จุด ลากเส้นเชื่อมตามลำดับ') : 'ยังไม่มีข้อมูล') + '</span>';
        rows = cfg.results ? cfg.results(null, computed(), api.truth || {}, state.cur) || [] : [];
      } else if (!lastFit) {
        fl.textContent = 'ต้องมีข้อมูลอย่างน้อย 2 จุด (แนะนำ 5 จุดขึ้นไป)';
        res.innerHTML = ''; document.getElementById('truth').innerHTML = ''; return;
      }
      else {
      const f = lastFit, g = cfg.graph;
      fl.innerHTML = (multi ? setLabel(state.cur) + ' · ' : '') + 'เส้นตรงที่เหมาะสมที่สุด: ' + g.yv + ' = (' + Lab.fmtUnc(f.m, f.sm) + ') ' + g.xv +
        (f.origin ? '' : ' ' + (f.b < 0 ? '− ' : '+ ') + Lab.fmtUnc(Math.abs(f.b), f.sb)) +
        ' &nbsp;<span class="muted" style="font-family:Sarabun,sans-serif;font-size:13px">(R² = ' + f.r2.toFixed(4) + ', ' + f.n + ' จุด)</span>';
      rows = cfg.results(f, computed(), api.truth || {}, state.cur);
      }
      res.innerHTML = rows.filter((r) => !r.hidden).map((r) => {
        let pct = '';
        if (r.accepted != null && !r.hidden) {
          const p = (Math.abs(r.value - r.accepted) / Math.abs(r.accepted)) * 100;
          pct = '<br><span class="pct ' + (p < 3 ? 'ok' : p < 8 ? 'warn' : 'bad') + '" style="font-weight:400;font-size:13px">ต่างจากค่ามาตรฐาน ' + r.accepted + ' ' + (r.unit || '') + ' อยู่ ' + p.toFixed(1) + '%</span>';
        }
        return '<tr><td>' + r.label + '</td><td>' + (r.unc != null ? Lab.fmtUnc(r.value, r.unc) : Lab.fmt(r.value, r.digits)) + ' ' + (r.unit || '') + pct + '</td></tr>';
      }).join('');
      const hid = rows.filter((r) => r.hidden && r.accepted != null);
      const tr = document.getElementById('truth');
      tr.innerHTML = hid.length ? '<div class="row no-print" style="margin-top:10px"><button class="btn" id="showTruth">เทียบกับค่าจริงของอุปกรณ์ชุดนี้</button></div><div id="truthOut"></div>' : '';
      if (hid.length) document.getElementById('showTruth').onclick = function () {
        this.remove();
        document.getElementById('truthOut').innerHTML = hid.map((r) => {
          const p = (Math.abs(r.value - r.accepted) / Math.abs(r.accepted)) * 100;
          return '<p>' + r.label + ' ค่าจริง = <b>' + Lab.fmt(r.accepted, r.digitsTrue) + ' ' + (r.unit || '') + '</b> <span class="pct ' + (p < 3 ? 'ok' : p < 8 ? 'warn' : 'bad') + '">(ต่าง ' + p.toFixed(1) + '%)</span></p>';
        }).join('');
      };
    }

    // ---------- คำถาม ----------
    function qa(el, key, label) {
      const id = 'q-' + key;
      el.insertAdjacentHTML('beforeend', '<label for="' + id + '">' + label + '</label><textarea id="' + id + '"></textarea><div class="print-only" data-for="' + id + '"></div>');
      const t = document.getElementById(id);
      t.value = state.answers[key] || '';
      t.oninput = () => { state.answers[key] = t.value; save(); };
    }
    function qaChoice(el, key, label, choices, why) {
      const name = 'q-' + key;
      el.insertAdjacentHTML('beforeend', '<div class="mc"><div class="mcq">' + label + '</div>' +
        choices.map((c, j) => '<label class="opt"><input type="radio" name="' + name + '" value="' + j + '"' + (state.answers[key] === j ? ' checked' : '') + '><span>' + c + '</span></label>').join('') +
        (why ? '<input class="why" id="' + name + '-w" placeholder="เพราะ…" autocomplete="off">' : '') + '</div>');
      el.querySelectorAll('input[name="' + name + '"]').forEach((r) => (r.onchange = () => { state.answers[key] = +r.value; save(); }));
      if (why) { const w = document.getElementById(name + '-w'); w.value = state.answers[key + 'w'] || ''; w.oninput = () => { state.answers[key + 'w'] = w.value; save(); }; }
    }
    const qs = document.getElementById('qs');
    cfg.questions.forEach((q, i) => (typeof q === 'string' ? qa(qs, 'q' + i, (i + 1) + '. ' + q) : qaChoice(qs, 'q' + i, (i + 1) + '. ' + q.q, q.choices, q.why)));
    const pq = document.getElementById('predQ'), pc = document.getElementById('predCheck');
    PRED.forEach((p, i) => {
      qaChoice(pq, 'p' + i, (i + 1) + '. ' + p.q, p.choices, false);
      pc.insertAdjacentHTML('beforeend', '<p style="margin:12px 0 0"><b>' + (i + 1) + '. ' + p.q + '</b><br>ฉันทายว่า: <span id="pv' + i + '" style="color:var(--accent)"></span></p>');
      qa(pc, 'pr' + i, 'ผลการทดลองจริงเป็นอย่างไร ตรงกับที่ทายไว้หรือไม่');
    });
    qa(document.getElementById('concl'), 'concl', cfg.conclusionPrompt || 'สรุปผลการทดลองตามจุดประสงค์ พร้อมค่าที่วัดได้และความคลาดเคลื่อน');

    // ---------- พิมพ์รายงาน ----------
    function preparePrint() {
      app.querySelectorAll('.print-only[data-for]').forEach((d) => {
        d.textContent = document.getElementById(d.dataset.for).value || '-';
        d.style.whiteSpace = 'pre-wrap';
        document.getElementById(d.dataset.for).style.display = 'none';
      });
      const s = state.student;
      document.getElementById('pStudent').innerHTML = '<p>ผู้ทำการทดลอง: ' + (s.name || '..............................') + ' &nbsp; ชั้น ' + (s.cls || '.....') + ' &nbsp; เลขที่ ' + (s.no || '.....') +
        ' &nbsp; วันที่ ' + new Date().toLocaleDateString('th-TH') + '</p>';
      analyse();
      if (gcv) gcv.fit();
      drawGraph();
    }
    function afterPrint() { app.querySelectorAll('.qa textarea').forEach((t) => (t.style.display = '')); }
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', afterPrint);
    document.getElementById('print').onclick = () => { preparePrint(); setTimeout(() => window.print(), 50); };
    document.getElementById('resetAll').onclick = () => {
      if (!confirm('ลบข้อมูล ตาราง และคำตอบของการทดลองนี้ทั้งหมด?')) return;
      store.del(KEY); location.reload();
    };

    // ---------- API ที่ส่งให้ส่วนอุปกรณ์ของแต่ละการทดลอง ----------
    const api = {
      rng: Lab.rng(cfg.id),
      truth: null,
      // ใส่ค่าลงช่องว่างแรกของคอลัมน์ key (ใช้กับค่าที่อ่านจากจอดิจิทัล เช่น นาฬิกาจับเวลา)
      // key เป็น array ได้ เช่น ['t1','t2'] จะเติม t1 แล้ว t2 ของแถวเดียวกันก่อนขึ้นแถวใหม่
      fillNext(keys, val) {
        keys = [].concat(keys);
        const empty = (r, k) => r[k] == null || String(r[k]).trim() === '';
        let i = -1, key = null;
        for (let r = 0; r < state.rows.length && i < 0; r++) {
          for (const k of keys) if (empty(state.rows[r], k)) { i = r; key = k; break; }
        }
        if (i < 0) return false;
        state.rows[i][key] = val; save(); renderTable();
        const el = tbl.querySelector('input[data-r="' + i + '"][data-k="' + key + '"]');
        if (el) { el.classList.add('flash'); }
        return true;
      },
      rows: () => state.rows,
      // ให้ส่วนอุปกรณ์สลับชุดข้อมูลตามอุปกรณ์ที่เลือก และรับแจ้งเมื่อผู้ใช้สลับชุดจากตาราง (api.onSetChange)
      useSet: (k) => useSet(k, true),
      currentSet: () => state.cur,
    };
    // ถ้าส่วนอุปกรณ์พัง ให้ตารางและขั้นอื่นยังใช้ได้ และแสดงข้อความแทนภาพ
    try { cfg.apparatus(document.getElementById('stage'), document.getElementById('ctrls'), api); }
    catch (err) {
      console.error(err);
      document.getElementById('stage').insertAdjacentHTML('beforeend', '<div class="note warn">อุปกรณ์จำลองโหลดไม่สำเร็จ ลองโหลดหน้าใหม่ (' + String(err.message || err).replace(/</g, '&lt;') + ')</div>');
    }
    renderTable();
    go(state.step);
    if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.step === 3) drawGraph(); });
    return api;
  };
})();
