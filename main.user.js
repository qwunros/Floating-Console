// ==UserScript==
// @name         浮动控制台 (Floating Console)
// @namespace    https://github.com/floating-console
// @version      1.0.0
// @description  在不打开开发者工具的情况下运行JavaScript
// @author       Deepseek, qwunros
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  if (window.__FLOATING_CONSOLE_LOADED__) return;
  window.__FLOATING_CONSOLE_LOADED__ = true;

  /* =========================================================
   *  样式（全部隔离在 Shadow DOM 内，不会污染页面）
   * ========================================================= */
  const CSS_TEXT = `
  :host {
    all: initial;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 0 !important;
    height: 0 !important;
    z-index: 2147483647 !important;
    display: block !important;
  }
  * { box-sizing: border-box; }

  /* ---------- 右边缘按钮 ---------- */
  .fc-toggle {
    position: fixed;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    width: 22px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(30, 30, 36, 0.92);
    color: #7ee787;
    border-radius: 8px 0 0 8px;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    user-select: none;
    font: 13px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: 1px;
    transition: width 0.15s ease, background 0.15s ease;
  }
  .fc-toggle:hover { width: 28px; background: rgba(48, 48, 58, 0.96); }
  .fc-toggle.fc-hidden { display: none; }

  /* ---------- 面板 ---------- */
  .fc-panel {
    position: fixed;
    display: none;
    flex-direction: column;
    width: 520px;
    height: 360px;
    min-width: 280px;
    min-height: 180px;
    background: rgba(22, 22, 26, 0.97);
    color: #e8e8e8;
    border: 1px solid rgba(130, 130, 150, 0.45);
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace;
  }
  .fc-panel.fc-open { display: flex; }

  .fc-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px 6px 10px;
    background: linear-gradient(#34343d, #2a2a32);
    border-bottom: 1px solid rgba(130, 130, 150, 0.3);
    cursor: move;
    user-select: none;
  }
  .fc-title {
    flex: 1 1 auto;
    font-weight: 600;
    color: #c9c9d2;
    letter-spacing: 0.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fc-btn {
    flex: 0 0 auto;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #c9c9d2;
    border-radius: 5px;
    padding: 1px 7px;
    font: inherit;
    line-height: 1.5;
    cursor: pointer;
  }
  .fc-btn:hover { background: rgba(255, 255, 255, 0.16); color: #fff; }

  /* ---------- 输出区 ---------- */
  .fc-output {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 6px 8px;
    overscroll-behavior: contain;
  }
  .fc-output::-webkit-scrollbar { width: 8px; height: 8px; }
  .fc-output::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 4px;
  }
  .fc-output::-webkit-scrollbar-track { background: transparent; }

  .fc-line {
    display: flex;
    gap: 6px;
    padding: 2px 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .fc-tag { flex: 0 0 auto; opacity: 0.8; }
  .fc-text { flex: 1 1 auto; min-width: 0; }

  .fc-line.fc-input  { color: #8ab4f8; }
  .fc-line.fc-result { color: #f0f0f0; }
  .fc-line.fc-log    { color: #9aa0a6; }
  .fc-line.fc-info   { color: #79c0ff; }
  .fc-line.fc-warn   { color: #e3b341; }
  .fc-line.fc-error  { color: #ff7b72; }

  /* ---------- 输入区 ---------- */
  .fc-inputbar {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid rgba(130, 130, 150, 0.3);
    background: rgba(0, 0, 0, 0.25);
  }
  .fc-prompt { flex: 0 0 auto; color: #7ee787; }
  .fc-input {
    flex: 1 1 auto;
    min-width: 0;
    height: 19px;
    max-height: 120px;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: #f2f2f2;
    font: inherit;
    resize: none;
    overflow-y: auto;
    line-height: 1.55;
  }
  .fc-input::placeholder { color: #63636d; }

  /* ---------- 缩放手柄 ---------- */
  .fc-resizer {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 18px;
    height: 18px;
    cursor: nwse-resize;
    z-index: 3;
  }
  .fc-resizer::after {
    content: "";
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 7px;
    height: 7px;
    border-right: 2px solid rgba(255, 255, 255, 0.35);
    border-bottom: 2px solid rgba(255, 255, 255, 0.35);
  }
  `;

  /* =========================================================
   *  构建 DOM
   * ========================================================= */
  const host = document.createElement('div');
  host.id = 'floating-console-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = CSS_TEXT;
  shadow.appendChild(styleEl);

  const toggle = document.createElement('div');
  toggle.className = 'fc-toggle';
  toggle.title = '打开浮动控制台';
  toggle.textContent = '>_';

  const panel = document.createElement('div');
  panel.className = 'fc-panel';
  panel.innerHTML = `
    <div class="fc-header">
      <span class="fc-title">浮动控制台</span>
      <button class="fc-btn fc-clear" type="button" title="清空输出">清空</button>
      <button class="fc-btn fc-close" type="button" title="关闭">✕</button>
    </div>
    <div class="fc-output"></div>
    <div class="fc-inputbar">
      <span class="fc-prompt">›</span>
      <textarea class="fc-input" rows="1" spellcheck="false"
        placeholder="输入 JavaScript，Enter 执行，Shift+Enter 换行"></textarea>
    </div>
    <div class="fc-resizer" title="拖动调整大小"></div>
  `;

  shadow.append(toggle, panel);

  const outputEl = panel.querySelector('.fc-output');
  const inputEl = panel.querySelector('.fc-input');
  const headerEl = panel.querySelector('.fc-header');
  const resizerEl = panel.querySelector('.fc-resizer');
  const clearBtn = panel.querySelector('.fc-clear');
  const closeBtn = panel.querySelector('.fc-close');

  /* ---------- 挂载到页面 ---------- */
  (document.documentElement || document.body).appendChild(host);

  /* ---------- 阻止事件冒泡到页面（避免触发页面快捷键 / 点击） ---------- */
  const STOP_EVENTS = [
    'pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu',
    'keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchend',
  ];
  STOP_EVENTS.forEach((type) => {
    const stop = (e) => e.stopPropagation();
    panel.addEventListener(type, stop);
    toggle.addEventListener(type, stop);
  });

  /* =========================================================
   *  工具函数
   * ========================================================= */
  function formatValue(v) {
    try {
      if (v === undefined) return 'undefined';
      if (v === null) return 'null';

      const type = typeof v;
      if (type === 'string') return v;
      if (type === 'number' || type === 'boolean') return String(v);
      if (type === 'bigint') return String(v) + 'n';
      if (type === 'symbol') return v.toString();
      if (type === 'function') return v.toString();

      if (v instanceof Error) return v.stack || String(v);

      if (v.nodeType === 1) {
        const html = v.outerHTML || '';
        return html.length > 600 ? html.slice(0, 600) + ' …' : html;
      }
      if (v.nodeType === 9) return '#document';

      let json;
      try {
        const seen = new WeakSet();
        json = JSON.stringify(
          v,
          (key, val) => {
            if (typeof val === 'object' && val !== null) {
              if (seen.has(val)) return '[循环引用]';
              seen.add(val);
            }
            if (typeof val === 'function') return 'ƒ ' + (val.name || 'anonymous') + '()';
            if (typeof val === 'bigint') return String(val) + 'n';
            if (val === undefined) return '[undefined]';
            return val;
          },
          2
        );
      } catch (e) {
        return String(v);
      }
      if (json === undefined) return String(v);
      if (json.length > 20000) json = json.slice(0, 20000) + '\n… (输出已截断)';
      return json;
    } catch (e) {
      return '[无法显示的值]';
    }
  }

  const MAX_LINES = 600;

  function appendLine(kind, text, tagChar) {
    const atBottom =
      outputEl.scrollHeight - outputEl.scrollTop - outputEl.clientHeight < 40;

    const line = document.createElement('div');
    line.className = 'fc-line fc-' + kind;

    const tag = document.createElement('span');
    tag.className = 'fc-tag';
    tag.textContent = tagChar;

    const txt = document.createElement('span');
    txt.className = 'fc-text';
    txt.textContent = text;

    line.appendChild(tag);
    line.appendChild(txt);
    outputEl.appendChild(line);

    while (outputEl.childElementCount > MAX_LINES) {
      outputEl.removeChild(outputEl.firstElementChild);
    }

    if (atBottom) outputEl.scrollTop = outputEl.scrollHeight;
    return line;
  }

  /* =========================================================
   *  console 捕获（支持并发执行）
   * ========================================================= */
  const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'];
  const captureStack = [];
  const originalConsole = {};
  let consolePatched = false;

  function patchConsole() {
    if (consolePatched) return;
    consolePatched = true;
    CONSOLE_LEVELS.forEach((level) => {
      originalConsole[level] = console[level];
      console[level] = function (...args) {
        const bucket = captureStack[captureStack.length - 1];
        if (bucket) bucket.push({ level, args });
        return originalConsole[level].apply(console, args);
      };
    });
  }

  function unpatchConsole() {
    if (!consolePatched) return;
    consolePatched = false;
    CONSOLE_LEVELS.forEach((level) => {
      console[level] = originalConsole[level];
    });
  }

  /* =========================================================
   *  代码执行
   * ========================================================= */
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  async function executeCode(code) {
    let fn;
    try {
      // 先当作「表达式」执行，可以拿到返回值，且支持 await
      fn = new AsyncFunction('return (' + code + '\n);');
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      // 失败则当作「语句块」执行
      fn = new AsyncFunction(code);
    }
    return await fn.call(window);
  }

  async function runCode(code) {
    const bucket = [];
    captureStack.push(bucket);
    patchConsole();

    let value;
    let error = null;
    let threw = false;
    const startTime = performance.now();

    try {
      value = await executeCode(code);
    } catch (err) {
      threw = true;
      error = err;
    }

    const cost = performance.now() - startTime;

    const idx = captureStack.indexOf(bucket);
    if (idx !== -1) captureStack.splice(idx, 1);
    if (captureStack.length === 0) unpatchConsole();

    // 输出 console 捕获的内容
    bucket.forEach((item) => {
      const kind = item.level === 'debug' ? 'log' : item.level;
      const tag =
        { log: '·', info: 'ℹ', warn: '⚠', error: '✕', debug: '·' }[item.level] || '·';
      appendLine(kind, item.args.map(formatValue).join(' '), tag);
    });

    if (threw) {
      appendLine('error', formatValue(error), '✕');
    } else {
      appendLine('result', formatValue(value), '‹');
    }

    if (cost > 100) {
      appendLine('log', '耗时 ' + cost.toFixed(1) + ' ms', '⏱');
    }
  }

  /* =========================================================
   *  输入框逻辑
   * ========================================================= */
  const history = [];
  let historyIdx = -1;

  function autoResize() {
    if (!isOpen) return;
    inputEl.style.height = 'auto';
    const h = Math.min(inputEl.scrollHeight, 120);
    inputEl.style.height = h + 'px';
  }

  function navigateHistory(dir) {
    if (!history.length) return;

    if (dir < 0) {
      if (historyIdx === -1) historyIdx = history.length;
      historyIdx = Math.max(0, historyIdx - 1);
    } else {
      if (historyIdx === -1) return;
      historyIdx = Math.min(history.length, historyIdx + 1);
      if (historyIdx === history.length) {
        historyIdx = -1;
        inputEl.value = '';
        autoResize();
        return;
      }
    }

    inputEl.value = history[historyIdx] || '';
    autoResize();
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  }

  async function submit() {
    const code = inputEl.value;
    if (!code.trim()) return;

    appendLine('input', code, '❯');

    if (history[history.length - 1] !== code) history.push(code);
    if (history.length > 100) history.shift();
    historyIdx = -1;

    inputEl.value = '';
    autoResize();

    const loadingLine = appendLine('log', '执行中…', '⏳');
    try {
      await runCode(code);
    } catch (err) {
      appendLine('error', formatValue(err), '✕');
    } finally {
      loadingLine.remove();
      if (isOpen) inputEl.focus();
    }
  }

  inputEl.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return; // 输入法组合中

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }

    if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const caret = inputEl.selectionStart;
      if (inputEl.value.slice(0, caret).indexOf('\n') !== -1) return;
      e.preventDefault();
      navigateHistory(-1);
      return;
    }

    if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const caret = inputEl.selectionEnd;
      if (inputEl.value.slice(caret).indexOf('\n') !== -1) return;
      e.preventDefault();
      navigateHistory(1);
    }
  });

  inputEl.addEventListener('input', autoResize);

  /* =========================================================
   *  面板开关 / 位置
   * ========================================================= */
  let isOpen = false;
  let positioned = false;

  function clampIntoView() {
    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.width > vw - 8) panel.style.width = Math.max(280, vw - 16) + 'px';
    if (rect.height > vh - 8) panel.style.height = Math.max(180, vh - 16) + 'px';

    const r2 = panel.getBoundingClientRect();
    const maxLeft = Math.max(0, vw - r2.width);
    const maxTop = Math.max(0, vh - r2.height);

    const left = Math.min(Math.max(r2.left, 0), maxLeft);
    const top = Math.min(Math.max(r2.top, 0), maxTop);

    if (left !== r2.left) panel.style.left = left + 'px';
    if (top !== r2.top) panel.style.top = top + 'px';
  }

  function openPanel() {
    if (isOpen) return;
    isOpen = true;

    panel.classList.add('fc-open');
    toggle.classList.add('fc-hidden');

    if (!positioned) {
      positioned = true;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      panel.style.left = Math.max(8, window.innerWidth - w - 20) + 'px';
      panel.style.top = Math.max(8, window.innerHeight - h - 70) + 'px';
    }

    clampIntoView();
    autoResize();
    outputEl.scrollTop = outputEl.scrollHeight;

    inputEl.focus();
  }

  function closePanel() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('fc-open');
    toggle.classList.remove('fc-hidden');
  }

  /* ---------- 边缘按钮 ---------- */
  toggle.addEventListener('click', () => {
    isOpen ? closePanel() : openPanel();
  });

  /* ---------- 标题栏按钮 ---------- */
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    outputEl.textContent = '';
    inputEl.focus();
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });

  /* ---------- ESC 关闭 ---------- */
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
    }
  });

  /* =========================================================
   *  拖动移动
   * ========================================================= */
  headerEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;

    e.preventDefault();

    const rect = panel.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const onMove = (ev) => {
      const r = panel.getBoundingClientRect();
      let left = ev.clientX - offsetX;
      let top = ev.clientY - offsetY;

      left = Math.min(Math.max(left, -r.width + 60), window.innerWidth - 60);
      top = Math.min(Math.max(top, 0), window.innerHeight - 34);

      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    };

    const onUp = () => {
      headerEl.removeEventListener('pointermove', onMove);
      headerEl.removeEventListener('pointerup', onUp);
      headerEl.removeEventListener('pointercancel', onUp);
      try { headerEl.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    try { headerEl.setPointerCapture(e.pointerId); } catch (_) {}
    headerEl.addEventListener('pointermove', onMove);
    headerEl.addEventListener('pointerup', onUp);
    headerEl.addEventListener('pointercancel', onUp);
  });

  /* =========================================================
   *  拖动调整大小
   * ========================================================= */
  resizerEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = panel.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = rect.width;
    const startH = rect.height;
    const maxW = Math.max(280, window.innerWidth - rect.left - 4);
    const maxH = Math.max(180, window.innerHeight - rect.top - 4);

    const onMove = (ev) => {
      let w = startW + (ev.clientX - startX);
      let h = startH + (ev.clientY - startY);
      w = Math.max(280, Math.min(w, maxW));
      h = Math.max(180, Math.min(h, maxH));
      panel.style.width = w + 'px';
      panel.style.height = h + 'px';
    };

    const onUp = () => {
      resizerEl.removeEventListener('pointermove', onMove);
      resizerEl.removeEventListener('pointerup', onUp);
      resizerEl.removeEventListener('pointercancel', onUp);
      try { resizerEl.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    try { resizerEl.setPointerCapture(e.pointerId); } catch (_) {}
    resizerEl.addEventListener('pointermove', onMove);
    resizerEl.addEventListener('pointerup', onUp);
    resizerEl.addEventListener('pointercancel', onUp);
  });

  /* =========================================================
   *  视口变化
   * ========================================================= */
  window.addEventListener('resize', () => {
    if (isOpen) clampIntoView();
  });

  /* =========================================================
   *  欢迎语
   * ========================================================= */
  appendLine('log', '准备就绪：输入 JavaScript 后按 Enter 执行，Shift+Enter 换行，↑/↓ 翻阅历史。', '·');
})();
