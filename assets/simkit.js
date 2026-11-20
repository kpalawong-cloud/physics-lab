/* ห้องเรียนจำลอง: โครงหน้า simulation สำหรับครูสอนหน้าชั้น (ใช้ร่วมกับ lab.js เพื่อใช้ Lab.canvas, Lab.loop, Lab.lens, Lab.css, Lab.dark, Lab.rng)
   SimKit.page({
     id, title, level, subject, lead,          // หัวเรื่องและคำอธิบายสั้น
     about: html,                               // ความรู้ประกอบ (การ์ดล่างซ้าย)
     think: [html],                             // คำถามชวนคิด (การ์ดล่างขวา)
     build(stage, panel, api)                   // สร้างภาพจำลองใน stage และปุ่มควบคุมใน panel
   })
   api: { note(html) แสดงคำอธิบายสิ่งที่เกิดขึ้นใต้ปุ่มควบคุม, rng, present() โหมดนำเสนอหรือไม่, onPresent(fn) } */
(function () {
  'use strict';
  const SimKit = (window.SimKit = {});
  SimKit.page = function (cfg) {
    document.body.classList.add('kid', 'simpage');
    const app = document.getElementById('app');
    app.innerHTML =
      '<div class="wrap">' +
      '<div class="crumbs"><a href="../../">หน้าแรก</a><span>›</span><a href="../../classroom.html">ห้องเรียนจำลอง</a><span>›</span>' + cfg.title + '</div>' +
      '<div class="exp-head"><h1>' + cfg.title + '</h1><span class="chip">' + cfg.level + '</span>' +
      (cfg.subject ? '<span class="chip" style="background:var(--soft);color:var(--muted)">' + cfg.subject + '</span>' : '') +
      '<button class="btn presbtn" id="presBtn" title="ขยายภาพเต็มจอสำหรับฉายหน้าชั้นเรียน">⛶ โหมดนำเสนอ</button></div>' +
      (cfg.lead ? '<p class="lead">' + cfg.lead + '</p>' : '') +
      '<div class="bench"><div class="card stage" id="stage"></div><div class="card ctrls" id="panel"></div></div>' +
      '<div class="two simfoot">' +
      '<div class="card"><h2>ความรู้</h2>' + (cfg.about || '') + '</div>' +
      '<div class="card"><h2>คำถามชวนคิด</h2>' + (cfg.think && cfg.think.length ? '<ol>' + cfg.think.map((q) => '<li>' + q + '</li>').join('') + '</ol>' : '') + '</div>' +
      '</div></div>';
    document.title = cfg.title + ' · ห้องเรียนจำลอง';
    const stage = document.getElementById('stage'), panel = document.getElementById('panel');
    const noteEl = document.createElement('div');
    noteEl.className = 'note simnote';
    noteEl.style.display = 'none';
    const presFns = [];
    const api = {
      rng: window.Lab ? Lab.rng('sim-' + cfg.id) : Math.random,
      note(html) { noteEl.innerHTML = html || ''; noteEl.style.display = html ? '' : 'none'; if (!noteEl.parentNode) panel.appendChild(noteEl); },
      present: () => document.body.classList.contains('present'),
      onPresent(fn) { presFns.push(fn); },
    };
    // โหมดนำเสนอ: ซ่อนส่วนอธิบาย ขยายภาพ และขอเต็มจอถ้าเบราว์เซอร์รองรับ
    const pb = document.getElementById('presBtn');
    function setPresent(on) {
      document.body.classList.toggle('present', on);
      pb.textContent = on ? '✕ ออกจากโหมดนำเสนอ' : '⛶ โหมดนำเสนอ';
      presFns.forEach((f) => { try { f(on); } catch (e) {} });
      window.dispatchEvent(new Event('resize'));
    }
    pb.onclick = () => {
      const on = !api.present();
      setPresent(on);
      try {
        if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
        else if (!on && document.fullscreenElement) document.exitFullscreen();
      } catch (e) {}
    };
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && api.present()) setPresent(false); });
    try { cfg.build(stage, panel, api); }
    catch (err) {
      console.error(err);
      stage.insertAdjacentHTML('beforeend', '<div class="note warn">ภาพจำลองโหลดไม่สำเร็จ ลองโหลดหน้าใหม่ (' + String(err.message || err).replace(/</g, '&lt;') + ')</div>');
    }
    if (noteEl.innerHTML && !noteEl.parentNode) panel.appendChild(noteEl);
    return api;
  };
})();
