import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  Circle,
  ClipboardList,
  Clock3,
  FileText,
  Flag,
  Filter,
  GripVertical,
  Lightbulb,
  ListPlus,
  Lock,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Redo2,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Users,
  X
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'unidades-state';
const SESSION_KEY = 'unidades-session';
const UNIT_DRAFT_KEY_PREFIX = 'unidades-unit-draft';
const UNIT_REPLY_DRAFT_KEY_PREFIX = 'unidades-unit-reply-draft';
const ADMIN_DRAFT_KEY = 'unidades-admin-draft';
const COLORS = ['#69b578', '#e0a458', '#5d8aa8', '#d96570', '#7b6bb7'];
const PRIORITIES = {
  low: { label: 'baixa', weight: 1 },
  normal: { label: 'normal', weight: 2 },
  high: { label: 'alta', weight: 3 },
  urgent: { label: 'urgente', weight: 4 }
};
const UNITS = [
  { id: 'jaguapita', name: 'Jaguapitã', password: 'jaguapita', accent: '#69b578' },
  { id: 'palmeiras', name: 'Palmeiras', password: 'palmeiras', accent: '#e0a458' },
  { id: 'ipuacu', name: 'Ipuaçu', password: 'ipuacu', accent: '#5d8aa8' },
  { id: 'arapongas', name: 'Arapongas', password: 'arapongas', accent: '#d96570' },
  { id: 'rondon', name: 'Rondon', password: 'rondon', accent: '#7b6bb7' }
];

function emptyUnit(unit) {
  return {
    id: unit.id,
    name: unit.name,
    documents: [],
    activity: []
  };
}

function createDefaultState() {
  return {
    version: 1,
    updatedAt: isoNow(),
    settings: {
      adminUser: 'rosa',
      adminPassword: 'gass'
    },
    units: Object.fromEntries(UNITS.map((unit) => [unit.id, emptyUnit(unit)])),
    messages: []
  };
}

function normalizeState(input) {
  const state = input && typeof input === 'object' ? input : createDefaultState();
  const fallback = createDefaultState();
  return {
    ...fallback,
    ...state,
    settings: { ...fallback.settings, ...(state.settings || {}) },
    units: Object.fromEntries(
      UNITS.map((unit) => [
        unit.id,
        {
          ...emptyUnit(unit),
          ...(state.units?.[unit.id] || {}),
          name: unit.name,
          documents: Array.isArray(state.units?.[unit.id]?.documents)
            ? state.units[unit.id].documents.map((document) => ({
                ...document,
                tasks: sortTasks(document.tasks || [])
              }))
            : [],
          activity: Array.isArray(state.units?.[unit.id]?.activity) ? state.units[unit.id].activity : []
        }
      ])
    ),
    messages: Array.isArray(state.messages) ? state.messages.map(normalizeMessage) : []
  };
}

function normalizeMessage(message) {
  return {
    ...message,
    targets: Array.isArray(message.targets) ? message.targets : [],
    seenBy: Array.isArray(message.seenBy) ? message.seenBy : [],
    replies: Array.isArray(message.replies) ? message.replies : [],
    from: message.from || 'rosa',
    fromUnitId: message.fromUnitId || ''
  };
}

function hasAppsScriptBridge() {
  return Boolean(window.google?.script?.run);
}

function runAppsScript(functionName, ...args) {
  return new Promise((resolve, reject) => {
    const runner = window.google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((error) => reject(new Error(error?.message || String(error))));
    runner[functionName](...args);
  });
}

async function serverCall(functionName, ...args) {
  if (hasAppsScriptBridge()) return runAppsScript(functionName, ...args);
  return localCall(functionName, ...args);
}

function readLocalState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return createDefaultState();
  }
}

function writeLocalState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState({ ...state, updatedAt: isoNow() })));
}

function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function writeStoredSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function unitDraftKey(unitId) {
  return `${UNIT_DRAFT_KEY_PREFIX}:${unitId || 'unknown'}`;
}

function unitReplyDraftKey(unitId, messageId) {
  return `${UNIT_REPLY_DRAFT_KEY_PREFIX}:${unitId || 'unknown'}:${messageId || 'unknown'}`;
}

function readUnitMessageDraft(unitId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(unitDraftKey(unitId)));
    return {
      title: String(parsed?.title || ''),
      text: String(parsed?.text || '')
    };
  } catch {
    return { title: '', text: '' };
  }
}

function writeUnitMessageDraft(unitId, draft) {
  const clean = {
    title: String(draft?.title || ''),
    text: String(draft?.text || '')
  };
  if (!clean.title.trim() && !clean.text.trim()) {
    localStorage.removeItem(unitDraftKey(unitId));
    return;
  }
  localStorage.setItem(unitDraftKey(unitId), JSON.stringify(clean));
}

function readUnitReplyDraft(unitId, messageId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(unitReplyDraftKey(unitId, messageId)));
    return String(parsed?.text || '');
  } catch {
    return '';
  }
}

function writeUnitReplyDraft(unitId, messageId, text) {
  const clean = String(text || '');
  if (!clean.trim()) {
    localStorage.removeItem(unitReplyDraftKey(unitId, messageId));
    return;
  }
  localStorage.setItem(unitReplyDraftKey(unitId, messageId), JSON.stringify({ text: clean }));
}

function readAdminMessageDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_DRAFT_KEY));
    const parsedTargets = Array.isArray(parsed?.targets)
      ? Array.from(new Set(parsed.targets.filter((unitId) => UNITS.some((unit) => unit.id === unitId))))
      : null;
    return {
      title: String(parsed?.title || ''),
      text: String(parsed?.text || ''),
      targets: parsedTargets === null ? UNITS.map((unit) => unit.id) : parsedTargets
    };
  } catch {
    return { title: '', text: '', targets: UNITS.map((unit) => unit.id) };
  }
}

function writeAdminMessageDraft(draft) {
  const clean = {
    title: String(draft?.title || ''),
    text: String(draft?.text || ''),
    targets: Array.isArray(draft?.targets) ? draft.targets.filter((unitId) => UNITS.some((unit) => unit.id === unitId)) : []
  };
  if (!clean.title.trim() && !clean.text.trim()) {
    localStorage.removeItem(ADMIN_DRAFT_KEY);
    return;
  }
  localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(clean));
}

async function localCall(functionName, ...args) {
  const state = readLocalState();
  const session = readStoredSession();

  if (functionName === 'loginUnitServer') {
    const [unitId, password] = args;
    const unit = UNITS.find((item) => item.id === unitId);
    if (!unit || normalizePassword(password) !== unit.password) throw new Error('Senha da unidade incorreta');
    return { token: `local-unit-${unit.id}`, role: 'unit', unitId: unit.id, unitName: unit.name };
  }

  if (functionName === 'loginAdminServer') {
    const [username, password] = args;
    if (String(username || '').trim().toLowerCase() !== String(state.settings.adminUser).toLowerCase()) {
      throw new Error('Login da Rosa incorreto');
    }
    if (String(password || '') !== String(state.settings.adminPassword)) throw new Error('Senha da Rosa incorreta');
    return { token: 'local-admin', role: 'admin', user: state.settings.adminUser };
  }

  if (!session) throw new Error('Sessão expirada');

  if (functionName === 'getStateServer') {
    if (session.role === 'admin') return { role: 'admin', state };
    return {
      role: 'unit',
      unitId: session.unitId,
      unit: state.units[session.unitId],
      messages: messagesForUnit(state, session.unitId)
    };
  }

  if (functionName === 'saveUnitServer') {
    const [, unitId, unitState] = args;
    if (session.role !== 'admin' && session.unitId !== unitId) throw new Error('Acesso negado');
    const next = normalizeState({
      ...state,
      updatedAt: isoNow(),
      units: {
        ...state.units,
        [unitId]: { ...unitState, id: unitId, name: unitName(unitId) }
      }
    });
    writeLocalState(next);
    return session.role === 'admin'
      ? { role: 'admin', state: next }
      : { role: 'unit', unitId, unit: next.units[unitId], messages: messagesForUnit(next, unitId) };
  }

  if (functionName === 'sendMessageServer') {
    const [, message] = args;
    if (session.role !== 'admin') throw new Error('Apenas Rosa pode enviar recados');
    const targets = message.targets?.length ? message.targets : UNITS.map((unit) => unit.id);
    const next = normalizeState({
      ...state,
      updatedAt: isoNow(),
      messages: [
        {
          id: uid('msg'),
          title: message.title || 'Recado da Rosa',
          text: message.text || '',
          targets,
          seenBy: [],
          replies: [],
          from: 'rosa',
          fromUnitId: '',
          createdAt: isoNow()
        },
        ...state.messages
      ].slice(0, 200)
    });
    writeLocalState(next);
    return { role: 'admin', state: next };
  }

  if (functionName === 'sendUnitMessageServer') {
    const [, message] = args;
    if (session.role !== 'unit') throw new Error('Apenas a unidade pode enviar mensagem');
    const text = String(message.text || '').trim();
    if (!text) throw new Error('Mensagem vazia');
    const next = normalizeState({
      ...state,
      updatedAt: isoNow(),
      messages: [
        {
          id: uid('msg'),
          title: message.title || 'Mensagem da unidade',
          text,
          targets: [session.unitId],
          seenBy: [],
          replies: [],
          from: 'unit',
          fromUnitId: session.unitId,
          createdAt: isoNow()
        },
        ...state.messages
      ].slice(0, 250)
    });
    writeLocalState(next);
    return {
      role: 'unit',
      unitId: session.unitId,
      unit: next.units[session.unitId],
      messages: messagesForUnit(next, session.unitId)
    };
  }

  if (functionName === 'updateMessageServer') {
    const [, messageId, patch] = args;
    if (session.role !== 'admin') throw new Error('Apenas Rosa pode editar recados');
    const targets = patch.targets?.length ? patch.targets : UNITS.map((unit) => unit.id);
    const next = normalizeState({
      ...state,
      updatedAt: isoNow(),
      messages: state.messages.map((message) =>
        message.id === messageId && message.from !== 'unit'
          ? { ...message, title: patch.title || message.title, text: patch.text || '', targets, seenBy: [], updatedAt: isoNow() }
          : message
      )
    });
    writeLocalState(next);
    return { role: 'admin', state: next };
  }

  if (functionName === 'deleteMessageServer') {
    const [, messageId] = args;
    if (session.role !== 'admin') throw new Error('Apenas Rosa pode apagar recados');
    const next = normalizeState({ ...state, updatedAt: isoNow(), messages: state.messages.filter((message) => message.id !== messageId) });
    writeLocalState(next);
    return { role: 'admin', state: next };
  }

  if (functionName === 'replyMessageServer') {
    const [, messageId, text] = args;
    if (session.role !== 'unit') throw new Error('Apenas a unidade pode responder');
    const cleanText = String(text || '').trim();
    if (!cleanText) throw new Error('Resposta vazia');
    const next = normalizeState({
      ...state,
      updatedAt: isoNow(),
      messages: state.messages.map((message) => {
        if (message.id !== messageId) return message;
        if (message.from === 'unit') throw new Error('Não é possível responder uma mensagem avulsa da unidade');
        if (!message.targets.includes(session.unitId)) throw new Error('Recado não pertence à unidade');
        return {
          ...message,
          replies: [
            { id: uid('reply'), unitId: session.unitId, text: cleanText, createdAt: isoNow() },
            ...(message.replies || [])
          ]
        };
      })
    });
    writeLocalState(next);
    return {
      role: 'unit',
      unitId: session.unitId,
      unit: next.units[session.unitId],
      messages: messagesForUnit(next, session.unitId)
    };
  }

  if (functionName === 'markMessageSeenServer') {
    const [, messageId] = args;
    if (session.role !== 'unit') throw new Error('Apenas a unidade pode marcar recado');
    const next = normalizeState({
      ...state,
      messages: state.messages.map((message) => {
        if (message.id !== messageId) return message;
        return { ...message, seenBy: Array.from(new Set([...(message.seenBy || []), session.unitId])) };
      })
    });
    writeLocalState(next);
    return {
      role: 'unit',
      unitId: session.unitId,
      unit: next.units[session.unitId],
      messages: messagesForUnit(next, session.unitId)
    };
  }

  if (functionName === 'updateAdminPasswordServer') {
    const [, currentPassword, nextPassword] = args;
    if (session.role !== 'admin') throw new Error('Acesso negado');
    if (String(currentPassword || '') !== String(state.settings.adminPassword)) throw new Error('Senha atual incorreta');
    const next = normalizeState({
      ...state,
      settings: { ...state.settings, adminPassword: nextPassword }
    });
    writeLocalState(next);
    return { role: 'admin', state: next };
  }

  if (functionName === 'emptyTrashServer') {
    const [, unitId, password] = args;
    const unit = UNITS.find((item) => item.id === unitId);
    if (session.role !== 'admin') {
      if (session.unitId !== unitId) throw new Error('Acesso negado');
      if (normalizePassword(password) !== unit.password) throw new Error('Senha da unidade incorreta');
    }
    const nextUnit = addActivity(
      {
        ...state.units[unitId],
        documents: state.units[unitId].documents.filter((doc) => !doc.deletedAt)
      },
      'trash_emptied',
      {}
    );
    const next = normalizeState({ ...state, units: { ...state.units, [unitId]: nextUnit } });
    writeLocalState(next);
    return session.role === 'admin'
      ? { role: 'admin', state: next }
      : { role: 'unit', unitId, unit: next.units[unitId], messages: messagesForUnit(next, unitId) };
  }

  throw new Error(`Função local não encontrada: ${functionName}`);
}

function normalizePassword(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function isoNow() {
  return new Date().toISOString();
}

function unitName(unitId) {
  return UNITS.find((unit) => unit.id === unitId)?.name || unitId;
}

function formatShortDate(value) {
  if (!value) return 'sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value));
}

function completion(doc) {
  if (!doc.tasks?.length) return 0;
  return Math.round((doc.tasks.filter((task) => task.done).length / doc.tasks.length) * 100);
}

function isComplete(doc) {
  return doc.tasks?.length > 0 && doc.tasks.every((task) => task.done);
}

function normalizeTask(task, order = 0) {
  return {
    ...task,
    order: Number.isFinite(task.order) ? task.order : order,
    priority: task.priority && PRIORITIES[task.priority] ? task.priority : 'normal',
    dueAt: task.dueAt || ''
  };
}

function sortTasks(tasks = []) {
  return [...tasks].map(normalizeTask).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function taskDueState(task) {
  if (task.done || !task.dueAt) return 'none';
  const diffDays = taskDueDiffDays(task);
  if (diffDays < 0) return 'late';
  if (diffDays <= 1) return 'soon';
  return 'scheduled';
}

function taskDueDiffDays(task) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${task.dueAt}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function taskScore(task) {
  const dueScores = { late: 40, soon: 25, scheduled: 8, none: 0 };
  return (PRIORITIES[task.priority || 'normal']?.weight || 2) * 10 + dueScores[taskDueState(task)];
}

function attentionItems(unit) {
  return (unit.documents || [])
    .filter((doc) => !doc.deletedAt)
    .flatMap((doc) =>
      sortTasks(doc.tasks)
        .filter((task) => !task.done)
        .map((task) => ({ doc, task, score: taskScore(task) }))
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function dueLabel(task) {
  if (!task.dueAt) return 'sem prazo';
  const state = taskDueState(task);
  const label = formatShortDate(task.dueAt);
  const diffDays = taskDueDiffDays(task);
  if (state === 'late') return `atrasado desde ${label}`;
  if (diffDays === 0) return 'vence hoje';
  if (diffDays === 1) return 'vence amanhã';
  return `prazo ${label}`;
}

function meetingSummary(doc) {
  const tasks = sortTasks(doc.tasks);
  const pending = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);
  const lines = [
    `Documento: ${doc.title}`,
    doc.owner ? `Responsavel/pedido por: ${doc.owner}` : '',
    doc.context ? `Contexto: ${doc.context}` : '',
    `Andamento: ${completion(doc)}% (${done.length}/${tasks.length})`,
    '',
    'Pendencias:',
    ...(pending.length
      ? pending.map((task) => `- ${task.text} | prioridade ${PRIORITIES[task.priority || 'normal'].label} | ${dueLabel(task)}`)
      : ['- Nenhuma pendencia aberta.']),
    '',
    'Concluido:',
    ...(done.length ? done.map((task) => `- ${task.text}`) : ['- Nada marcado como concluido ainda.'])
  ].filter((line, index, list) => line || list[index - 1]);
  return lines.join('\n');
}

function messagesForUnit(state, unitId) {
  return (state.messages || []).filter((message) => (message.targets || []).includes(unitId));
}

function relativeTime(value) {
  if (!value) return 'sem data';
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units = [
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000]
  ];
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (abs >= size) return formatter.format(Math.round(diffMs / size), unit);
  }
  return 'agora';
}

function fullDateTime(value) {
  if (!value) return 'sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function addActivity(unitState, action, details = {}) {
  return {
    ...unitState,
    activity: [
      {
        id: uid('act'),
        action,
        details,
        createdAt: isoNow()
      },
      ...(unitState.activity || [])
    ].slice(0, 120)
  };
}

function App() {
  const [session, setSession] = useState(() => readStoredSession());
  const [appState, setAppState] = useState(createDefaultState());
  const [unitState, setUnitState] = useState(null);
  const [unitMessages, setUnitMessages] = useState([]);
  const [syncMode, setSyncMode] = useState('carregando');
  const [loginError, setLoginError] = useState('');
  const refreshRef = useRef(null);

  useEffect(() => {
    writeStoredSession(session);
  }, [session]);

  useEffect(() => {
    if (!session) {
      setUnitState(null);
      setUnitMessages([]);
      setAppState(createDefaultState());
      setSyncMode('pronto');
      return undefined;
    }

    let active = true;
    async function load(silent = false) {
      if (!silent) setSyncMode('carregando');
      try {
        const response = await serverCall('getStateServer', session.token);
        if (!active) return;
        if (response.role === 'admin') {
          setAppState(normalizeState(response.state));
          setUnitState(null);
        } else {
          setUnitState(response.unit);
          setUnitMessages(response.messages || []);
        }
        setSyncMode('sincronizado');
      } catch {
        if (active) setSyncMode('reconectar');
      }
    }

    load();
    refreshRef.current = setInterval(() => load(true), 7000);
    return () => {
      active = false;
      clearInterval(refreshRef.current);
    };
  }, [session]);

  async function loginUnit(unitId, password) {
    setLoginError('');
    try {
      const response = await serverCall('loginUnitServer', unitId, password);
      const nextSession = { token: response.token, role: 'unit', unitId: response.unitId };
      setSession(nextSession);
      writeStoredSession(nextSession);
    } catch (error) {
      setLoginError(error.message || 'Não consegui entrar nessa unidade.');
    }
  }

  async function loginAdmin(username, password) {
    setLoginError('');
    try {
      const response = await serverCall('loginAdminServer', username, password);
      const nextSession = { token: response.token, role: 'admin', user: response.user };
      setSession(nextSession);
      writeStoredSession(nextSession);
    } catch (error) {
      setLoginError(error.message || 'Não consegui entrar no acesso da Rosa.');
    }
  }

  function logout() {
    setSession(null);
    writeStoredSession(null);
  }

  async function saveUnit(unitId, nextUnit) {
    if (session?.role === 'admin') {
      setAppState((current) => normalizeState({ ...current, units: { ...current.units, [unitId]: nextUnit } }));
    } else {
      setUnitState(nextUnit);
    }
    setSyncMode('salvando');
    try {
      const response = await serverCall('saveUnitServer', session.token, unitId, nextUnit);
      if (response.role === 'admin') setAppState(normalizeState(response.state));
      else {
        setUnitState(response.unit);
        setUnitMessages(response.messages || []);
      }
      setSyncMode('sincronizado');
    } catch {
      setSyncMode('local');
    }
  }

  async function emptyTrash(unitId, password) {
    setSyncMode('salvando');
    const response = await serverCall('emptyTrashServer', session.token, unitId, password);
    if (response.role === 'admin') setAppState(normalizeState(response.state));
    else {
      setUnitState(response.unit);
      setUnitMessages(response.messages || []);
    }
    setSyncMode('sincronizado');
  }

  async function sendMessage(message) {
    setSyncMode('salvando');
    const response = await serverCall('sendMessageServer', session.token, message);
    setAppState(normalizeState(response.state));
    setSyncMode('sincronizado');
  }

  async function updateMessage(messageId, patch) {
    setSyncMode('salvando');
    const response = await serverCall('updateMessageServer', session.token, messageId, patch);
    setAppState(normalizeState(response.state));
    setSyncMode('sincronizado');
  }

  async function deleteMessage(messageId) {
    setSyncMode('salvando');
    const response = await serverCall('deleteMessageServer', session.token, messageId);
    setAppState(normalizeState(response.state));
    setSyncMode('sincronizado');
  }

  async function markMessageSeen(messageId) {
    const response = await serverCall('markMessageSeenServer', session.token, messageId);
    setUnitState(response.unit);
    setUnitMessages(response.messages || []);
  }

  async function replyMessage(messageId, text) {
    const response = await serverCall('replyMessageServer', session.token, messageId, text);
    setUnitState(response.unit);
    setUnitMessages(response.messages || []);
  }

  async function sendUnitMessage(message) {
    const response = await serverCall('sendUnitMessageServer', session.token, message);
    setUnitState(response.unit);
    setUnitMessages(response.messages || []);
  }

  async function changeAdminPassword(currentPassword, nextPassword) {
    const response = await serverCall('updateAdminPasswordServer', session.token, currentPassword, nextPassword);
    setAppState(normalizeState(response.state));
  }

  if (!session) {
    return <AccessGate error={loginError} onAdminLogin={loginAdmin} onUnitLogin={loginUnit} />;
  }

  if (session.role === 'admin') {
    return (
      <AdminApp
        state={appState}
        syncMode={syncMode}
        onLogout={logout}
        onSaveUnit={saveUnit}
        onEmptyTrash={emptyTrash}
        onSendMessage={sendMessage}
        onUpdateMessage={updateMessage}
        onDeleteMessage={deleteMessage}
        onChangeAdminPassword={changeAdminPassword}
      />
    );
  }

  return (
    <UnitApp
      messages={unitMessages}
      syncMode={syncMode}
      unit={unitState || emptyUnit(UNITS.find((item) => item.id === session.unitId))}
      unitId={session.unitId}
      onEmptyTrash={emptyTrash}
      onLogout={logout}
      onMarkMessageSeen={markMessageSeen}
      onReplyMessage={replyMessage}
      onSendUnitMessage={sendUnitMessage}
      onSaveUnit={saveUnit}
    />
  );
}

function AccessGate({ error, onAdminLogin, onUnitLogin }) {
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [unitPassword, setUnitPassword] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUser, setAdminUser] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const unit = UNITS.find((item) => item.id === selectedUnit);

  return (
    <main className="gate">
      <section className="gate-card">
        <span className="eyebrow">Controle por unidade</span>
        <h1>Unidades</h1>
        <p className="gate-copy">Escolha a unidade para abrir somente os documentos dela.</p>

        <div className="unit-grid">
          {UNITS.map((item) => (
            <button
              className={`unit-tile ${selectedUnit === item.id ? 'selected' : ''}`}
              key={item.id}
              onClick={() => {
                setSelectedUnit(item.id);
                setUnitPassword('');
              }}
              style={{ '--accent': item.accent }}
              type="button"
            >
              <span>{item.name}</span>
              <Lock size={18} />
            </button>
          ))}
        </div>

        {unit ? (
          <form
            className="gate-login"
            onSubmit={(event) => {
              event.preventDefault();
              onUnitLogin(unit.id, unitPassword);
            }}
          >
            <label>
              Senha de {unit.name}
              <input
                autoFocus
                inputMode="text"
                onChange={(event) => setUnitPassword(event.target.value)}
                placeholder="Senha da unidade"
                type="password"
                value={unitPassword}
              />
            </label>
            <button className="primary" type="submit">
              <ShieldCheck size={18} /> Entrar
            </button>
          </form>
        ) : null}

        {error ? <p className="error-line">{error}</p> : null}

        <div className="admin-strip">
          <button className="text-button" onClick={() => setAdminOpen((value) => !value)} type="button">
            Acesso Rosa
          </button>
          {adminOpen ? (
            <form
              className="admin-login"
              onSubmit={(event) => {
                event.preventDefault();
                onAdminLogin(adminUser, adminPassword);
              }}
            >
              <input
                aria-label="Login"
                onChange={(event) => setAdminUser(event.target.value)}
                placeholder="login"
                value={adminUser}
              />
              <input
                aria-label="Senha"
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="senha"
                type="password"
                value={adminPassword}
              />
              <button className="icon-button" title="Entrar como Rosa" type="submit">
                <Lock size={18} />
              </button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function UnitApp({
  messages,
  onEmptyTrash,
  onLogout,
  onMarkMessageSeen,
  onReplyMessage,
  onSendUnitMessage,
  onSaveUnit,
  syncMode,
  unit,
  unitId
}) {
  return (
    <main className="shell">
      <Topbar
        eyebrow="Registros de documentos"
        onLogout={onLogout}
        syncMode={syncMode}
        title={unitName(unitId)}
      />
      <UnitMessages
        messages={messages}
        onReply={onReplyMessage}
        onSeen={onMarkMessageSeen}
        onSendUnitMessage={onSendUnitMessage}
        unitId={unitId}
      />
      <DocumentWorkspace
        mode="unit"
        onEmptyTrash={onEmptyTrash}
        onSaveUnit={(nextUnit) => onSaveUnit(unitId, nextUnit)}
        unit={unit}
      />
    </main>
  );
}

function AdminApp({
  onChangeAdminPassword,
  onDeleteMessage,
  onEmptyTrash,
  onLogout,
  onSaveUnit,
  onSendMessage,
  onUpdateMessage,
  state,
  syncMode
}) {
  const [selectedUnitId, setSelectedUnitId] = useState(UNITS[0].id);
  const selectedUnit = state.units[selectedUnitId] || emptyUnit(UNITS[0]);
  const selectedMessages = state.messages.filter((message) => (message.targets || []).includes(selectedUnitId) || message.fromUnitId === selectedUnitId);

  return (
    <main className="shell admin-shell">
      <Topbar eyebrow="Painel da Rosa" onLogout={onLogout} syncMode={syncMode} title="Acompanhamento das unidades" />
      <section className="admin-panel">
        <aside className="admin-side">
          <AdminSummary selectedUnitId={selectedUnitId} state={state} onSelect={setSelectedUnitId} />
          <PasswordPanel onChangePassword={onChangeAdminPassword} />
        </aside>
        <section className="admin-comms">
          <AdminMessages selectedUnitId={selectedUnitId} state={state} onSendMessage={onSendMessage} />
          <MessageHistory
            messages={selectedMessages}
            onDeleteMessage={onDeleteMessage}
            onUpdateMessage={onUpdateMessage}
            selectedUnitId={selectedUnitId}
          />
        </section>
      </section>
      <div className="admin-workspace-title">
        <span className="eyebrow">Unidade em acompanhamento</span>
        <h2>{unitName(selectedUnitId)}</h2>
      </div>
      <DocumentWorkspace
        mode="admin"
        onEmptyTrash={onEmptyTrash}
        onSaveUnit={(nextUnit) => onSaveUnit(selectedUnitId, nextUnit)}
        unit={selectedUnit}
      />
    </main>
  );
}

function Topbar({ eyebrow, onLogout, syncMode, title }) {
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <span className={`sync ${syncMode}`}>{syncMode}</span>
      <button className="icon-button" onClick={onLogout} title="Sair" type="button">
        <LogOut size={21} />
      </button>
    </header>
  );
}

function UnitMessages({ messages, onReply, onSeen, onSendUnitMessage, unitId }) {
  const rosaMessages = messages.filter((message) => message.from !== 'unit');
  const visible = rosaMessages.filter((message) => !(message.seenBy || []).includes(unitId));
  const [expanded, setExpanded] = useState(Boolean(visible.length));
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    const saved = readUnitMessageDraft(unitId);
    setTitle(saved.title);
    setText(saved.text);
  }, [unitId]);

  useEffect(() => {
    writeUnitMessageDraft(unitId, { title, text });
  }, [unitId, title, text]);

  async function submit(event) {
    event.preventDefault();
    if (!text.trim()) return;
    await onSendUnitMessage({
      title: title.trim() || 'Mensagem da unidade',
      text: text.trim()
    });
    setTitle('');
    setText('');
    setExpanded(true);
  }

  return (
    <section className="message-band">
      <div className="message-band-head">
        <button className="text-button strong" onClick={() => setExpanded((value) => !value)} type="button">
          <MessageSquare size={18} />
          Conversa com a Rosa
          {visible.length ? <b>{visible.length} novo(s)</b> : null}
        </button>
      </div>
      <form className="unit-message-form" onSubmit={submit}>
        <input onChange={(event) => setTitle(event.target.value)} placeholder="Assunto para Rosa" value={title} />
        <input onChange={(event) => setText(event.target.value)} placeholder="Mensagem nova para Rosa" value={text} />
        <button className="primary" type="submit">
          <Send size={17} /> Enviar
        </button>
      </form>
      <small className="draft-hint">{title.trim() || text.trim() ? 'Rascunho salvo neste aparelho.' : 'Sem rascunho pendente.'}</small>
      {expanded ? (
        <div className="message-list">
          {messages.length ? (
            messages.map((message) => (
              <UnitMessageCard
                key={message.id}
                message={message}
                onReply={onReply}
                onSeen={onSeen}
                unitId={unitId}
              />
            ))
          ) : (
            <p className="empty">Nenhuma conversa com a Rosa ainda.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function UnitMessageCard({ message, onReply, onSeen, unitId }) {
  const [reply, setReply] = useState(() => readUnitReplyDraft(unitId, message.id));
  const seen = (message.seenBy || []).includes(unitId);
  const fromUnit = message.from === 'unit';
  const replies = (message.replies || []).filter((item) => item.unitId === unitId);

  useEffect(() => {
    writeUnitReplyDraft(unitId, message.id, reply);
  }, [unitId, message.id, reply]);

  async function submit(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    await onReply(message.id, reply.trim());
    setReply('');
  }

  return (
    <article className={`message-card ${fromUnit ? 'from-unit' : seen ? '' : 'unread'}`}>
      <div>
        <strong>{fromUnit ? `Você enviou: ${message.title}` : message.title}</strong>
        <p>{message.text}</p>
        <small>
          {fromUnit ? 'Enviado para Rosa' : 'Rosa enviou'} {relativeTime(message.createdAt)} · {fullDateTime(message.createdAt)}
          {message.updatedAt ? ` · editado ${relativeTime(message.updatedAt)}` : ''}
        </small>
      </div>
      <div className="message-card-actions">
        {fromUnit ? (
          <span className="seen-pill">enviado</span>
        ) : !seen ? (
          <button className="ghost" onClick={() => onSeen(message.id)} type="button">
            <Check size={17} /> Visto
          </button>
        ) : (
          <span className="seen-pill">visto</span>
        )}
      </div>
      {!fromUnit ? (
        <>
          <form className="reply-form" onSubmit={submit}>
            <input
              onChange={(event) => setReply(event.target.value)}
              placeholder="Responder esta mensagem da Rosa"
              value={reply}
            />
            <button className="primary square" type="submit">
              <Send size={17} />
            </button>
          </form>
          <small className="draft-hint reply-draft-hint">
            {reply.trim() ? 'Rascunho de resposta salvo neste aparelho.' : 'Sem rascunho de resposta pendente.'}
          </small>
        </>
      ) : null}
      {replies.length ? (
        <div className="reply-list">
          {replies.map((item) => (
            <p key={item.id}>
              <strong>{unitName(item.unitId)} perguntou:</strong> {item.text}
              <small>{relativeTime(item.createdAt)} · {fullDateTime(item.createdAt)}</small>
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function AdminSummary({ onSelect, selectedUnitId, state }) {
  return (
    <section className="admin-card summary-card">
      <div className="section-title">
        <Users size={18} />
        <h2>Unidades</h2>
      </div>
      <div className="summary-list">
        {UNITS.map((unit) => {
          const docs = state.units[unit.id]?.documents || [];
          const active = docs.filter((doc) => !doc.deletedAt);
          const done = active.filter(isComplete);
          return (
            <button
              className={`summary-row ${selectedUnitId === unit.id ? 'selected' : ''}`}
              key={unit.id}
              onClick={() => onSelect(unit.id)}
              style={{ '--accent': unit.accent }}
              type="button"
            >
              <span>
                <strong>{unit.name}</strong>
                <small>{done.length}/{active.length} finalizados</small>
              </span>
              <b>{active.filter((doc) => !isComplete(doc)).length}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AdminMessages({ onSendMessage, selectedUnitId, state }) {
  const initialDraft = useMemo(() => readAdminMessageDraft(), []);
  const [title, setTitle] = useState(initialDraft.title);
  const [text, setText] = useState(initialDraft.text);
  const [targets, setTargets] = useState(initialDraft.targets);
  const [isSending, setIsSending] = useState(false);
  const selectedCount = targets.length;
  const hasNoTargets = selectedCount === 0;

  useEffect(() => {
    writeAdminMessageDraft({ title, text, targets });
  }, [title, text, targets]);

  function toggleTarget(unitId) {
    setTargets((current) => {
      if (current.includes(unitId)) return current.filter((item) => item !== unitId);
      return [...current, unitId];
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!text.trim() || hasNoTargets || isSending) return;
    setIsSending(true);
    try {
      await onSendMessage({
        title: title.trim() || 'Recado da Rosa',
        text: text.trim(),
        targets
      });
      setTitle('');
      setText('');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="admin-card">
      <div className="section-title">
        <Send size={18} />
        <h2>Recado para unidades</h2>
      </div>
      <form className="message-form" onSubmit={submit}>
        <input disabled={isSending} onChange={(event) => setTitle(event.target.value)} placeholder="Título do recado" value={title} />
        <textarea disabled={isSending} onChange={(event) => setText(event.target.value)} placeholder="Mensagem" value={text} />
        <div className="target-row">
          {UNITS.map((unit) => (
            <button
              className={targets.includes(unit.id) ? 'selected' : ''}
              disabled={isSending}
              key={unit.id}
              onClick={() => toggleTarget(unit.id)}
              type="button"
            >
              {unit.name}
            </button>
          ))}
        </div>
        <div className="target-tools">
          <small className={`target-hint ${selectedCount ? '' : 'warning'}`}>
            {selectedCount
              ? `${selectedCount}/${UNITS.length} unidade(s) selecionada(s).`
              : 'Nenhuma unidade selecionada: selecione ao menos uma para enviar.'}
          </small>
          <div className="target-actions">
            <button
              className="text-button"
              disabled={selectedCount === UNITS.length || isSending}
              onClick={() => setTargets(UNITS.map((unit) => unit.id))}
              type="button"
            >
              Selecionar todas
            </button>
            <button className="text-button" disabled={!selectedCount || isSending} onClick={() => setTargets([])} type="button">
              Limpar seleção
            </button>
          </div>
        </div>
        <button className="primary" disabled={hasNoTargets || !text.trim() || isSending} type="submit">
          <Send size={17} /> {isSending ? 'Enviando...' : 'Enviar'}
        </button>
      </form>
      <small className="draft-hint">
        {title.trim() || text.trim() || selectedCount !== UNITS.length ? 'Rascunho salvo neste aparelho.' : 'Sem rascunho pendente.'}
      </small>
      <div className="sent-log">
        {state.messages
          .filter((message) => message.from !== 'unit' && (message.targets || []).includes(selectedUnitId))
          .slice(0, 4)
          .map((message) => (
          <p key={message.id}>
            <strong>{message.title}</strong>
            <span>{(message.seenBy || []).length}/{message.targets.length} viram</span>
          </p>
        ))}
      </div>
    </section>
  );
}

function MessageHistory({ messages, onDeleteMessage, onUpdateMessage, selectedUnitId }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ title: '', text: '', targets: [] });
  const editingHasNoTargets = draft.targets.length === 0;

  function startEdit(message) {
    setEditingId(message.id);
    setDraft({
      title: message.title || '',
      text: message.text || '',
      targets: message.targets?.length ? message.targets : UNITS.map((unit) => unit.id)
    });
  }

  function toggleTarget(unitId) {
    setDraft((current) => {
      const targets = current.targets.includes(unitId)
        ? current.targets.filter((item) => item !== unitId)
        : [...current.targets, unitId];
      return { ...current, targets };
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (editingHasNoTargets) return;
    await onUpdateMessage(editingId, {
      ...draft,
      targets: draft.targets
    });
    setEditingId(null);
  }

  return (
    <section className="admin-card history-card">
      <button className="history-toggle" onClick={() => setOpen((value) => !value)} type="button">
        <span>
          <MessageSquare size={18} />
          <strong>Mensagens de {unitName(selectedUnitId)}</strong>
        </span>
        <b>{messages.length}</b>
      </button>
      {open ? (
        <div className="admin-message-list">
          {messages.length ? (
            messages.map((message) => {
              const isEditing = editingId === message.id;
              const fromUnit = message.from === 'unit';
              return (
                <article className={`admin-message-card ${fromUnit ? 'from-unit' : ''}`} key={message.id}>
                  {isEditing ? (
                    <form className="message-form" onSubmit={saveEdit}>
                      <input
                        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                        value={draft.title}
                      />
                      <textarea
                        onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))}
                        value={draft.text}
                      />
                      <div className="target-row">
                        {UNITS.map((unit) => (
                          <button
                            className={draft.targets.includes(unit.id) ? 'selected' : ''}
                            key={unit.id}
                            onClick={() => toggleTarget(unit.id)}
                            type="button"
                          >
                            {unit.name}
                          </button>
                        ))}
                      </div>
                      <div className="target-tools">
                        <small className={`target-hint ${editingHasNoTargets ? 'warning' : ''}`}>
                          {editingHasNoTargets
                            ? 'Nenhuma unidade selecionada: selecione ao menos uma para salvar.'
                            : `${draft.targets.length}/${UNITS.length} unidade(s) selecionada(s).`}
                        </small>
                        <div className="target-actions">
                          <button
                            className="text-button"
                            disabled={draft.targets.length === UNITS.length}
                            onClick={() => setDraft((current) => ({ ...current, targets: UNITS.map((unit) => unit.id) }))}
                            type="button"
                          >
                            Selecionar todas
                          </button>
                          <button
                            className="text-button"
                            disabled={editingHasNoTargets}
                            onClick={() => setDraft((current) => ({ ...current, targets: [] }))}
                            type="button"
                          >
                            Limpar seleção
                          </button>
                        </div>
                      </div>
                      <div className="message-tools">
                        <button className="ghost" onClick={() => setEditingId(null)} type="button">
                          Cancelar
                        </button>
                        <button className="primary" disabled={editingHasNoTargets} type="submit">
                          <Check size={17} /> Salvar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="admin-message-head">
                        <div>
                          <strong>{fromUnit ? `${unitName(message.fromUnitId)} enviou: ${message.title}` : `Rosa enviou: ${message.title}`}</strong>
                          <p>{message.text}</p>
                          <small>
                            {fromUnit ? 'Mensagem avulsa recebida' : 'Recado enviado'} {relativeTime(message.createdAt)} · {fullDateTime(message.createdAt)}
                            {message.updatedAt ? ` · editado ${relativeTime(message.updatedAt)}` : ''}
                          </small>
                        </div>
                        <div className="message-tools">
                          {!fromUnit ? (
                            <button className="icon-button mini" onClick={() => startEdit(message)} title="Editar recado" type="button">
                              <Pencil size={16} />
                            </button>
                          ) : null}
                          <button
                            className="icon-button mini"
                            onClick={() => onDeleteMessage(message.id)}
                            title="Apagar recado"
                            type="button"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {!fromUnit ? (
                        <div className="status-grid">
                          {message.targets.map((unitId) => (
                            <span className={(message.seenBy || []).includes(unitId) ? 'seen' : ''} key={unitId}>
                              {unitName(unitId)} · {(message.seenBy || []).includes(unitId) ? 'visto' : 'pendente'}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(message.replies || []).filter((reply) => reply.unitId === selectedUnitId).length ? (
                        <div className="reply-list admin-replies">
                          {message.replies
                            .filter((reply) => reply.unitId === selectedUnitId)
                            .map((reply) => (
                              <p key={reply.id}>
                                <strong>{unitName(reply.unitId)} respondeu esse recado:</strong> {reply.text}
                                <small>{relativeTime(reply.createdAt)} · {fullDateTime(reply.createdAt)}</small>
                              </p>
                            ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </article>
              );
            })
          ) : (
            <p className="empty">Nenhuma mensagem desta unidade ainda.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function PasswordPanel({ onChangePassword }) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [status, setStatus] = useState('');

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    try {
      await onChangePassword(currentPassword, nextPassword);
      setCurrentPassword('');
      setNextPassword('');
      setStatus('Senha atualizada');
    } catch {
      setStatus('Não consegui atualizar a senha');
    }
  }

  return (
    <section className="admin-card password-card">
      <button className="history-toggle" onClick={() => setOpen((value) => !value)} type="button">
        <span>
          <Settings size={18} />
          <strong>Acesso da Rosa</strong>
        </span>
        <b>{open ? 'fechar' : 'abrir'}</b>
      </button>
      {open ? (
        <>
          <form className="password-form" onSubmit={submit}>
            <input
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="senha atual"
              type="password"
              value={currentPassword}
            />
            <input
              onChange={(event) => setNextPassword(event.target.value)}
              placeholder="nova senha"
              type="password"
              value={nextPassword}
            />
            <button className="ghost" type="submit">
              Alterar
            </button>
          </form>
          {status ? <small>{status}</small> : null}
        </>
      ) : null}
    </section>
  );
}

function DocumentWorkspace({ mode, onEmptyTrash, onSaveUnit, unit }) {
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [mobileView, setMobileView] = useState('list');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  const selected = useMemo(
    () => unit.documents.find((doc) => doc.id === selectedId) || unit.documents.find((doc) => !doc.deletedAt),
    [selectedId, unit.documents]
  );

  const visibleDocs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return unit.documents
      .filter((doc) => {
        if (filter === 'trash') return Boolean(doc.deletedAt);
        if (doc.deletedAt) return false;
        if (filter === 'done') return isComplete(doc);
        if (filter === 'pending') return !isComplete(doc);
        return true;
      })
      .filter((doc) => {
        if (!needle) return true;
        return [doc.title, doc.owner, doc.context, ...(doc.tasks || []).map((task) => task.text)]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      });
  }, [filter, query, unit.documents]);

  const activeCount = unit.documents.filter((doc) => !doc.deletedAt).length;
  const pendingCount = unit.documents.filter((doc) => !doc.deletedAt && !isComplete(doc)).length;
  const doneCount = unit.documents.filter((doc) => !doc.deletedAt && isComplete(doc)).length;
  const focusItems = useMemo(() => attentionItems(unit), [unit]);

  useEffect(() => {
    if (selected?.id) setSelectedId(selected.id);
  }, [selected?.id]);

  function commit(recipe, action, details = {}) {
    setHistory((current) => [unit, ...current].slice(0, 40));
    setFuture([]);
    const next = addActivity(recipe(unit), action, details);
    onSaveUnit(next);
  }

  function undo() {
    if (!history.length) return;
    const [previous, ...rest] = history;
    setFuture((current) => [unit, ...current].slice(0, 40));
    setHistory(rest);
    onSaveUnit(previous);
  }

  function redo() {
    if (!future.length) return;
    const [next, ...rest] = future;
    setHistory((current) => [unit, ...current].slice(0, 40));
    setFuture(rest);
    onSaveUnit(next);
  }

  function createDocument(payload) {
    const doc = {
      id: uid('doc'),
      title: payload.title,
      owner: payload.owner,
      context: payload.context,
      color: COLORS[unit.documents.length % COLORS.length],
      createdAt: isoNow(),
      updatedAt: isoNow(),
      tasks: payload.tasks.map((task, index) => ({
        id: uid('task'),
        text: task,
        done: false,
        note: '',
        order: index,
        priority: payload.priority || 'normal',
        dueAt: payload.dueAt || '',
        createdAt: isoNow(),
        updatedAt: isoNow()
      }))
    };
    commit(
      (current) => ({
        ...current,
        documents: [doc, ...current.documents]
      }),
      'document_created',
      { title: doc.title }
    );
    setSelectedId(doc.id);
    setMobileView('detail');
    setWizardOpen(false);
  }

  function patchDocument(documentId, patcher, action = 'document_updated') {
    commit(
      (current) => ({
        ...current,
        documents: current.documents.map((doc) => {
          if (doc.id !== documentId) return doc;
          return { ...patcher(doc), updatedAt: isoNow() };
        })
      }),
      action,
      { documentId }
    );
  }

  return (
    <>
      <section className="stats-row">
        <Stat label="ativos" value={activeCount} />
        <Stat label="pendentes" tone="warm" value={pendingCount} />
        <Stat label="finalizados" tone="good" value={doneCount} />
        <button className="icon-button mobile-only" onClick={() => setMobileView('list')} title="Lista" type="button">
          <FileText size={21} />
        </button>
        <button className="icon-button" disabled={!history.length} onClick={undo} title="Desfazer" type="button">
          <Undo2 size={21} />
        </button>
        <button className="icon-button" disabled={!future.length} onClick={redo} title="Refazer" type="button">
          <Redo2 size={21} />
        </button>
        <button className="primary" onClick={() => setWizardOpen(true)} type="button">
          <Plus size={21} /> Novo
        </button>
      </section>

      <FocusQueue
        items={focusItems}
        onSelect={(docId) => {
          setSelectedId(docId);
          setMobileView('detail');
        }}
      />

      <section className={`workspace ${mobileView === 'detail' ? 'show-detail' : 'show-list'}`}>
        <aside className="sidebar">
          <label className="searchbox">
            <Search size={20} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar documento ou alteração"
              value={query}
            />
          </label>

          <div className="filters">
            <FilterButton active={filter === 'active'} label="Ativos" onClick={() => setFilter('active')} />
            <FilterButton active={filter === 'pending'} label="Pendentes" onClick={() => setFilter('pending')} />
            <FilterButton active={filter === 'done'} label="Finalizados" onClick={() => setFilter('done')} />
            <FilterButton active={filter === 'trash'} label="Lixeira" onClick={() => setFilter('trash')} />
          </div>

          <div className="doc-list">
            {visibleDocs.length ? (
              visibleDocs.map((doc) => (
                <button
                  className={`doc-card ${selected?.id === doc.id ? 'selected' : ''}`}
                  key={doc.id}
                  onClick={() => {
                    setSelectedId(doc.id);
                    setMobileView('detail');
                  }}
                  style={{ '--accent': doc.color || '#69b578' }}
                  type="button"
                >
                  <span>
                    <strong>{doc.title}</strong>
                    <small>{doc.context || doc.owner || 'Sem contexto'}</small>
                  </span>
                  <Lightbulb className={isComplete(doc) ? 'lit' : ''} size={21} />
                  <ProgressBar value={completion(doc)} />
                </button>
              ))
            ) : (
              <p className="empty">Nada por aqui ainda.</p>
            )}
          </div>
        </aside>

        <main className="detail">
          {selected ? (
            <DocumentDetail
              doc={selected}
              mode={mode}
              onBack={() => setMobileView('list')}
              onEmptyTrash={() => setTrashOpen(true)}
              onPatch={patchDocument}
            />
          ) : (
            <section className="empty-detail">
              <FileText size={42} />
              <h2>Nenhum documento selecionado</h2>
              <button className="primary" onClick={() => setWizardOpen(true)} type="button">
                <Plus size={18} /> Criar registro
              </button>
            </section>
          )}
        </main>
      </section>

      {wizardOpen ? <NewDocumentModal onClose={() => setWizardOpen(false)} onCreate={createDocument} /> : null}
      {trashOpen ? (
        <TrashModal
          mode={mode}
          onClose={() => setTrashOpen(false)}
          onConfirm={async (password) => {
            await onEmptyTrash(unit.id, password);
            setTrashOpen(false);
          }}
          unitName={unit.name}
        />
      ) : null}
    </>
  );
}

function Stat({ label, tone = '', value }) {
  return (
    <div className={`stat ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function FocusQueue({ items, onSelect }) {
  if (!items.length) return null;
  return (
    <section className="focus-queue">
      <div className="focus-title">
        <Sparkles size={18} />
        <strong>Atenção agora</strong>
        <span>{items.length} prioridade(s)</span>
      </div>
      <div className="focus-items">
        {items.map(({ doc, task }) => (
          <button className={`focus-item ${taskDueState(task)}`} key={`${doc.id}-${task.id}`} onClick={() => onSelect(doc.id)} type="button">
            <span>
              <strong>{task.text}</strong>
              <small>{doc.title}</small>
            </span>
            <b>{PRIORITIES[task.priority || 'normal'].label}</b>
            <em>{dueLabel(task)}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function FilterButton({ active, label, onClick }) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick} type="button">
      <Filter size={17} /> {label}
    </button>
  );
}

function DocumentDetail({ doc, mode, onBack, onEmptyTrash, onPatch }) {
  const tasks = sortTasks(doc.tasks);
  const doneCount = tasks.filter((task) => task.done).length;
  const [draftTask, setDraftTask] = useState('');
  const [editingDoc, setEditingDoc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [docDraft, setDocDraft] = useState({ title: doc.title, owner: doc.owner || '', context: doc.context || '' });
  const [metaDraft, setMetaDraft] = useState({ owner: doc.owner || '', context: doc.context || '' });

  useEffect(() => {
    setDocDraft({ title: doc.title, owner: doc.owner || '', context: doc.context || '' });
    setMetaDraft({ owner: doc.owner || '', context: doc.context || '' });
    setEditingDoc(false);
  }, [doc.id, doc.title, doc.owner, doc.context]);

  useEffect(() => {
    if (editingDoc) return undefined;
    const ownerChanged = (metaDraft.owner || '') !== (doc.owner || '');
    const contextChanged = (metaDraft.context || '') !== (doc.context || '');
    if (!ownerChanged && !contextChanged) return undefined;

    const timer = setTimeout(() => {
      onPatch(doc.id, (current) => ({ ...current, owner: metaDraft.owner, context: metaDraft.context }));
    }, 420);
    return () => clearTimeout(timer);
  }, [doc.id, doc.owner, doc.context, editingDoc, metaDraft.context, metaDraft.owner, onPatch]);

  function addTask() {
    const text = draftTask.trim();
    if (!text) return;
    onPatch(doc.id, (current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          id: uid('task'),
          text,
          done: false,
          note: '',
          order: current.tasks.length,
          priority: 'normal',
          dueAt: '',
          createdAt: isoNow(),
          updatedAt: isoNow()
        }
      ]
    }));
    setDraftTask('');
  }

  function moveTask(taskId, direction) {
    const tasks = sortTasks(doc.tasks);
    const index = tasks.findIndex((task) => task.id === taskId);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tasks.length) return;
    [tasks[index], tasks[nextIndex]] = [tasks[nextIndex], tasks[index]];
    onPatch(doc.id, (current) => ({
      ...current,
      tasks: tasks.map((task, order) => ({ ...task, order }))
    }));
  }

  function updateTask(taskId, patch) {
    onPatch(doc.id, (current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...patch, updatedAt: isoNow() } : task))
    }));
  }

  function removeTask(taskId) {
    onPatch(doc.id, (current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId).map((task, order) => ({ ...task, order }))
    }));
  }

  return (
    <article className="detail-card">
      <button className="back-button mobile-only" onClick={onBack} type="button">
        <ArrowLeft size={19} /> Documentos
      </button>

      <header className="detail-head">
        <div>
          <span className="eyebrow">Documento</span>
          {editingDoc ? (
            <div className="doc-edit-grid">
              <input
                onChange={(event) => setDocDraft((draft) => ({ ...draft, title: event.target.value }))}
                value={docDraft.title}
              />
              <input
                onChange={(event) => setDocDraft((draft) => ({ ...draft, owner: event.target.value }))}
                placeholder="Responsável ou pedido por"
                value={docDraft.owner}
              />
              <input
                onChange={(event) => setDocDraft((draft) => ({ ...draft, context: event.target.value }))}
                placeholder="Contexto rápido"
                value={docDraft.context}
              />
              <button
                className="primary"
                onClick={() => {
                  onPatch(doc.id, (current) => ({ ...current, ...docDraft }));
                  setEditingDoc(false);
                }}
                type="button"
              >
                <Check size={17} /> Salvar
              </button>
            </div>
          ) : (
            <>
              <h2>{doc.title}</h2>
              <p className="meta-line">
                <Clock3 size={18} /> Atualizado {formatShortDate(doc.updatedAt)} <Check size={18} /> {completion(doc)}%
              </p>
            </>
          )}
        </div>
        <div className="detail-actions">
          <button className="icon-button" onClick={() => setEditingDoc((value) => !value)} title="Editar" type="button">
            <Pencil size={20} />
          </button>
          <span className={`lamp ${isComplete(doc) ? 'on' : ''}`}>
            <Lightbulb size={32} />
          </span>
        </div>
      </header>

      {!editingDoc ? (
        <div className="context-grid">
          <label>
            Responsável ou pedido por
            <input
              onChange={(event) => setMetaDraft((current) => ({ ...current, owner: event.target.value }))}
              value={metaDraft.owner}
            />
          </label>
          <label>
            Contexto rápido
            <input
              onChange={(event) => setMetaDraft((current) => ({ ...current, context: event.target.value }))}
              value={metaDraft.context}
            />
          </label>
        </div>
      ) : null}

      <section className="task-panel">
        <div className="section-title">
          <h3>Alterações e pendências</h3>
          <span>{doneCount}/{tasks.length}</span>
        </div>

        <div className="task-list">
          {tasks.map((task, index) => (
            <TaskRow
              index={index}
              key={task.id}
              onMove={moveTask}
              onRemove={removeTask}
              onUpdate={updateTask}
              task={task}
              total={tasks.length}
            />
          ))}
        </div>

        <form
          className="add-task"
          onSubmit={(event) => {
            event.preventDefault();
            addTask();
          }}
        >
          <ListPlus size={21} />
          <input
            onChange={(event) => setDraftTask(event.target.value)}
            placeholder="Adicionar outra alteração"
            value={draftTask}
          />
          <button className="primary square" type="submit">
            <Plus size={21} />
          </button>
        </form>
      </section>

      <section className="meeting-card">
        <div className="section-title">
          <div className="section-title-label">
            <ClipboardList size={18} />
            <h3>Cola para reunião</h3>
          </div>
          <button
            className="ghost"
            onClick={async () => {
              await navigator.clipboard?.writeText(meetingSummary(doc));
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
            type="button"
          >
            <ClipboardList size={17} /> {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p>Resumo pronto para abrir conversa, alinhar pendências e fechar próximos passos.</p>
        <div className="chips">
          {tasks.map((task) => (
            <span className={task.done ? 'done' : ''} key={task.id}>
              {task.text}
            </span>
          ))}
        </div>
        <pre className="meeting-summary">{meetingSummary(doc)}</pre>
      </section>

      {doc.deletedAt ? (
        <button className="primary full" onClick={() => onPatch(doc.id, (current) => ({ ...current, deletedAt: '' }))} type="button">
          Restaurar documento
        </button>
      ) : (
        <button className="danger full" onClick={() => onPatch(doc.id, (current) => ({ ...current, deletedAt: isoNow() }))} type="button">
          <Trash2 size={19} /> Mover para lixeira
        </button>
      )}

      <button className="ghost full" onClick={onEmptyTrash} type="button">
        Limpar lixeira da unidade
      </button>
      {mode === 'admin' ? <small className="hint">A Rosa acompanha e edita esta unidade sem precisar entrar pela senha da unidade.</small> : null}
    </article>
  );
}

function TaskRow({ index, onMove, onRemove, onUpdate, task, total }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const dueState = taskDueState(task);

  useEffect(() => setDraft(task.text), [task.text]);

  return (
    <div className={`task-row ${task.done ? 'done' : ''} due-${dueState}`}>
      <GripVertical className="drag-icon" size={21} />
      <button
        className={`check-button ${task.done ? 'checked' : ''}`}
        onClick={() => onUpdate(task.id, { done: !task.done })}
        title="Marcar"
        type="button"
      >
        {task.done ? <Check size={20} /> : <Circle size={20} />}
      </button>
      {editing ? (
        <input className="task-edit" onChange={(event) => setDraft(event.target.value)} value={draft} />
      ) : (
        <span>{task.text}</span>
      )}
      <div className="task-meta">
        <label title="Prioridade">
          <Flag size={15} />
          <select
            onInput={(event) => onUpdate(task.id, { priority: event.currentTarget.value })}
            value={task.priority || 'normal'}
          >
            {Object.entries(PRIORITIES).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label title="Prazo">
          <CalendarDays size={15} />
          <input
            aria-label="Prazo da pendência"
            onInput={(event) => onUpdate(task.id, { dueAt: event.currentTarget.value })}
            type="date"
            value={task.dueAt || ''}
          />
        </label>
        {dueState === 'late' || dueState === 'soon' ? (
          <strong className={`due-pill ${dueState}`}>
            <AlertTriangle size={14} /> {dueLabel(task)}
          </strong>
        ) : null}
      </div>
      <div className="task-actions">
        <button className="icon-button mini" disabled={index === 0} onClick={() => onMove(task.id, -1)} title="Subir" type="button">
          <ArrowUp size={16} />
        </button>
        <button
          className="icon-button mini"
          disabled={index === total - 1}
          onClick={() => onMove(task.id, 1)}
          title="Descer"
          type="button"
        >
          <ArrowDown size={16} />
        </button>
        {editing ? (
          <button
            className="icon-button mini"
            onClick={() => {
              onUpdate(task.id, { text: draft.trim() || task.text });
              setEditing(false);
            }}
            title="Salvar"
            type="button"
          >
            <Check size={16} />
          </button>
        ) : (
          <button className="icon-button mini" onClick={() => setEditing(true)} title="Editar" type="button">
            <Pencil size={16} />
          </button>
        )}
        <button className="icon-button mini" onClick={() => onRemove(task.id)} title="Excluir" type="button">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function NewDocumentModal({ onClose, onCreate }) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [context, setContext] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueAt, setDueAt] = useState('');
  const [taskDraft, setTaskDraft] = useState('');
  const [tasks, setTasks] = useState([]);

  function addTask() {
    const text = taskDraft.trim();
    if (!text) return;
    setTasks((current) => [...current, text]);
    setTaskDraft('');
  }

  function create() {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      owner: owner.trim(),
      context: context.trim(),
      priority,
      dueAt,
      tasks: tasks.length ? tasks : ['Conferir documento']
    });
  }

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="icon-button close" onClick={onClose} type="button">
          <X size={20} />
        </button>
        <span className="eyebrow">Novo registro</span>
        <h2>O que você gostaria de guardar?</h2>
        {step === 0 ? (
          <label>
            Nome do documento
            <input autoFocus onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: PTP da asa" value={title} />
          </label>
        ) : null}
        {step === 1 ? (
          <div className="modal-grid">
            <label>
              Responsável ou pedido por
              <input onChange={(event) => setOwner(event.target.value)} placeholder="Ex.: Maria, Rosa" value={owner} />
            </label>
            <label>
              Contexto rápido
              <input onChange={(event) => setContext(event.target.value)} placeholder="Ex.: reunião do PTP" value={context} />
            </label>
          </div>
        ) : null}
        {step === 2 ? (
          <div>
            <div className="modal-grid task-defaults">
              <label>
                Prioridade inicial
                <select onInput={(event) => setPriority(event.currentTarget.value)} value={priority}>
                  {Object.entries(PRIORITIES).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prazo inicial
                <input onInput={(event) => setDueAt(event.currentTarget.value)} type="date" value={dueAt} />
              </label>
            </div>
            <form
              className="add-task"
              onSubmit={(event) => {
                event.preventDefault();
                addTask();
              }}
            >
              <ListPlus size={20} />
              <input
                onChange={(event) => setTaskDraft(event.target.value)}
                placeholder="O que foi alterado ou ficou pendente?"
                value={taskDraft}
              />
              <button className="primary square" type="submit">
                <Plus size={20} />
              </button>
            </form>
            <div className="chips task-preview">
              {tasks.map((task) => (
                <span key={task}>{task}</span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)} type="button">
            Voltar
          </button>
          {step < 2 ? (
            <button className="primary" disabled={step === 0 && !title.trim()} onClick={() => setStep((value) => value + 1)} type="button">
              Continuar
            </button>
          ) : (
            <button className="primary" onClick={create} type="button">
              Criar documento
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function TrashModal({ mode, onClose, onConfirm, unitName }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await onConfirm(password);
    } catch {
      setError('Não consegui limpar a lixeira.');
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal compact" onSubmit={submit}>
        <button className="icon-button close" onClick={onClose} type="button">
          <X size={20} />
        </button>
        <span className="eyebrow">Lixeira</span>
        <h2>Limpar lixeira de {unitName}?</h2>
        {mode === 'unit' ? (
          <label>
            Confirme com a senha da unidade
            <input autoFocus onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
        ) : null}
        {error ? <p className="error-line">{error}</p> : null}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="danger" type="submit">
            Limpar
          </button>
        </div>
      </form>
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <span className="progress">
      <i style={{ width: `${value}%` }} />
    </span>
  );
}

createRoot(document.getElementById('root')).render(<App />);
