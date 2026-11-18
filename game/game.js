'use strict';
/*
 * NASI GORENG RUSH — game browser orisinal untuk make.fun best-game-01.
 * Satu file, tanpa aset eksternal, tanpa network request, tanpa build step.
 * Semua gambar digambar dengan canvas, semua suara dibuat dengan WebAudio.
 *
 * Cara main: pesanan datang di tiket atas. Ambil 3 bahan yang diminta
 * (NASI / TELUR / AYAM / SAYUR), masukkan ke WOK, sajikan di PIRING
 * sebelum pesanan kabur atau masakan gosong. Sajikan 10 pesanan = MENANG.
 * 3 strike (pesanan kabur / gosong) = KALAH.
 * Gerak: panah kiri/kanan atau A/D, klik stasiun untuk jalan ke sana.
 * Interaksi: Spasi, atau klik stasiun saat koki sudah di dekatnya.
 * Mulai / ulang: Enter, R, atau klik tombol di layar.
 */
(function () {
  var W = 960, H = 600;
  var WIN_SERVES = 10, MAX_STRIKES = 3;
  var BURN_TIME = 12;

  var ING = {
    nasi:  { label: 'NASI',  color: '#f7f3e3', dark: '#8a7d4f' },
    telur: { label: 'TELUR', color: '#ffd94d', dark: '#8a6d00' },
    ayam:  { label: 'AYAM',  color: '#e07840', dark: '#7a3410' },
    sayur: { label: 'SAYUR', color: '#7bc96f', dark: '#2c5e22' }
  };
  var ING_IDS = ['nasi', 'telur', 'ayam', 'sayur'];

  // Stasiun dapur, kiri ke kanan. WOK dan PIRING bukan bahan.
  var STATIONS = [
    { id: 'nasi',   x: 110, label: 'NASI' },
    { id: 'telur',  x: 250, label: 'TELUR' },
    { id: 'ayam',   x: 390, label: 'AYAM' },
    { id: 'sayur',  x: 530, label: 'SAYUR' },
    { id: 'wok',    x: 690, label: 'WOK' },
    { id: 'piring', x: 840, label: 'PIRING' }
  ];
  var STATION_Y = 480;
  var COOK_Y = 420;

  var S; // state, dibuat ulang oleh reset()

  function level() { return 1 + Math.floor(S.served / 3); }
  function patienceMax() { return Math.max(16, 25 - (level() - 1) * 3); }
  function spawnInterval() { return Math.max(5, 9 - (level() - 1) * 1.5); }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function newOrder() {
    var needs = shuffle(ING_IDS).slice(0, 3);
    var p = patienceMax();
    return { needs: needs, patience: p, max: p };
  }

  function reset() {
    S = {
      state: 'menu', // menu | playing | win | over
      score: 0, served: 0, strikes: 0, combo: 0,
      orders: [],
      spawnT: 9,
      wok: [], burnT: 0,
      carried: null,
      cookX: 480, targetX: 480, pendingInteract: false,
      hint: '', hintT: 0,
      time: 0
    };
    // Dipanggil setelah S terisi: newOrder/spawnInterval membaca level() dari S.
    S.orders = [newOrder()];
    S.spawnT = spawnInterval();
  }

  function setHint(msg) { S.hint = msg; S.hintT = 2.5; }

  // --- suara: nada WebAudio, dibuat saat ada gestur pengguna ---
  var audioCtx = null;
  function tone(freq, dur, type, vol) {
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.value = vol || 0.12;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    } catch (e) { /* suara opsional; game tetap jalan tanpa audio */ }
  }
  function sfx(name) {
    if (name === 'pick') tone(520, 0.08, 'triangle');
    else if (name === 'toss') tone(340, 0.1, 'square', 0.08);
    else if (name === 'serve') { tone(660, 0.12, 'sine'); setTimeout(function () { tone(880, 0.18, 'sine'); }, 110); }
    else if (name === 'bad') tone(160, 0.25, 'sawtooth', 0.1);
    else if (name === 'strike') { tone(220, 0.2, 'sawtooth', 0.12); setTimeout(function () { tone(180, 0.3, 'sawtooth', 0.12); }, 160); }
    else if (name === 'win') { tone(523, 0.15, 'sine'); setTimeout(function () { tone(659, 0.15, 'sine'); }, 140); setTimeout(function () { tone(784, 0.3, 'sine'); }, 280); }
  }

  function startGame() {
    reset();
    S.state = 'playing';
    setHint('Pesanan pertama: masak 3 bahan di tiket!');
  }

  function addStrike(reason) {
    S.strikes++;
    S.combo = 0;
    S.wok = [];
    S.burnT = 0;
    S.carried = null;
    sfx('strike');
    setHint('STRIKE: ' + reason + ' (' + S.strikes + '/' + MAX_STRIKES + ')');
    if (S.strikes >= MAX_STRIKES) S.state = 'over';
  }

  function serveOrder() {
    var order = S.orders[0];
    var got = S.wok.slice().sort().join(',');
    var need = order.needs.slice().sort().join(',');
    if (got !== need) return false;
    var pts = 100 + S.combo * 25;
    S.score += pts;
    S.served++;
    S.combo++;
    S.orders.shift();
    S.wok = [];
    S.burnT = 0;
    sfx('serve');
    setHint('Tersaji! +' + pts + ' poin' + (S.combo > 1 ? ' (kombo x' + S.combo + ')' : ''));
    if (S.served >= WIN_SERVES) { S.state = 'win'; sfx('win'); }
    return true;
  }

  function nearestStation() {
    var best = null, bestD = 1e9;
    for (var i = 0; i < STATIONS.length; i++) {
      var d = Math.abs(STATIONS[i].x - S.cookX);
      if (d < bestD) { bestD = d; best = STATIONS[i]; }
    }
    return bestD <= 75 ? best : null;
  }

  function interact() {
    if (S.state !== 'playing') return;
    var st = nearestStation();
    if (!st) { setHint('Jalan dulu ke stasiun (panah / klik).'); return; }
    if (ING[st.id]) {
      if (S.carried) { setHint('Tangan penuh! Bawa ' + ING[S.carried].label + ' ke WOK dulu.'); return; }
      S.carried = st.id;
      sfx('pick');
      setHint('Membawa ' + ING[st.id].label + ' — bawa ke WOK.');
    } else if (st.id === 'wok') {
      if (!S.carried) { setHint('WOK kosong — ambil bahan dulu.'); return; }
      var order = S.orders[0];
      if (order.needs.indexOf(S.carried) === -1 || S.wok.indexOf(S.carried) !== -1) {
        sfx('bad');
        setHint(ING[S.carried].label + ' tidak dibutuhkan — bahan terbuang!');
        S.carried = null;
        return;
      }
      S.wok.push(S.carried);
      if (S.wok.length === 1) S.burnT = BURN_TIME;
      S.carried = null;
      sfx('toss');
      setHint(S.wok.length === 3 ? 'Wok lengkap! Sajikan di PIRING.' : 'Masuk wok (' + S.wok.length + '/3).');
    } else if (st.id === 'piring') {
      if (!S.orders.length) return;
      if (!serveOrder()) {
        sfx('bad');
        setHint('Wok belum lengkap — cek tiket pesanan!');
      }
    }
  }

  function update(dt) {
    if (S.state !== 'playing') return;
    S.time += dt;
    if (S.hintT > 0) S.hintT -= dt;

    // koki jalan menuju target
    var dx = S.targetX - S.cookX;
    var step = 340 * dt;
    if (Math.abs(dx) <= step) {
      S.cookX = S.targetX;
      if (S.pendingInteract) { S.pendingInteract = false; interact(); }
    } else {
      S.cookX += (dx > 0 ? step : -step);
    }

    // pesanan baru
    S.spawnT -= dt;
    if (S.spawnT <= 0 && S.orders.length < 3) {
      S.orders.push(newOrder());
      S.spawnT = spawnInterval();
    }
    // kesabaran pesanan pertama
    if (S.orders.length) {
      var o = S.orders[0];
      o.patience -= dt;
      if (o.patience <= 0) {
        S.orders.shift();
        addStrike('Pesanan kabur, pelanggan pergi!');
        return;
      }
    }
    // masakan gosong
    if (S.wok.length > 0) {
      S.burnT -= dt;
      if (S.burnT <= 0) addStrike('Masakan di wok gosong!');
    }
  }

  // --- gambar ---
  var canvas, ctx;
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function chip(x, y, r, id) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = ING[id].color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ING[id].dark;
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ING[id].label.slice(0, 2), x, y);
  }
  function button(b, label) {
    rr(b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = '#c0392b';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f7ead7';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
  function buttonHit(b, mx, my) {
    return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
  }

  var START_BTN = { x: 380, y: 440, w: 200, h: 56 };
  var AGAIN_BTN = { x: 380, y: 450, w: 200, h: 56 };

  function draw() {
    // latar warung
    ctx.fillStyle = '#2b1a12';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(0, 0, W, 130);
    ctx.fillStyle = '#241610';
    ctx.fillRect(0, 540, W, 60);
    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('WARUNG BANTOL', 24, 34);
    ctx.fillStyle = '#f7ead7';
    ctx.font = '15px sans-serif';
    ctx.fillText('Nasi Goreng Rush', 24, 58);

    // HUD kanan atas
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('SKOR ' + S.score, W - 24, 32);
    ctx.fillStyle = '#f7ead7';
    ctx.font = '15px sans-serif';
    ctx.fillText('Pesanan ' + S.served + '/' + WIN_SERVES + '   Level ' + level() +
      '   Kombo x' + Math.max(S.combo, 1), W - 24, 58);
    for (var s = 0; s < MAX_STRIKES; s++) {
      ctx.beginPath();
      ctx.arc(W - 34 - s * 30, 82, 9, 0, Math.PI * 2);
      ctx.fillStyle = s < S.strikes ? '#c0392b' : 'rgba(247,234,215,0.25)';
      ctx.fill();
    }
    ctx.fillStyle = '#f7ead7';
    ctx.font = '13px sans-serif';
    ctx.fillText('STRIKE', W - 140, 87);

    // tiket pesanan
    for (var i = 0; i < S.orders.length; i++) {
      var o = S.orders[i];
      var tx = 24 + i * 225, ty = 78;
      rr(tx, ty, 205, 84, 8);
      ctx.fillStyle = i === 0 ? '#fff6d8' : 'rgba(255,246,216,0.75)';
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(i === 0 ? 'PESANAN AKTIF' : 'ANTRI', tx + 12, ty + 20);
      for (var k = 0; k < o.needs.length; k++) chip(tx + 30 + k * 62, ty + 46, 20, o.needs[k]);
      // bar kesabaran
      ctx.fillStyle = '#ddd';
      ctx.fillRect(tx + 12, ty + 70, 181, 6);
      ctx.fillStyle = o.patience / o.max > 0.4 ? '#7bc96f' : '#c0392b';
      ctx.fillRect(tx + 12, ty + 70, 181 * Math.max(0, o.patience / o.max), 6);
    }

    // stasiun dapur
    for (var j = 0; j < STATIONS.length; j++) {
      var st = STATIONS[j];
      var isWok = st.id === 'wok', isPlate = st.id === 'piring';
      ctx.fillStyle = isWok ? '#1c1c1c' : isPlate ? '#f7f3e3' : '#4a2f1d';
      ctx.beginPath();
      if (isWok) { ctx.arc(st.x, STATION_Y, 46, 0, Math.PI * 2); ctx.fill(); }
      else if (isPlate) { ctx.ellipse(st.x, STATION_Y, 48, 22, 0, 0, Math.PI * 2); ctx.fill(); }
      else { rr(st.x - 48, STATION_Y - 34, 96, 68, 10); ctx.fill(); }
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f7ead7';
      ctx.stroke();
      ctx.fillStyle = isPlate ? '#222' : '#f7ead7';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.label, st.x, STATION_Y + (isWok ? 62 : isPlate ? 44 : 52));
      if (ING[st.id]) chip(st.x, STATION_Y - 2, 20, st.id);
      // isi wok
      if (isWok) {
        for (var m = 0; m < S.wok.length; m++) chip(st.x - 24 + m * 24, STATION_Y - 4, 12, S.wok[m]);
        if (S.wok.length > 0) {
          ctx.fillStyle = '#555';
          ctx.fillRect(st.x - 40, STATION_Y + 46, 80, 5);
          ctx.fillStyle = S.burnT / BURN_TIME > 0.35 ? '#ff9d00' : '#c0392b';
          ctx.fillRect(st.x - 40, STATION_Y + 46, 80 * Math.max(0, S.burnT / BURN_TIME), 5);
        }
      }
    }

    // koki
    var cx = S.cookX;
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(cx, COOK_Y - 52, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    rr(cx - 22, COOK_Y - 78, 44, 16, 8); ctx.fill();
    ctx.fillStyle = '#f7ead7';
    rr(cx - 24, COOK_Y - 34, 48, 62, 10); ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(cx - 24, COOK_Y - 34, 48, 10);
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(cx - 7, COOK_Y - 54, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 7, COOK_Y - 54, 2.5, 0, Math.PI * 2); ctx.fill();
    if (S.carried) {
      chip(cx, COOK_Y - 96, 16, S.carried);
      ctx.fillStyle = '#f7ead7';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MEMBAWA', cx, COOK_Y - 112);
    }
    // penanda stasiun terdekat
    var near = nearestStation();
    if (near && S.state === 'playing') {
      ctx.strokeStyle = '#ffd94d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(near.x, STATION_Y, 58, 0, Math.PI * 2);
      ctx.stroke();
    }

    // petunjuk bawah
    ctx.fillStyle = '#f7ead7';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    var hint = S.hintT > 0 ? S.hint : 'Panah / A D: jalan   •   Spasi: ambil / masak / sajikan   •   Klik stasiun: jalan ke sana';
    ctx.fillText(hint, W / 2, 575);

    // layar menu / menang / kalah
    if (S.state === 'menu') {
      ctx.fillStyle = 'rgba(20,10,6,0.82)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NASI GORENG RUSH', W / 2, 180);
      ctx.fillStyle = '#f7ead7';
      ctx.font = '20px sans-serif';
      ctx.fillText('Warung lagi ramai! Masak pesanan sebelum pelanggan kabur.', W / 2, 225);
      ctx.font = '17px sans-serif';
      ctx.fillText('Ambil 3 bahan dari tiket -> masukkan ke WOK -> sajikan di PIRING.', W / 2, 265);
      ctx.fillText('Sajikan 10 pesanan untuk menang. 3 strike (kabur / gosong) = kalah.', W / 2, 292);
      ctx.fillText('Gerak: panah kiri/kanan atau A/D + klik mouse. Aksi: Spasi.', W / 2, 330);
      ctx.fillText('Wok gosong dalam 12 detik — jangan kelamaan!', W / 2, 357);
      button(START_BTN, 'MULAI MASAK');
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(247,234,215,0.8)';
      ctx.fillText('atau tekan Enter', W / 2, 525);
    } else if (S.state === 'win' || S.state === 'over') {
      ctx.fillStyle = 'rgba(20,10,6,0.85)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = S.state === 'win' ? '#7bc96f' : '#c0392b';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(S.state === 'win' ? 'RUSH SELESAI!' : 'WARUNG TUTUP!', W / 2, 190);
      ctx.fillStyle = '#f7ead7';
      ctx.font = '22px sans-serif';
      ctx.fillText(S.state === 'win'
        ? '10 pesanan tersaji. Warung Bantol juara malam ini!'
        : '3 strike — pelanggan kecewa dan pulang.', W / 2, 240);
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = '#ffd94d';
      ctx.fillText('SKOR AKHIR: ' + S.score + '   •   Pesanan: ' + S.served + '/' + WIN_SERVES, W / 2, 300);
      button(AGAIN_BTN, 'MAIN LAGI');
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(247,234,215,0.8)';
      ctx.fillText('atau tekan R', W / 2, 530);
    }
  }

  // --- input ---
  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height)
    };
  }
  function onClick(e) {
    var p = canvasPos(e);
    if (S.state === 'menu') {
      if (buttonHit(START_BTN, p.x, p.y)) { sfx('pick'); startGame(); }
      return;
    }
    if (S.state === 'win' || S.state === 'over') {
      if (buttonHit(AGAIN_BTN, p.x, p.y)) { sfx('pick'); startGame(); }
      return;
    }
    // klik stasiun: jalan ke sana, lalu interaksi otomatis saat sampai
    var best = null, bestD = 1e9;
    for (var i = 0; i < STATIONS.length; i++) {
      var d = Math.abs(STATIONS[i].x - p.x);
      if (d < bestD) { bestD = d; best = STATIONS[i]; }
    }
    if (best && p.y > 330) {
      S.targetX = best.x;
      S.pendingInteract = true;
    }
  }
  function onKey(e) {
    var k = e.key;
    if (S.state === 'menu' && (k === 'Enter' || k === ' ')) { e.preventDefault(); startGame(); return; }
    if ((S.state === 'win' || S.state === 'over') && (k === 'Enter' || k === 'r' || k === 'R')) { startGame(); return; }
    if (S.state !== 'playing') return;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      e.preventDefault();
      S.targetX = Math.max(60, S.targetX - 150);
      S.pendingInteract = false;
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      e.preventDefault();
      S.targetX = Math.min(900, S.targetX + 150);
      S.pendingInteract = false;
    } else if (k === ' ') {
      e.preventDefault();
      interact();
    }
  }

  // --- boot & loop ---
  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    reset();
    canvas.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    var last = 0;
    function frame(ts) {
      var dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      update(dt);
      draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else if (typeof document !== 'undefined') {
    init();
  }

  // Diekspos untuk playtest / debug dari konsol browser.
  if (typeof window !== 'undefined') {
    window.NGR = {
      get state() { return S; },
      start: startGame, update: update, interact: interact,
      stations: STATIONS, reset: reset
    };
  }
})();
