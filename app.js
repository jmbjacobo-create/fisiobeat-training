const DB_KEY = 'fisiobeat_training_admin_v1';
const CLIENT_CACHE_KEY = 'fisiobeat_training_client_cache_v1';
const BLOCKS = [
  { key: 'warmup', label: 'Calentamiento' },
  { key: 'strength', label: 'Fuerza' },
  { key: 'wod', label: 'WOD / Funcional' }
];
const CATEGORIES = ['Calentamiento', 'Fuerza', 'WOD', 'Movilidad', 'Halterofilia', 'Core', 'Cardio', 'Rehabilitación'];

const $app = document.getElementById('app');
let state = loadState();
let currentTab = 'dashboard';
let selectedClientId = state.clients[0]?.id || '';
let selectedWorkoutDate = todayKey();
let editingWorkout = null;
let toastTimer = null;
let clientPayload = null;
let clientFeedback = {};

function id(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function todayKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadState() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn('Could not load state', error);
  }
  return normalizeState(seedState());
}

function seedState() {
  return {
    clients: [],
    exercises: [
      { id: id('ex'), name: 'Sentadilla trasera', category: 'Fuerza', description: 'Controla la bajada, rodillas alineadas, tronco sólido. Ajusta la carga según RPE.', youtubeUrl: '' },
      { id: id('ex'), name: 'Peso muerto', category: 'Fuerza', description: 'Barra cerca del cuerpo, espalda neutra, empuja el suelo y bloquea cadera arriba.', youtubeUrl: '' },
      { id: id('ex'), name: 'Snatch', category: 'Halterofilia', description: 'Técnica antes que carga. Extensión completa, recepción estable y bloqueo activo.', youtubeUrl: '' },
      { id: id('ex'), name: 'Zancada caminando', category: 'Fuerza', description: 'Paso largo, control de rodilla, tronco estable. Alterna piernas.', youtubeUrl: '' },
      { id: id('ex'), name: 'Burpee', category: 'WOD', description: 'Movimiento fluido. Baja al suelo, sube con ritmo y termina con salto o extensión.', youtubeUrl: '' },
      { id: id('ex'), name: 'Movilidad de cadera', category: 'Movilidad', description: 'Trabajo suave y progresivo. No forzar dolor articular.', youtubeUrl: '' }
    ],
    workouts: [],
    templates: []
  };
}

function normalizeState(input) {
  return {
    clients: Array.isArray(input.clients) ? input.clients : [],
    exercises: Array.isArray(input.exercises) ? input.exercises : [],
    workouts: Array.isArray(input.workouts) ? input.workouts : [],
    templates: Array.isArray(input.templates) ? input.templates : []
  };
}

function saveState() {
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

function toast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = message;
  document.body.appendChild(div);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => div.remove(), 3200);
}

function copyText(text, label = 'Copiado') {
  navigator.clipboard?.writeText(text).then(() => toast(label)).catch(() => {
    prompt('Copia este texto:', text);
  });
}

function setHash(hash) {
  if (location.hash !== hash) location.hash = hash;
}

function parseYouTubeId(url = '') {
  const value = String(url).trim();
  if (!value) return '';
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
    /[?&]v=([a-zA-Z0-9_-]{6,})/
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function youtubeCard(url, title) {
  const vid = parseYouTubeId(url);
  if (!vid) return '';
  const safeUrl = escapeHtml(url);
  const safeTitle = escapeHtml(title || 'Ver vídeo');
  return `
    <a class="youtube-card" href="${safeUrl}" target="_blank" rel="noreferrer">
      <img src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" alt="Miniatura YouTube" loading="lazy">
      <div><strong>${safeTitle}</strong><br><span>Abrir vídeo en YouTube</span></div>
    </a>`;
}

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function emptyBlock() {
  return { notes: '', items: [] };
}

function emptyWorkout(clientId = selectedClientId, date = selectedWorkoutDate) {
  return {
    id: id('wo'),
    clientId,
    date,
    blocks: {
      warmup: emptyBlock(),
      strength: emptyBlock(),
      wod: emptyBlock()
    }
  };
}

function getWorkout(clientId, date) {
  return state.workouts.find(w => w.clientId === clientId && w.date === date);
}

function upsertWorkout(workout) {
  const idx = state.workouts.findIndex(w => w.clientId === workout.clientId && w.date === workout.date);
  if (idx >= 0) state.workouts[idx] = workout;
  else state.workouts.push(workout);
  saveState();
}

function render() {
  if (location.hash.startsWith('#plan=')) return renderClientGate();
  renderAdmin();
}

window.addEventListener('hashchange', render);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
render();

function renderAdmin() {
  $app.innerHTML = `
    <div class="app-shell">
      <div class="topbar">
        <div class="brand-row">
          <div class="brand">
            <img src="logo.png" alt="FisioBeat logo">
            <div class="brand-title"><strong>FISIOBEAT</strong><span>Training Admin</span></div>
          </div>
          <button class="btn ghost" data-action="backup">Backup</button>
        </div>
      </div>
      <div class="grid">
        <aside class="sidebar">
          <h2>Panel</h2>
          ${navButton('dashboard', 'Resumen', String(state.clients.length))}
          ${navButton('clients', 'Clientes', String(state.clients.length))}
          ${navButton('planner', 'Planificar', String(state.workouts.length))}
          ${navButton('exercises', 'Biblioteca', String(state.exercises.length))}
          ${navButton('templates', 'Plantillas', String(state.templates.length))}
          ${navButton('deploy', 'Publicar gratis', 'GitHub')}
        </aside>
        <main class="main" id="main"></main>
      </div>
    </div>`;
  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    renderAdmin();
  }));
  document.querySelector('[data-action="backup"]')?.addEventListener('click', showBackupModal);
  const main = document.getElementById('main');
  if (currentTab === 'dashboard') renderDashboard(main);
  if (currentTab === 'clients') renderClients(main);
  if (currentTab === 'planner') renderPlanner(main);
  if (currentTab === 'exercises') renderExercises(main);
  if (currentTab === 'templates') renderTemplates(main);
  if (currentTab === 'deploy') renderDeploy(main);
}

function navButton(tab, label, meta) {
  return `<button class="nav-btn ${currentTab === tab ? 'active' : ''}" data-tab="${tab}"><span>${label}</span><small>${meta}</small></button>`;
}

function renderDashboard(main) {
  const todayCount = state.workouts.filter(w => w.date === todayKey()).length;
  const tomorrowCount = state.workouts.filter(w => w.date === todayKey(1)).length;
  main.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h1>FisioBeat Training</h1>
          <p>App privada para entregar entrenamientos diarios con enlace + PIN.</p>
        </div>
        <button class="btn primary" data-go="clients">Crear cliente</button>
      </div>
      <div class="form-grid three">
        ${statCard('Clientes', state.clients.length, 'Enlaces privados')}
        ${statCard('Entrenos hoy', todayCount, 'Visibles para cliente')}
        ${statCard('Mañana', tomorrowCount, 'Ya programados')}
      </div>
    </section>
    <section class="card">
      <div class="card-header"><div><h2>Flujo recomendado</h2><p>La app no usa servidores ni pagos: tus datos se guardan en este navegador y cada cliente recibe un enlace cifrado.</p></div></div>
      <div class="list">
        <div class="item"><div><div class="item-title">1. Crea cliente</div><div class="item-meta">Nombre + PIN de 4 cifras.</div></div><span class="badge orange">Privado</span></div>
        <div class="item"><div><div class="item-title">2. Crea entrenamientos</div><div class="item-meta">Calentamiento, Fuerza y WOD por fecha.</div></div><span class="badge">Hoy + ayer</span></div>
        <div class="item"><div><div class="item-title">3. Genera enlace</div><div class="item-meta">Se cifra con el PIN. El cliente solo ve hoy y ayer.</div></div><span class="badge green">Gratis</span></div>
      </div>
    </section>`;
  main.querySelector('[data-go="clients"]').addEventListener('click', () => { currentTab = 'clients'; renderAdmin(); });
}

function statCard(title, value, subtitle) {
  return `<div class="training-block"><div class="muted">${escapeHtml(title)}</div><h2 style="font-size:38px;margin:6px 0 0">${escapeHtml(value)}</h2><p class="muted">${escapeHtml(subtitle)}</p></div>`;
}

function renderClients(main) {
  main.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div><h2>Clientes</h2><p>Cada cliente tiene su PIN y su enlace cifrado.</p></div>
        <button class="btn primary" data-action="new-client">Nuevo cliente</button>
      </div>
      <div class="list">
        ${state.clients.length ? state.clients.map(clientItem).join('') : '<div class="empty">Aún no tienes clientes. Crea el primero para generar su enlace.</div>'}
      </div>
    </section>`;
  main.querySelector('[data-action="new-client"]').addEventListener('click', () => showClientModal());
  main.querySelectorAll('[data-edit-client]').forEach(btn => btn.addEventListener('click', () => showClientModal(btn.dataset.editClient)));
  main.querySelectorAll('[data-delete-client]').forEach(btn => btn.addEventListener('click', () => deleteClient(btn.dataset.deleteClient)));
  main.querySelectorAll('[data-plan-client]').forEach(btn => btn.addEventListener('click', () => {
    selectedClientId = btn.dataset.planClient;
    currentTab = 'planner';
    renderAdmin();
  }));
  main.querySelectorAll('[data-link-client]').forEach(btn => btn.addEventListener('click', () => generateClientLink(btn.dataset.linkClient)));
}

function clientItem(c) {
  const count = state.workouts.filter(w => w.clientId === c.id).length;
  return `
    <div class="item">
      <div>
        <div class="item-title">${escapeHtml(c.name)}</div>
        <div class="item-meta">PIN: <strong>${escapeHtml(c.pin || '----')}</strong> · ${count} entrenamientos · ${escapeHtml(c.email || 'sin email')}</div>
      </div>
      <div class="btn-row">
        <button class="btn" data-plan-client="${c.id}">Planificar</button>
        <button class="btn primary" data-link-client="${c.id}">Generar enlace</button>
        <button class="btn" data-edit-client="${c.id}">Editar</button>
        <button class="btn danger" data-delete-client="${c.id}">Borrar</button>
      </div>
    </div>`;
}

function showClientModal(clientId = '') {
  const client = state.clients.find(c => c.id === clientId) || { id: '', name: '', email: '', phone: '', pin: randomPin() };
  modal(`
    <div class="modal-title"><h2>${clientId ? 'Editar cliente' : 'Nuevo cliente'}</h2><button class="btn ghost" data-close>✕</button></div>
    <div class="form-grid">
      <div class="field"><label>Nombre</label><input class="input" id="client-name" value="${escapeHtml(client.name)}" placeholder="Ej. Pepe"></div>
      <div class="field"><label>PIN</label><input class="input" id="client-pin" value="${escapeHtml(client.pin)}" maxlength="8" placeholder="1234"><span class="help">Recomendado: 4 cifras.</span></div>
      <div class="field"><label>Email opcional</label><input class="input" id="client-email" value="${escapeHtml(client.email || '')}"></div>
      <div class="field"><label>Teléfono opcional</label><input class="input" id="client-phone" value="${escapeHtml(client.phone || '')}"></div>
    </div>
    <div class="btn-row" style="margin-top:16px;justify-content:flex-end">
      <button class="btn" data-close>Cancelar</button>
      <button class="btn primary" id="save-client">Guardar</button>
    </div>`);
  document.getElementById('save-client').addEventListener('click', () => {
    const name = document.getElementById('client-name').value.trim();
    const pin = document.getElementById('client-pin').value.trim();
    if (!name) return toast('Falta el nombre del cliente');
    if (!pin) return toast('Falta el PIN');
    const data = {
      id: clientId || id('cl'),
      name,
      pin,
      email: document.getElementById('client-email').value.trim(),
      phone: document.getElementById('client-phone').value.trim(),
      createdAt: client.createdAt || new Date().toISOString()
    };
    const idx = state.clients.findIndex(c => c.id === data.id);
    if (idx >= 0) state.clients[idx] = data; else state.clients.push(data);
    selectedClientId = data.id;
    saveState();
    closeModal();
    renderAdmin();
    toast('Cliente guardado');
  });
}

function deleteClient(clientId) {
  const client = state.clients.find(c => c.id === clientId);
  if (!client) return;
  if (!confirm(`Borrar cliente ${client.name} y sus entrenamientos?`)) return;
  state.clients = state.clients.filter(c => c.id !== clientId);
  state.workouts = state.workouts.filter(w => w.clientId !== clientId);
  if (selectedClientId === clientId) selectedClientId = state.clients[0]?.id || '';
  saveState();
  renderAdmin();
  toast('Cliente borrado');
}

function renderPlanner(main) {
  if (!state.clients.length) {
    main.innerHTML = `<section class="card"><div class="empty">Primero crea un cliente.</div></section>`;
    return;
  }
  if (!selectedClientId) selectedClientId = state.clients[0].id;
  const workout = getWorkout(selectedClientId, selectedWorkoutDate) || emptyWorkout(selectedClientId, selectedWorkoutDate);
  editingWorkout = JSON.parse(JSON.stringify(workout));
  main.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div><h2>Planificador</h2><p>Crea la planificación diaria. El cliente solo verá hoy y ayer cuando abra su enlace.</p></div>
        <div class="btn-row">
          <button class="btn" id="copy-day">Duplicar día</button>
          <button class="btn" id="save-template">Guardar plantilla</button>
          <button class="btn primary" id="save-workout">Guardar entreno</button>
        </div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Cliente</label><select class="select" id="planner-client">${state.clients.map(c => `<option value="${c.id}" ${c.id === selectedClientId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Fecha</label><input class="input" id="planner-date" type="date" value="${selectedWorkoutDate}"></div>
      </div>
    </section>
    <section class="card">
      <div class="block-editor">
        ${BLOCKS.map(b => blockEditor(b, editingWorkout.blocks[b.key])).join('')}
      </div>
    </section>
    <section class="card">
      <div class="card-header"><div><h2>Plantillas</h2><p>Carga una plantilla guardada en este entrenamiento.</p></div></div>
      ${state.templates.length ? `<div class="btn-row">${state.templates.map(t => `<button class="btn" data-load-template="${t.id}">${escapeHtml(t.name)}</button>`).join('')}</div>` : '<div class="empty">Aún no hay plantillas guardadas.</div>'}
    </section>`;

  document.getElementById('planner-client').addEventListener('change', e => { selectedClientId = e.target.value; renderAdmin(); });
  document.getElementById('planner-date').addEventListener('change', e => { selectedWorkoutDate = e.target.value; renderAdmin(); });
  document.getElementById('save-workout').addEventListener('click', saveWorkoutFromUI);
  document.getElementById('copy-day').addEventListener('click', showDuplicateModal);
  document.getElementById('save-template').addEventListener('click', saveTemplateFromUI);
  main.querySelectorAll('[data-add-exercise]').forEach(btn => btn.addEventListener('click', () => addExerciseToBlock(btn.dataset.addExercise)));
  main.querySelectorAll('[data-add-custom]').forEach(btn => btn.addEventListener('click', () => addCustomToBlock(btn.dataset.addCustom)));
  main.querySelectorAll('[data-remove-item]').forEach(btn => btn.addEventListener('click', () => removeItem(btn.dataset.block, btn.dataset.removeItem)));
  main.querySelectorAll('[data-load-template]').forEach(btn => btn.addEventListener('click', () => loadTemplate(btn.dataset.loadTemplate)));
}

function blockEditor(block, data) {
  data = data || emptyBlock();
  return `
    <div class="training-block" data-block="${block.key}">
      <h3><span>${block.label}</span><span class="badge orange">${data.items.length} ejercicios</span></h3>
      <div class="field"><label>Notas del bloque</label><textarea class="textarea" data-notes="${block.key}" placeholder="Ej. 3 rondas suaves, movilidad, activación...">${escapeHtml(data.notes || '')}</textarea></div>
      <div class="exercise-row">
        <div class="field"><label>Añadir desde biblioteca</label><select class="select" data-select-ex="${block.key}">
          <option value="">Elegir ejercicio</option>
          ${state.exercises.map(ex => `<option value="${ex.id}">${escapeHtml(ex.name)} · ${escapeHtml(ex.category)}</option>`).join('')}
        </select></div>
        <button class="btn" data-add-exercise="${block.key}">Añadir ejercicio</button>
        <button class="btn" data-add-custom="${block.key}">Ejercicio rápido</button>
      </div>
      <div class="exercise-list">
        ${data.items.length ? data.items.map(item => exercisePill(block.key, item)).join('') : '<div class="empty">Sin ejercicios añadidos.</div>'}
      </div>
    </div>`;
}

function exercisePill(blockKey, item) {
  return `<div class="exercise-pill">
    <div class="exercise-pill-head">
      <div><strong>${escapeHtml(item.name)}</strong><div class="item-meta">${escapeHtml(item.category || '')}</div></div>
      <button class="btn danger" data-block="${blockKey}" data-remove-item="${item.uid || item.id}">Quitar</button>
    </div>
    ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
    ${youtubeCard(item.youtubeUrl, item.name)}
  </div>`;
}

function syncWorkoutFromUI() {
  if (!editingWorkout) editingWorkout = emptyWorkout(selectedClientId, selectedWorkoutDate);
  editingWorkout.clientId = document.getElementById('planner-client')?.value || selectedClientId;
  editingWorkout.date = document.getElementById('planner-date')?.value || selectedWorkoutDate;
  BLOCKS.forEach(b => {
    const textarea = document.querySelector(`[data-notes="${b.key}"]`);
    editingWorkout.blocks[b.key] = editingWorkout.blocks[b.key] || emptyBlock();
    editingWorkout.blocks[b.key].notes = textarea ? textarea.value : '';
  });
}

function addExerciseToBlock(blockKey) {
  syncWorkoutFromUI();
  const select = document.querySelector(`[data-select-ex="${blockKey}"]`);
  const ex = state.exercises.find(e => e.id === select.value);
  if (!ex) return toast('Elige un ejercicio');
  editingWorkout.blocks[blockKey].items.push({ ...ex, uid: id('item') });
  renderPlanner(document.getElementById('main'));
}

function addCustomToBlock(blockKey) {
  syncWorkoutFromUI();
  modal(`
    <div class="modal-title"><h2>Ejercicio rápido</h2><button class="btn ghost" data-close>✕</button></div>
    <div class="form-grid">
      <div class="field"><label>Nombre</label><input class="input" id="custom-name" placeholder="Ej. Press banca 5x5"></div>
      <div class="field"><label>Categoría</label><select class="select" id="custom-category">${CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>
    </div>
    <div class="field" style="margin-top:12px"><label>Descripción</label><textarea class="textarea" id="custom-description" placeholder="Series, repeticiones, carga, descanso..."></textarea></div>
    <div class="field" style="margin-top:12px"><label>Enlace YouTube opcional</label><input class="input" id="custom-youtube" placeholder="https://youtube.com/..."></div>
    <div class="btn-row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="save-custom">Añadir</button></div>`);
  document.getElementById('save-custom').addEventListener('click', () => {
    const name = document.getElementById('custom-name').value.trim();
    if (!name) return toast('Falta el nombre');
    editingWorkout.blocks[blockKey].items.push({
      id: id('custom'), uid: id('item'), name,
      category: document.getElementById('custom-category').value,
      description: document.getElementById('custom-description').value.trim(),
      youtubeUrl: document.getElementById('custom-youtube').value.trim()
    });
    closeModal();
    renderPlanner(document.getElementById('main'));
  });
}

function removeItem(blockKey, itemUid) {
  syncWorkoutFromUI();
  editingWorkout.blocks[blockKey].items = editingWorkout.blocks[blockKey].items.filter(item => (item.uid || item.id) !== itemUid);
  renderPlanner(document.getElementById('main'));
}

function saveWorkoutFromUI() {
  syncWorkoutFromUI();
  selectedClientId = editingWorkout.clientId;
  selectedWorkoutDate = editingWorkout.date;
  upsertWorkout(editingWorkout);
  renderAdmin();
  toast('Entrenamiento guardado');
}

function showDuplicateModal() {
  syncWorkoutFromUI();
  modal(`
    <div class="modal-title"><h2>Duplicar entrenamiento</h2><button class="btn ghost" data-close>✕</button></div>
    <div class="field"><label>Duplicar este entrenamiento al día</label><input class="input" id="duplicate-date" type="date" value="${todayKey(1)}"></div>
    <div class="btn-row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="do-duplicate">Duplicar</button></div>`);
  document.getElementById('do-duplicate').addEventListener('click', () => {
    const newDate = document.getElementById('duplicate-date').value;
    if (!newDate) return toast('Elige fecha');
    const clone = JSON.parse(JSON.stringify(editingWorkout));
    clone.id = id('wo');
    clone.date = newDate;
    upsertWorkout(clone);
    selectedWorkoutDate = newDate;
    closeModal();
    renderAdmin();
    toast('Día duplicado');
  });
}

function saveTemplateFromUI() {
  syncWorkoutFromUI();
  modal(`
    <div class="modal-title"><h2>Guardar plantilla</h2><button class="btn ghost" data-close>✕</button></div>
    <div class="field"><label>Nombre de plantilla</label><input class="input" id="template-name" placeholder="Ej. Pierna fuerza + metcon"></div>
    <div class="btn-row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="do-template">Guardar</button></div>`);
  document.getElementById('do-template').addEventListener('click', () => {
    const name = document.getElementById('template-name').value.trim();
    if (!name) return toast('Falta el nombre');
    state.templates.push({ id: id('tpl'), name, blocks: editingWorkout.blocks, createdAt: new Date().toISOString() });
    saveState();
    closeModal();
    renderAdmin();
    toast('Plantilla guardada');
  });
}

function loadTemplate(templateId) {
  const tpl = state.templates.find(t => t.id === templateId);
  if (!tpl) return;
  syncWorkoutFromUI();
  editingWorkout.blocks = JSON.parse(JSON.stringify(tpl.blocks));
  renderPlanner(document.getElementById('main'));
  toast('Plantilla cargada');
}

function renderExercises(main) {
  main.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div><h2>Biblioteca de ejercicios</h2><p>Guarda tus ejercicios principales con explicación y vídeo de YouTube.</p></div>
        <button class="btn primary" data-action="new-exercise">Nuevo ejercicio</button>
      </div>
      <div class="list">
        ${state.exercises.length ? state.exercises.map(exerciseItem).join('') : '<div class="empty">Crea ejercicios reutilizables.</div>'}
      </div>
    </section>`;
  main.querySelector('[data-action="new-exercise"]').addEventListener('click', () => showExerciseModal());
  main.querySelectorAll('[data-edit-ex]').forEach(btn => btn.addEventListener('click', () => showExerciseModal(btn.dataset.editEx)));
  main.querySelectorAll('[data-delete-ex]').forEach(btn => btn.addEventListener('click', () => deleteExercise(btn.dataset.deleteEx)));
}

function exerciseItem(ex) {
  return `<div class="item">
    <div>
      <div class="item-title">${escapeHtml(ex.name)}</div>
      <div class="item-meta">${escapeHtml(ex.category)}${ex.youtubeUrl ? ' · con vídeo' : ''}</div>
      ${ex.description ? `<div class="item-meta">${escapeHtml(ex.description).slice(0, 120)}${ex.description.length > 120 ? '...' : ''}</div>` : ''}
    </div>
    <div class="btn-row">
      <button class="btn" data-edit-ex="${ex.id}">Editar</button>
      <button class="btn danger" data-delete-ex="${ex.id}">Borrar</button>
    </div>
  </div>`;
}

function showExerciseModal(exId = '') {
  const ex = state.exercises.find(e => e.id === exId) || { name: '', category: 'Fuerza', description: '', youtubeUrl: '' };
  modal(`
    <div class="modal-title"><h2>${exId ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2><button class="btn ghost" data-close>✕</button></div>
    <div class="form-grid">
      <div class="field"><label>Nombre</label><input class="input" id="ex-name" value="${escapeHtml(ex.name)}" placeholder="Ej. Sentadilla"></div>
      <div class="field"><label>Categoría</label><select class="select" id="ex-category">${CATEGORIES.map(c => `<option ${c === ex.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    </div>
    <div class="field" style="margin-top:12px"><label>Descripción / instrucciones</label><textarea class="textarea" id="ex-description" placeholder="Series, técnica, puntos clave...">${escapeHtml(ex.description)}</textarea></div>
    <div class="field" style="margin-top:12px"><label>Enlace YouTube</label><input class="input" id="ex-youtube" value="${escapeHtml(ex.youtubeUrl)}" placeholder="https://youtube.com/..."></div>
    <div class="btn-row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="save-ex">Guardar</button></div>`);
  document.getElementById('save-ex').addEventListener('click', () => {
    const name = document.getElementById('ex-name').value.trim();
    if (!name) return toast('Falta el nombre');
    const data = {
      id: exId || id('ex'),
      name,
      category: document.getElementById('ex-category').value,
      description: document.getElementById('ex-description').value.trim(),
      youtubeUrl: document.getElementById('ex-youtube').value.trim()
    };
    const idx = state.exercises.findIndex(e => e.id === data.id);
    if (idx >= 0) state.exercises[idx] = data; else state.exercises.push(data);
    saveState();
    closeModal();
    renderAdmin();
    toast('Ejercicio guardado');
  });
}

function deleteExercise(exId) {
  if (!confirm('Borrar ejercicio de la biblioteca? No se borra de entrenamientos ya creados.')) return;
  state.exercises = state.exercises.filter(e => e.id !== exId);
  saveState();
  renderAdmin();
  toast('Ejercicio borrado');
}

function renderTemplates(main) {
  main.innerHTML = `
    <section class="card">
      <div class="card-header"><div><h2>Plantillas</h2><p>Entrenamientos o estructuras reutilizables.</p></div></div>
      <div class="list">
        ${state.templates.length ? state.templates.map(tpl => `
          <div class="item">
            <div><div class="item-title">${escapeHtml(tpl.name)}</div><div class="item-meta">${new Date(tpl.createdAt).toLocaleDateString('es-ES')}</div></div>
            <button class="btn danger" data-delete-template="${tpl.id}">Borrar</button>
          </div>`).join('') : '<div class="empty">Guarda plantillas desde el planificador.</div>'}
      </div>
    </section>`;
  main.querySelectorAll('[data-delete-template]').forEach(btn => btn.addEventListener('click', () => {
    state.templates = state.templates.filter(t => t.id !== btn.dataset.deleteTemplate);
    saveState();
    renderAdmin();
    toast('Plantilla borrada');
  }));
}

function renderDeploy(main) {
  main.innerHTML = `
    <section class="card">
      <div class="card-header"><div><h2>Publicar gratis</h2><p>Esta versión funciona en GitHub Pages, Netlify o Vercel sin backend.</p></div></div>
      <div class="list">
        <div class="item"><div><div class="item-title">1. Sube estos archivos a GitHub</div><div class="item-meta">index.html, app.js, style.css, manifest, sw.js y logo.png.</div></div><span class="badge green">Gratis</span></div>
        <div class="item"><div><div class="item-title">2. Activa GitHub Pages</div><div class="item-meta">Settings → Pages → Deploy from branch → main → /root.</div></div><span class="badge">URL pública</span></div>
        <div class="item"><div><div class="item-title">3. Entra desde tu móvil</div><div class="item-meta">Guárdala en pantalla de inicio y úsala como app.</div></div><span class="badge orange">PWA</span></div>
      </div>
    </section>
    <section class="card">
      <div class="card-header"><div><h2>Limitación de esta versión sin servidor</h2></div></div>
      <p class="muted">Los datos del panel se guardan en el navegador desde el que trabajas. Haz backups. Cuando cambies la planificación de un cliente, genera y envía un nuevo enlace cifrado. Para sincronización automática entre tus dispositivos y feedback automático del cliente habría que añadir Supabase/Firebase en una versión 2.</p>
    </section>`;
}

async function generateClientLink(clientId) {
  const client = state.clients.find(c => c.id === clientId);
  if (!client) return;
  const workouts = state.workouts
    .filter(w => w.clientId === clientId)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!workouts.length) return toast('Este cliente aún no tiene entrenamientos');
  if (!window.crypto?.subtle) return toast('Tu navegador no permite cifrado aquí. Usa Safari/Chrome con HTTPS.');
  const payload = {
    v: 1,
    clientName: client.name,
    generatedAt: new Date().toISOString(),
    workouts
  };
  try {
    const encrypted = await encryptPayload(payload, client.pin);
    const base = `${location.origin}${location.pathname}`;
    const url = `${base}#plan=${encrypted}`;
    modal(`
      <div class="modal-title"><h2>Enlace para ${escapeHtml(client.name)}</h2><button class="btn ghost" data-close>✕</button></div>
      <p class="muted">Enlace cifrado con PIN. Envía el enlace y el PIN por WhatsApp.</p>
      <div class="field"><label>PIN</label><div class="codebox">${escapeHtml(client.pin)}</div></div>
      <div class="field" style="margin-top:12px"><label>Enlace privado</label><div class="codebox" id="generated-url">${escapeHtml(url)}</div></div>
      <div class="btn-row" style="margin-top:16px"><button class="btn primary" id="copy-generated">Copiar enlace</button><button class="btn" id="open-generated">Probar enlace</button></div>`);
    document.getElementById('copy-generated').addEventListener('click', () => copyText(url, 'Enlace copiado'));
    document.getElementById('open-generated').addEventListener('click', () => window.open(url, '_blank'));
  } catch (error) {
    console.error(error);
    toast('No se pudo generar el enlace cifrado');
  }
}

async function encryptPayload(payload, pin) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
  const bundle = new Uint8Array(salt.length + iv.length + cipher.byteLength);
  bundle.set(salt, 0);
  bundle.set(iv, salt.length);
  bundle.set(new Uint8Array(cipher), salt.length + iv.length);
  return base64UrlEncode(bundle);
}

async function decryptPayload(token, pin) {
  const data = base64UrlDecode(token);
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const cipher = data.slice(28);
  const key = await deriveKey(pin, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

async function deriveKey(pin, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function base64UrlEncode(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.slice(i, i + chunk));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(str) {
  const b64 = str.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - str.length % 4) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function renderClientGate() {
  const token = decodeURIComponent(location.hash.slice('#plan='.length));
  $app.innerHTML = `
    <div class="client-shell">
      <div class="client-hero">
        <img src="logo.png" alt="FisioBeat logo">
        <h1>FisioBeat</h1>
        <p>Introduce tu PIN para ver tu entrenamiento.</p>
      </div>
      <section class="day-card">
        <div class="field"><label>PIN de acceso</label><input class="input" id="client-pin" inputmode="numeric" placeholder="1234" autofocus></div>
        <button class="btn primary block" id="unlock-plan" style="margin-top:12px">Entrar</button>
        <p class="muted" style="font-size:13px">Solo se mostrará el entrenamiento de hoy y el de ayer.</p>
      </section>
    </div>`;
  document.getElementById('unlock-plan').addEventListener('click', async () => {
    const pin = document.getElementById('client-pin').value.trim();
    if (!pin) return toast('Introduce el PIN');
    try {
      clientPayload = await decryptPayload(token, pin);
      localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify({ token, pin, at: Date.now() }));
      renderClientView();
    } catch (error) {
      console.error(error);
      toast('PIN incorrecto o enlace no válido');
    }
  });
  document.getElementById('client-pin').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('unlock-plan').click(); });
}

function renderClientView() {
  if (!clientPayload) return renderClientGate();
  const visibleDates = [todayKey(0), todayKey(-1)];
  const workouts = visibleDates
    .map(date => clientPayload.workouts.find(w => w.date === date))
    .filter(Boolean);
  $app.innerHTML = `
    <div class="client-shell">
      <div class="client-hero">
        <img src="logo.png" alt="FisioBeat logo">
        <h1>${escapeHtml(clientPayload.clientName)}</h1>
        <p>Plan de entrenamiento · ${escapeHtml(formatDate(todayKey()))}</p>
      </div>
      ${workouts.length ? workouts.map(w => dayCard(w)).join('') : `<section class="day-card"><div class="empty">No hay entrenamiento visible para hoy ni ayer.</div></section>`}
    </div>`;
  document.querySelectorAll('[data-rpe]').forEach(btn => btn.addEventListener('click', () => setClientRpe(btn.dataset.workout, btn.dataset.rpe)));
  document.querySelectorAll('[data-pain]').forEach(btn => btn.addEventListener('click', () => setClientPain(btn.dataset.workout, btn.dataset.pain)));
  document.querySelectorAll('[data-complete]').forEach(btn => btn.addEventListener('click', () => completeWorkout(btn.dataset.complete)));
  document.querySelectorAll('[data-copy-feedback]').forEach(btn => btn.addEventListener('click', () => copyFeedback(btn.dataset.copyFeedback)));
}

function dayCard(workout) {
  const dayLabel = workout.date === todayKey() ? 'HOY' : 'AYER';
  const fb = clientFeedback[workout.id] || {};
  return `<section class="day-card">
    <div class="day-title">
      <div><h2>${dayLabel}</h2><p class="muted">${escapeHtml(formatDate(workout.date))}</p></div>
      ${fb.completed ? '<span class="badge green">Completado</span>' : '<span class="badge orange">Pendiente</span>'}
    </div>
    <div class="accordion">
      ${BLOCKS.map((b, idx) => blockView(b, workout.blocks[b.key], idx === 0)).join('')}
    </div>
    <div class="feedback">
      <label class="muted">Esfuerzo percibido</label>
      <div class="segmented">
        ${['Fácil','Medio','Duro','Muy duro'].map(v => `<button class="${fb.rpe === v ? 'active' : ''}" data-workout="${workout.id}" data-rpe="${v}">${v}</button>`).join('')}
      </div>
      <label class="muted">Molestias</label>
      <div class="segmented" style="grid-template-columns:repeat(2,1fr)">
        ${['Sin dolor','Con dolor'].map(v => `<button class="${fb.pain === v ? 'active' : ''}" data-workout="${workout.id}" data-pain="${v}">${v}</button>`).join('')}
      </div>
      <div class="field"><label>Nota para Jacobo</label><textarea class="textarea" data-note="${workout.id}" placeholder="Ej. Me molestó la rodilla / usé 60 kg / no pude acabar...">${escapeHtml(fb.note || '')}</textarea></div>
      <div class="btn-row"><button class="btn primary" data-complete="${workout.id}">Marcar completado</button><button class="btn" data-copy-feedback="${workout.id}">Copiar feedback</button></div>
    </div>
  </section>`;
}

function blockView(block, data, open) {
  data = data || emptyBlock();
  const hasContent = (data.notes && data.notes.trim()) || data.items?.length;
  return `<details ${open ? 'open' : ''}>
    <summary><span>${block.label}</span><span>⌄</span></summary>
    <div class="content">
      ${hasContent ? '' : '<div class="empty">Sin contenido.</div>'}
      ${data.notes ? `<pre>${escapeHtml(data.notes)}</pre>` : ''}
      <div class="exercise-list">
        ${(data.items || []).map(item => `<div class="exercise-pill"><strong>${escapeHtml(item.name)}</strong>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}${youtubeCard(item.youtubeUrl, item.name)}</div>`).join('')}
      </div>
    </div>
  </details>`;
}

function setClientRpe(workoutId, rpe) {
  clientFeedback[workoutId] = clientFeedback[workoutId] || {};
  clientFeedback[workoutId].rpe = rpe;
  persistVisibleNotes();
  renderClientView();
}

function setClientPain(workoutId, pain) {
  clientFeedback[workoutId] = clientFeedback[workoutId] || {};
  clientFeedback[workoutId].pain = pain;
  persistVisibleNotes();
  renderClientView();
}

function persistVisibleNotes() {
  document.querySelectorAll('[data-note]').forEach(el => {
    const workoutId = el.dataset.note;
    clientFeedback[workoutId] = clientFeedback[workoutId] || {};
    clientFeedback[workoutId].note = el.value;
  });
}

function completeWorkout(workoutId) {
  persistVisibleNotes();
  clientFeedback[workoutId] = clientFeedback[workoutId] || {};
  clientFeedback[workoutId].completed = true;
  clientFeedback[workoutId].completedAt = new Date().toISOString();
  renderClientView();
  toast('Entrenamiento marcado como completado');
}

function copyFeedback(workoutId) {
  persistVisibleNotes();
  const workout = clientPayload.workouts.find(w => w.id === workoutId);
  const fb = clientFeedback[workoutId] || {};
  const text = `FisioBeat - Feedback de ${clientPayload.clientName}\nFecha: ${workout?.date || ''}\nCompletado: ${fb.completed ? 'Sí' : 'No'}\nEsfuerzo: ${fb.rpe || '-'}\nMolestias: ${fb.pain || '-'}\nNota: ${fb.note || '-'}`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => copyText(text, 'Feedback copiado'));
  } else {
    copyText(text, 'Feedback copiado');
  }
}

function modal(html) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal-card">${html}</div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.matches('[data-close]')) closeModal();
  });
}

function closeModal() {
  document.querySelector('.modal-backdrop')?.remove();
}

function showBackupModal() {
  const json = JSON.stringify(state, null, 2);
  modal(`
    <div class="modal-title"><h2>Backup</h2><button class="btn ghost" data-close>✕</button></div>
    <p class="muted">Exporta tus datos para no perder clientes, ejercicios, plantillas y entrenamientos.</p>
    <div class="btn-row"><button class="btn primary" id="export-backup">Descargar backup</button><button class="btn" id="copy-backup">Copiar JSON</button></div>
    <div class="field" style="margin-top:16px"><label>Importar backup</label><textarea class="textarea" id="import-json" placeholder="Pega aquí un backup JSON"></textarea></div>
    <button class="btn" id="import-backup" style="margin-top:10px">Importar</button>`);
  document.getElementById('export-backup').addEventListener('click', () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fisiobeat-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('copy-backup').addEventListener('click', () => copyText(json, 'Backup copiado'));
  document.getElementById('import-backup').addEventListener('click', () => {
    try {
      const next = normalizeState(JSON.parse(document.getElementById('import-json').value));
      if (!confirm('Esto reemplazará los datos actuales de este navegador. Continuar?')) return;
      state = next;
      saveState();
      closeModal();
      renderAdmin();
      toast('Backup importado');
    } catch (error) {
      toast('JSON no válido');
    }
  });
}
