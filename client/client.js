// agentnoodle · Client bundle（web 平台，ModuleLoader 格式）
// 聊天室面板：输入行动 → 多个 NPC 各回一条（带头像/占位圆）→ fetch /anod/api/*
window.__ModuleLoader__.load({
  id: 'dsh-agentnoodle',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require('react');

    const CSS = `
      .an-win { position: fixed; width: 400px; background: #1b1b23; border: 1px solid #4a4a5c; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.45); font-size: 13px; line-height: 1.6; color: #e8e8ee; pointer-events: auto; display: flex; flex-direction: column; max-height: 80vh; overflow: hidden; z-index: 2147483000; }
      .an-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: grab; user-select: none; touch-action: none; background: #24242f; border-bottom: 1px solid #3a3a4a; }
      .an-head:active { cursor: grabbing; }
      .an-head .an-title { flex: 1; font-weight: 600; }
      .an-head button { font-size: 12px; padding: 1px 8px; border-radius: 6px; border: 1px solid #55556a; background: #2a2a37; color: #e8e8ee; cursor: pointer; }
      .an-body { padding: 8px 10px; overflow: auto; }
      .an-row { display: flex; gap: 6px; margin: 6px 0; flex-wrap: wrap; align-items: center; }
      .an-row select, .an-row input, .an-row button { font-size: 13px; padding: 3px 8px; border-radius: 6px; border: 1px solid #55556a; background: #2a2a37; color: #e8e8ee; }
      .an-row input::placeholder { color: #8a8a9a; }
      .an-row select option { background: #1b1b23; color: #e8e8ee; }
      .an-log { max-height: 300px; overflow: auto; border: 1px solid #3a3a4a; border-radius: 8px; padding: 8px; margin: 6px 0; background: #131318; color: #e8e8ee; }
      .an-msg { display: flex; gap: 8px; margin: 8px 0; align-items: flex-start; }
      .an-msg-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #55556a; flex: none; background: #2a2a37; }
      .an-msg-fallback { display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; color: #ffd479; background: #3a3a4a; }
      .an-msg-body { flex: 1; min-width: 0; }
      .an-msg-name { font-size: 11px; color: #9fd0ff; margin-bottom: 1px; }
      .an-msg-content { white-space: pre-wrap; }
      .an-narr { color: #b8b8c4; padding: 3px 0 3px 8px; border-left: 2px solid #3a3a4a; margin: 6px 0; white-space: pre-wrap; }
      .an-log-user { color: #9fd0ff; margin: 6px 0; }
      .an-log-sys { color: #8a8a9a; font-size: 12px; margin: 4px 0; }
      .an-npc { background: #2c2c3a; border-radius: 6px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 5px; }
      .an-avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1px solid #55556a; }
      .an-busy { opacity: .6; }
      .an-err { color: #ff9a9a; margin: 6px 0; }
      .an-float-btn { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; pointer-events: auto; font-size: 18px; padding: 10px 14px; border-radius: 999px; border: 1px solid #55556a; background: #1b1b23; color: #e8e8ee; box-shadow: 0 6px 24px rgba(0,0,0,.4); cursor: pointer; }
    `;

    // RPC：HTTP JSON（同源 /anod/api/*）
    function rpc(path, args) {
      return fetch('/anod/api/' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args === undefined ? {} : args),
      })
        .then((res) => res.json())
        .then((r) => (r && typeof r === 'object' && r.error ? r : r))
        .catch((err) => ({ error: String((err && err.message) || err) }));
    }

    function Avatar({ worldId, avatar, name }) {
      if (avatar) {
        return React.createElement('img', {
          src: '/anod/avatar/' + worldId + '/' + avatar,
          className: 'an-msg-avatar',
          alt: name || 'NPC',
          onError: (e) => { e.target.style.display = 'none'; },
        });
      }
      return React.createElement('span', { className: 'an-msg-avatar an-msg-fallback' }, (name || '?').slice(0, 1));
    }

    function GameBody() {
      const [worlds, setWorlds] = React.useState([]);
      const [worldId, setWorldId] = React.useState('');
      const [boot, setBoot] = React.useState(null);
      const [charId, setCharId] = React.useState('');
      const [scene, setScene] = React.useState('');
      const [npcs, setNpcs] = React.useState([]);
      const [log, setLog] = React.useState([{ key: 'init', t: 'info', text: '🔄 正在连接 Host…' }]);
      const [input, setInput] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [name, setName] = React.useState('');
      const [historyMore, setHistoryMore] = React.useState(false);
      const [historyNext, setHistoryNext] = React.useState(0);
      const [busyMore, setBusyMore] = React.useState(false);
      const logRef = React.useRef(null);
      const keyRef = React.useRef(0);
      const curRef = React.useRef({ wid: '', cid: '' });
      const nextKey = () => 'k' + (keyRef.current++);

      // 把一条历史记录转成面板日志条目（带稳定 key）
      const toEntry = (m) => {
        if (m.speaker === '系统') return { key: nextKey(), t: 'sys', text: m.content };
        if (m.speaker === '旁白') return { key: nextKey(), t: 'narr', text: m.content };
        return { key: nextKey(), t: 'msg', speaker: m.speaker || '?', text: m.content, avatar: m.avatar || '' };
      };

      React.useEffect(() => {
        rpc('worlds', {}).then((r) => {
          if (r && r.error) { setLog([{ key: nextKey(), t: 'err', text: '❌ worlds 失败：' + r.error }]); return; }
          if (r && r.worlds) {
            setWorlds(r.worlds);
            if (r.currentWorld) { setWorldId(r.currentWorld); doBoot(r.currentWorld); }
            else { setLog([{ key: nextKey(), t: 'info', text: '✅ 已连接 Host，但没有默认世界' }]); }
          } else {
            setLog([{ key: nextKey(), t: 'err', text: '❌ worlds 返回异常：' + JSON.stringify(r) }]);
          }
        });
      }, []);

      const doBoot = (wid) => {
        if (!wid) return;
        setBusy(true);
        setLog([{ key: nextKey(), t: 'info', text: '🔄 正在加载世界…' }]);
        rpc('boot', { worldId: wid }).then((r) => {
          if (r && r.error) { setLog([{ key: nextKey(), t: 'err', text: '❌ boot 失败：' + r.error }]); return; }
          setBoot(r);
          setCharId('');
          const first = r.characters && r.characters[0];
          if (first) { setCharId(first.id); doState(wid, first.id); }
          else { setScene(''); setNpcs([]); setHistoryMore(false); setLog([{ key: nextKey(), t: 'info', text: '✅ 世界已加载：' + (r.worldName || wid) + '。创建一个角色开始。' }]); }
        }).finally(() => setBusy(false));
      };

      const doState = (wid, cid) => {
        curRef.current = { wid, cid };
        setHistoryMore(false);
        rpc('state', { worldId: wid, characterId: cid }).then((r) => {
          if (r && r.error) { setLog([{ key: nextKey(), t: 'err', text: '❌ state 失败：' + r.error }]); return; }
          if (r && r.character) {
            setScene(r.character.scene);
            setNpcs(r.sceneNpcs || []);
            const entries = (r.historyTail || []).map(toEntry);
            setLog([{ key: nextKey(), t: 'info', text: '📍 ' + r.character.scene }, ...entries]);
            setHistoryMore(!!r.historyMore);
            setHistoryNext(r.historyNext || 0);
          }
        });
      };

      // 加载更早历史：滚动到顶或点按钮触发；前置插入并保持视觉位置
      const loadMore = () => {
        const cur = curRef.current;
        if (busyMore || !historyMore) return;
        if (!cur.wid || !cur.cid) return;
        setBusyMore(true);
        rpc('history', { worldId: cur.wid, characterId: cur.cid, before: historyNext }).then((r) => {
          if (curRef.current.wid !== cur.wid || curRef.current.cid !== cur.cid) return;
          if (r && r.error) { setLog((l) => [...l, { key: nextKey(), t: 'err', text: '❌ history 失败：' + r.error }]); return; }
          const older = (r.entries || []).map(toEntry);
          if (!older.length) { setHistoryMore(false); return; }
          const el = logRef.current;
          const prevH = el ? el.scrollHeight : 0;
          const prevTop = el ? el.scrollTop : 0;
          setLog((l) => (l.length && l[0].t === 'info' ? [l[0], ...older, ...l.slice(1)] : [...older, ...l]));
          if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevH + prevTop; });
          setHistoryMore(!!r.more);
          setHistoryNext(r.nextBefore || 0);
        }).finally(() => setBusyMore(false));
      };

      const doCreate = () => {
        if (!worldId) { setLog((l) => [...l, { key: nextKey(), t: 'err', text: '❌ 世界未加载' }]); return; }
        setBusy(true);
        rpc('createCharacter', { worldId, profile: { name: name || '无名旅人', identity: '旅人', appearance: '普通旅人', personality: '沉默寡言', background: '' } })
          .then((r) => {
            if (r && r.error) { setLog((l) => [...l, { key: nextKey(), t: 'err', text: '❌ createCharacter 失败：' + r.error }]); return; }
            setLog((l) => [...l, { key: nextKey(), t: 'info', text: '✅ 角色已创建：' + r.name + '，初始场景：' + r.scene }]);
            doBoot(worldId);
          })
          .finally(() => setBusy(false));
      };

      const doAct = () => {
        const text = input.trim();
        if (!text) { setLog((l) => [...l, { key: nextKey(), t: 'info', text: '⚠️ 请输入行动' }]); return; }
        if (!worldId) { setLog((l) => [...l, { key: nextKey(), t: 'err', text: '⚠️ 世界未加载' }]); return; }
        if (!charId) { setLog((l) => [...l, { key: nextKey(), t: 'info', text: '⚠️ 请先创建或选择一个角色' }]); return; }
        if (busy) return;
        setBusy(true);
        setInput('');
        setLog((l) => [...l, { key: nextKey(), t: 'user', text }]);
        rpc('act', { worldId, characterId: charId, userInput: text }).then((r) => {
          if (r && r.error) { setLog((l) => [...l, { key: nextKey(), t: 'err', text: '❌ act 失败：' + r.error + (r.raw ? '\n' + r.raw : '') }]); return; }
          const add = (r.entries && r.entries.length)
            ? r.entries.map((e) => e.speaker === '旁白' ? { key: nextKey(), t: 'narr', text: e.content } : { key: nextKey(), t: 'msg', speaker: e.speaker, text: e.content, avatar: e.avatar || '' })
            : [{ key: nextKey(), t: 'narr', text: r.description || '' }];
          setLog((l) => [...l, ...add]);
          setScene(r.scene);
          setNpcs(r.sceneNpcs || []);
          if (r.newLocation) setLog((l) => [...l, { key: nextKey(), t: 'sys', text: '🕹️ 场景切换至：' + r.newLocation }]);
        }).finally(() => setBusy(false));
      };

      const renderLogEntry = (e, i) => {
        if (e.t === 'msg') {
          return React.createElement('div', { key: e.key !== undefined ? e.key : i, className: 'an-msg' },
            React.createElement(Avatar, { worldId, avatar: e.avatar, name: e.speaker }),
            React.createElement('div', { className: 'an-msg-body' },
              React.createElement('div', { className: 'an-msg-name' }, e.speaker),
              React.createElement('div', { className: 'an-msg-content' }, e.text),
            ),
          );
        }
        if (e.t === 'narr') return React.createElement('div', { key: e.key !== undefined ? e.key : i, className: 'an-narr' }, e.text);
        const cls = e.t === 'err' ? 'an-err' : e.t === 'user' ? 'an-log-user' : e.t === 'sys' ? 'an-log-sys' : '';
        return React.createElement('div', { key: e.key !== undefined ? e.key : i, className: cls }, e.text);
      };

      return React.createElement('div', null,
        React.createElement('div', { className: 'an-row' },
          React.createElement('span', null, '🌍 世界：'),
          React.createElement('select', {
            value: worldId,
            onChange: (e) => { setWorldId(e.target.value); doBoot(e.target.value); },
          }, worlds.map((w) => React.createElement('option', { key: w.id, value: w.id }, w.name || w.id))),
        ),
        boot && React.createElement('div', { className: 'an-row' },
          React.createElement('span', null, '👤 角色：'),
          React.createElement('select', {
            value: charId,
            onChange: (e) => { setCharId(e.target.value); doState(worldId, e.target.value); },
          }, (boot.characters || []).map((c) => React.createElement('option', { key: c.id, value: c.id }, c.name + (c.isDead ? '（已死亡）' : '')))),
          React.createElement('input', { placeholder: '新角色名', value: name, onChange: (e) => setName(e.target.value), style: { width: 100 } }),
          React.createElement('button', { onClick: doCreate }, '创建'),
        ),
        scene && React.createElement('div', { className: 'an-row' },
          React.createElement('span', null, '📍 当前地点：' + scene),
          npcs.map((n) => React.createElement('span', { key: n.id, className: 'an-npc' },
            n.avatar
              ? React.createElement('img', { src: '/anod/avatar/' + worldId + '/' + n.avatar, alt: n.name, className: 'an-avatar' })
              : React.createElement('span', null, '🧙'),
            n.name,
          )),
        ),
        historyMore && React.createElement('div', { className: 'an-row' },
          React.createElement('button', { onClick: loadMore, disabled: busyMore, style: { flex: 1, textAlign: 'center' } }, busyMore ? '加载中…' : '⬆ 更早的历史'),
        ),
        React.createElement('div', {
          className: 'an-log ' + (busy ? 'an-busy' : ''),
          ref: logRef,
          onScroll: (e) => { if (e.target.scrollTop <= 40) loadMore(); },
        }, log.map((e, i) => renderLogEntry(e, i))),
        React.createElement('div', { className: 'an-row' },
          React.createElement('input', {
            value: input,
            placeholder: '输入行动/说的话，如：走到吧台前，要一杯麦酒',
            onChange: (e) => setInput(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') doAct(); },
            style: { flex: 1 },
          }),
          React.createElement('button', { onClick: doAct, disabled: busy }, busy ? '思考中…' : '行动'),
        ),
      );
    }

    function FloatingWindow() {
      const [pos, setPos] = React.useState(null);
      const [minimized, setMinimized] = React.useState(false);
      const winRef = React.useRef(null);
      const WIDTH = 400;

      const onHeaderDown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const rect = winRef.current ? winRef.current.getBoundingClientRect() : { left: 16, top: 16 };
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        const move = (ev) => {
          setPos({
            x: Math.min(Math.max(ev.clientX - startX, 12 - WIDTH + 60), window.innerWidth - 60),
            y: Math.min(Math.max(ev.clientY - startY, 0), window.innerHeight - 48),
          });
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };

      if (minimized) {
        return React.createElement('button', {
          className: 'an-float-btn',
          onClick: () => setMinimized(false),
          title: '展开 AgentNoodle',
        }, '🍜');
      }

      return React.createElement('div', {
        ref: winRef,
        className: 'an-win',
        style: {
          right: pos ? undefined : 16,
          bottom: pos ? undefined : 16,
          left: pos ? pos.x : undefined,
          top: pos ? pos.y : undefined,
        },
      },
        React.createElement('div', { className: 'an-head', onPointerDown: onHeaderDown },
          React.createElement('span', { className: 'an-title' }, '🍜 AgentNoodle 聊天室'),
          React.createElement('button', {
            onPointerDown: (e) => e.stopPropagation(),
            onClick: () => setMinimized(true),
            title: '最小化',
          }, '—'),
        ),
        React.createElement('div', { className: 'an-body' },
          React.createElement(GameBody, null),
        ),
      );
    }

    function apply(ctx) {
      const slots = ctx.get('slots');
      if (slots === undefined) return;

      ctx.effect(() => {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => style.remove();
      }, 'agentnoodle: styles');

      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'anod-panel', order: 1 },
        () => React.createElement(FloatingWindow, null),
      ));
    }

    exports.apply = apply;
    return module.exports;
  },
});
