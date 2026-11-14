'use strict';

// DOM helpers and local demonstration state.
const $ = id => document.getElementById(id);
const STORAGE_KEY = 'missionpulse-sos-demo-v1';
let records = [];
let incident = null;
let step = 0;
let sending = false;
let alertConfig = null;
const problems = ['Chest pain', 'Breathing difficulty', 'Injury', 'Other / unsure'];
const symptoms = ['Pain reported', 'Breathlessness reported', 'Dizziness reported', 'Nausea reported', 'Bleeding reported', 'Unable to answer'];
const metrics = [['Heart rate', 'bpm'], ['SpO₂', '%'], ['Blood pressure', 'mmHg'], ['Temperature', '°C']];
try {
  records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (!Array.isArray(records)) throw Error();
} catch {
  records = [];
  $('message').textContent = 'History could not be read. Download incident records to preserve them.';
}

function save() {
  if (!incident) return;
  const index = records.findIndex(r => r.id === incident.id);
  if (index < 0) records.push(incident);
  else records[index] = incident;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
  catch { $('message').textContent = 'Local storage unavailable. Download the incident JSON.'; }
  renderSummary();
}

function start() {
  incident = {
    id: crypto.randomUUID(), created_at: new Date().toISOString(),
    crew: $('crew').value || 'A01', problem: null, symptoms: [],
    onset: 'Unknown', severity: 'Unknown', readings: [],
    protocol: { id: DEMO_PROTOCOL.id, version: DEMO_PROTOCOL.version, status: DEMO_PROTOCOL.status },
    steps: [], alert: null
  };
  step = 0;
  alertConfig = null;
  $('incident').hidden = false;
  $('onset').value = 'Unknown'; $('severity').value = 'Unknown';
  $('alertStatus').textContent = 'No alert requested.';
  $('mode').disabled = false;
  renderChoices(); renderReadings(); renderStep(); save();
  $('incident').scrollIntoView({ behavior: 'smooth' });
}

function renderChoices() {
  for (const [id, values] of [['problems', problems], ['symptoms', symptoms]]) {
    $(id).replaceChildren();
    values.forEach(value => {
      const button = document.createElement('button');
      button.className = 'secondary'; button.textContent = value;
      const selected = id === 'problems' ? incident.problem === value : incident.symptoms.includes(value);
      button.setAttribute('aria-pressed', String(selected));
      button.onclick = () => {
        if (id === 'problems') incident.problem = value;
        else incident.symptoms = selected ? incident.symptoms.filter(s => s !== value) : [...incident.symptoms, value];
        renderChoices(); save();
      };
      $(id).append(button);
    });
  }
}

function renderReadings() {
  $('readings').replaceChildren();
  metrics.forEach(([name, unit]) => {
    const reading = incident.readings.find(r => r.name === name);
    const card = document.createElement('div'); card.className = 'reading';
    const label = document.createElement('span'); label.textContent = name;
    const value = document.createElement('strong'); value.textContent = reading ? `${reading.value} ${unit}` : 'Unavailable';
    const detail = document.createElement('small');
    detail.textContent = reading ? `SYNTHETIC · ${new Date(reading.timestamp).toLocaleString()} · Never a measured value` : 'No connected sensor or timestamp';
    card.append(label, value, detail); $('readings').append(card);
  });
}

function renderStep() {
  $('protocolMeta').textContent = `${DEMO_PROTOCOL.id} · v${DEMO_PROTOCOL.version} · Step ${Math.min(step + 1, DEMO_PROTOCOL.steps.length)} / ${DEMO_PROTOCOL.steps.length}`;
  const current = DEMO_PROTOCOL.steps[step];
  $('stepTitle').textContent = current ? current.title : 'Demonstration navigation finished';
  $('stepText').textContent = current ? current.text : 'This does not establish that the emergency is resolved. No clinical procedure was performed in this app.';
  $('complete').disabled = !current; $('skip').disabled = !current; $('back').disabled = step === 0;
  $('stepLog').replaceChildren();
  incident.steps.forEach(item => {
    const li = document.createElement('li'); li.textContent = `${item.title}: ${item.status} · ${new Date(item.timestamp).toLocaleString()}`;
    $('stepLog').append(li);
  });
}

function recordStep(status) {
  const current = DEMO_PROTOCOL.steps[step]; if (!current) return;
  incident.steps = incident.steps.filter(s => s.index !== step);
  incident.steps.push({ index: step, title: current.title, status, timestamp: new Date().toISOString() });
  step++; renderStep(); save();
}

function renderSummary() {
  if (!incident) return;
  $('summary').textContent = [
    `Incident: ${incident.id}`, `Created: ${incident.created_at}`, `Crew code: ${incident.crew}`,
    `Reported problem: ${incident.problem || 'Not selected'}`,
    `Reported symptoms: ${incident.symptoms.join(', ') || 'None selected / unknown'}`,
    `Reported onset: ${incident.onset}; severity: ${incident.severity}`,
    `Readings: ${incident.readings.length ? 'SYNTHETIC DEMO ONLY' : 'Unavailable'}`,
    `Medical protocol: NOT INSTALLED`,
    `Alert: ${incident.alert ? JSON.stringify(incident.alert) : 'Not requested'}`
  ].join('\n');
}

function showAlert() {
  const a = incident.alert;
  $('alertStatus').textContent = `${a.simulated ? 'SIMULATION · ' : ''}SMS: ${a.sms}; Call: ${a.call}; Human acknowledgment: ${a.acknowledged_at || 'NOT RECEIVED'}.`;
}

// A request never silently changes from simulation to a real transmission.
async function requestHelp() {
  if (!incident || sending) return;
  if (incident.alert) { $('message').textContent = 'Alert already requested. Use Refresh status; no duplicate transmission was made.'; return; }
  if (!incident.problem) { $('message').textContent = 'Select a problem or Other / unsure first.'; return; }
  sending = true; $('alert').disabled = true;
  try {
    if ($('mode').value === 'demo') {
      incident.alert = { simulated: true, sms: 'simulated queued', call: 'simulated queued', acknowledged_at: null };
    } else {
      const base = $('backend').value.replace(/\/$/, '');
      const token = $('token').value;
      if (!base || !token) throw Error('Enter a backend URL and access token.');
      const parsed = new URL(base);
      if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw Error('Use HTTPS for a remote backend.');
      alertConfig = { base, token };
      // Persist an uncertain state before the network call to prevent accidental retries.
      incident.alert = { simulated: false, sms: 'request status unknown', call: 'request status unknown', acknowledged_at: null };
      save();
      const response = await fetch(`${base}/api/incidents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: incident.id, crew: incident.crew, problem: incident.problem }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw Error('Backend request failed. Status is uncertain; refresh before taking further communication action.');
      incident.alert = await response.json();
    }
    $('mode').disabled = true; showAlert(); save();
  } catch (error) {
    $('message').textContent = error.message;
    if (incident.alert) { showAlert(); save(); }
  } finally { sending = false; $('alert').disabled = false; }
}

$('sos').onclick = () => { if (!incident) start(); else $('incident').scrollIntoView(); };
$('new').onclick = () => { if (!sending && confirm('Start another incident? This does not cancel or resolve the previous alert.')) start(); };
for (const id of ['crew', 'onset', 'severity']) $(id).onchange = () => { if (incident) { incident[id] = $(id).value; save(); } };
$('complete').onclick = () => recordStep('demo step complete');
$('skip').onclick = () => recordStep('unable / skipped');
$('back').onclick = () => { step = Math.max(0, step - 1); renderStep(); };
$('demoReadings').onclick = () => {
  incident.readings = metrics.map(([name, unit], index) => ({ name, unit, value: [92, 97, '118/76', 36.8][index], timestamp: new Date().toISOString(), source: 'synthetic', quality: 'not measured' }));
  renderReadings(); save();
};
$('clearReadings').onclick = () => { incident.readings = []; renderReadings(); save(); };
$('alert').onclick = requestHelp;
$('demoAck').onclick = () => {
  if (!incident?.alert?.simulated) { $('message').textContent = 'This button only changes simulated alerts.'; return; }
  incident.alert.acknowledged_at = `SIMULATED ${new Date().toISOString()}`; showAlert(); save();
};
$('refresh').onclick = async () => {
  if (!incident?.alert) return;
  if (incident.alert.simulated) { showAlert(); return; }
  if (!alertConfig) { $('message').textContent = 'Backend configuration unavailable in this page session.'; return; }
  try {
    const response = await fetch(`${alertConfig.base}/api/incidents/${encodeURIComponent(incident.id)}`, { headers: { Authorization: `Bearer ${alertConfig.token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Status unavailable. Human acknowledgment remains unconfirmed.');
    incident.alert = await response.json(); showAlert(); save();
  } catch (error) { $('message').textContent = error.message; }
};
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(incident, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `crew-sos-${incident.id}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('daily').onclick = () => {
  const today = new Date().toLocaleDateString();
  const rows = records.filter(r => new Date(r.created_at).toLocaleDateString() === today);
  $('dailyReport').textContent = `${rows.length} incident record(s) in this browser today; ${rows.filter(r => r.alert && !r.alert.simulated).length} backend alert request(s); ${rows.filter(r => r.alert?.simulated).length} simulated alert(s). This is an activity summary, not a health assessment.`;
};
$('ask').onclick = () => {
  const answers = {
    status: incident?.alert ? `Human acknowledgment: ${incident.alert.acknowledged_at || 'NOT RECEIVED'}. ${incident.alert.simulated ? 'This alert is simulated.' : 'Refresh to check backend status.'}` : 'No alert has been requested in the current incident.',
    readings: 'No sensor is integrated. Demo readings are synthetic and cannot be used for decisions.',
    procedure: 'No reviewed medical procedure has been supplied. The procedure panel contains interface demonstration steps only.',
    diagnosis: 'No. This prototype records reported information and supports workflow navigation; it cannot diagnose or prescribe treatment.'
  };
  $('answer').textContent = answers[$('question').value];
};
