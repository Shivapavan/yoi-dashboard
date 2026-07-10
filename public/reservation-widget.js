(function () {
  'use strict';

  var scriptEl = document.currentScript ||
    Array.from(document.querySelectorAll('script')).find(function (s) {
      return s.src && s.src.includes('reservation-widget');
    });
  var API_BASE = scriptEl
    ? new URL(scriptEl.src).origin
    : 'https://yoi-dashboard.vercel.app';

  var TEAL = '#0D9488';
  var TEAL_DARK = '#0F766E';

  var style = document.createElement('style');
  style.textContent = [
    '#yoi-fab{position:fixed;bottom:24px;right:24px;z-index:9998;',
    'background:' + TEAL + ';color:#fff;border:none;border-radius:28px;',
    'padding:14px 20px;font-size:15px;font-weight:600;cursor:pointer;',
    'box-shadow:0 4px 16px rgba(13,148,136,0.4);',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
    'display:flex;align-items:center;gap:8px;transition:transform .2s,box-shadow .2s;}',
    '#yoi-fab:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(13,148,136,0.5);}',

    '#yoi-panel{position:fixed;bottom:90px;right:24px;z-index:9999;',
    'width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 110px);',
    'background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.18);',
    'display:none;flex-direction:column;overflow:hidden;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    '#yoi-panel.open{display:flex;}',

    '#yoi-hdr{background:' + TEAL + ';color:#fff;',
    'padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
    '#yoi-hdr-title{font-weight:700;font-size:15px;}',
    '#yoi-hdr-sub{font-size:11px;opacity:.85;margin-top:1px;}',
    '#yoi-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;opacity:.8;}',
    '#yoi-close:hover{opacity:1;}',

    '#yoi-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;}',

    '.yoi-m{max-width:82%;padding:10px 13px;border-radius:12px;font-size:13.5px;line-height:1.5;word-break:break-word;}',
    '.yoi-bot{background:#F3F4F6;color:#111827;align-self:flex-start;border-bottom-left-radius:3px;}',
    '.yoi-user{background:' + TEAL + ';color:#fff;align-self:flex-end;border-bottom-right-radius:3px;}',
    '.yoi-ok{background:#D1FAE5;color:#065F46;align-self:flex-start;border-radius:10px;}',
    '.yoi-err{background:#FEE2E2;color:#991B1B;align-self:flex-start;border-radius:10px;}',

    '.yoi-dots{display:flex;gap:4px;padding:10px 13px;background:#F3F4F6;border-radius:12px;border-bottom-left-radius:3px;align-self:flex-start;}',
    '.yoi-dot{width:7px;height:7px;border-radius:50%;background:#6B7280;animation:yoi-b 1.2s infinite;}',
    '.yoi-dot:nth-child(2){animation-delay:.2s}.yoi-dot:nth-child(3){animation-delay:.4s}',
    '@keyframes yoi-b{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}',

    '#yoi-row{display:flex;gap:8px;padding:12px;border-top:1px solid #E5E7EB;flex-shrink:0;}',
    '#yoi-input{flex:1;border:1px solid #E5E7EB;border-radius:8px;padding:9px 12px;font-size:14px;',
    'font-family:inherit;outline:none;resize:none;color:#111827;background:#fff;}',
    '#yoi-input:focus{border-color:' + TEAL + ';}',
    '#yoi-send{background:' + TEAL + ';color:#fff;border:none;border-radius:8px;padding:9px 14px;',
    'font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .2s;}',
    '#yoi-send:hover{background:' + TEAL_DARK + ';}',
    '#yoi-send:disabled{opacity:.5;cursor:not-allowed;}',
    '#yoi-foot{text-align:center;font-size:10px;color:#6B7280;padding:4px 0 8px;flex-shrink:0;}',
  ].join('');
  document.head.appendChild(style);

  var fab = document.createElement('button');
  fab.id = 'yoi-fab';
  fab.innerHTML = '&#127374; Reserve a Table';
  fab.setAttribute('aria-label', 'Reserve a table at Yum of India');

  var panel = document.createElement('div');
  panel.id = 'yoi-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Table reservation chat');
  panel.innerHTML = [
    '<div id="yoi-hdr">',
    '  <div><div id="yoi-hdr-title">&#127826; Yum of India</div>',
    '  <div id="yoi-hdr-sub">Reserve a Table · McKinney, TX</div></div>',
    '  <button id="yoi-close" aria-label="Close">&#10005;</button>',
    '</div>',
    '<div id="yoi-msgs" role="log" aria-live="polite"></div>',
    '<div id="yoi-row">',
    '  <textarea id="yoi-input" rows="1" placeholder="Type your message…" aria-label="Message"></textarea>',
    '  <button id="yoi-send">Send</button>',
    '</div>',
    '<div id="yoi-foot">Yum of India · (972) 547-9300</div>',
  ].join('');

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var messages = [];
  var busy = false;
  var booked = false;

  var msgList = document.getElementById('yoi-msgs');
  var input   = document.getElementById('yoi-input');
  var sendBtn = document.getElementById('yoi-send');
  var closeBtn = document.getElementById('yoi-close');

  function addMsg(text, cls) {
    var el = document.createElement('div');
    el.className = 'yoi-m ' + cls;
    el.textContent = text;
    msgList.appendChild(el);
    msgList.scrollTop = msgList.scrollHeight;
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'yoi-dots'; el.id = 'yoi-typing';
    el.innerHTML = '<div class="yoi-dot"></div><div class="yoi-dot"></div><div class="yoi-dot"></div>';
    msgList.appendChild(el);
    msgList.scrollTop = msgList.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('yoi-typing');
    if (el) el.remove();
  }

  function setDisabled(v) { input.disabled = v; sendBtn.disabled = v; }

  function parseConfirm(text) {
    var m = text.match(/\{[\s\S]*"action"\s*:\s*"confirm"[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch (e) { return null; }
  }

  function getToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  }

  function bookReservation(data) {
    return fetch(API_BASE + '/api/public/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name, date: data.date, time: data.time,
        party_size: data.party_size, phone: data.phone, notes: data.notes || null,
      }),
    }).then(function (r) { return r.json(); });
  }

  function chat(msgs) {
    return fetch(API_BASE + '/api/public/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs, today: getToday() }),
    }).then(function (r) { return r.json(); });
  }

  function handleReply(reply) {
    var confirm = parseConfirm(reply);
    if (confirm) {
      var dt = new Date(confirm.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });
      var lines = [
        '✅ Reservation confirmed!', '',
        '📅 ' + dt,
        '🕐 ' + confirm.time,
        '👥 Party of ' + confirm.party_size,
        '👤 ' + confirm.name,
        '📞 ' + confirm.phone,
      ];
      if (confirm.notes) lines.push('📝 ' + confirm.notes);
      lines.push('', "We'll call to confirm. See you soon! 🎉");
      addMsg(lines.join('\n'), 'yoi-ok');
      messages.push({ role: 'assistant', content: reply });

      bookReservation(confirm).catch(function () {
        addMsg('Trouble saving online — please call us at (972) 547-9300 to confirm.', 'yoi-err');
      }).then(function (res) {
        if (res && !res.success) {
          addMsg('Trouble saving online — please call us at (972) 547-9300 to confirm.', 'yoi-err');
        }
      });

      booked = true;
      setDisabled(true);
      input.placeholder = 'Reservation complete!';
    } else {
      addMsg(reply, 'yoi-bot');
      messages.push({ role: 'assistant', content: reply });
      busy = false;
      setDisabled(false);
      input.focus();
    }
  }

  function send() {
    if (busy || booked) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = ''; input.rows = 1;
    addMsg(text, 'yoi-user');
    messages.push({ role: 'user', content: text });
    busy = true; setDisabled(true); showTyping();

    chat(messages).then(function (data) {
      hideTyping();
      if (data.error) {
        addMsg('Something went wrong. Please call us at (972) 547-9300.', 'yoi-err');
        busy = false; setDisabled(false);
        return;
      }
      handleReply(data.reply || '');
    }).catch(function () {
      hideTyping();
      addMsg('Connection error. Please call us at (972) 547-9300.', 'yoi-err');
      busy = false; setDisabled(false);
    });
  }

  function openChat() {
    panel.classList.add('open');
    fab.style.display = 'none';
    if (messages.length > 0) { input.focus(); return; }

    busy = true; setDisabled(true); showTyping();
    chat([{ role: 'user', content: 'Hello' }]).then(function (data) {
      hideTyping();
      var reply = (data && data.reply) || "Hi! I’m here to help you reserve a table at Yum of India. What’s your name, preferred date, time, and party size?";
      addMsg(reply, 'yoi-bot');
      messages.push({ role: 'user', content: 'Hello' });
      messages.push({ role: 'assistant', content: reply });
      busy = false; setDisabled(false); input.focus();
    }).catch(function () {
      hideTyping();
      addMsg("Hi! I’m here to help you reserve a table. What’s your name, preferred date, time, and party size?", 'yoi-bot');
      busy = false; setDisabled(false);
    });
  }

  function closeChat() {
    panel.classList.remove('open');
    fab.style.display = 'flex';
  }

  fab.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);
  sendBtn.addEventListener('click', send);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('input', function () {
    this.rows = Math.min(4, (this.value.match(/\n/g) || []).length + 1);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) closeChat();
  });
})();
