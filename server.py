"""Optional Crew SOS demo backend. Real notifications are disabled by default."""
import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, abort, jsonify, request
from twilio.rest import Client
from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import VoiceResponse

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8192
DB = os.getenv('SOS_DATABASE', 'incidents.sqlite3')
TOKEN = os.getenv('SOS_ACCESS_TOKEN', '')
ORIGIN = os.getenv('FRONTEND_ORIGIN', 'http://localhost:8000')
LIVE = os.getenv('ENABLE_REAL_ALERTS', 'false').lower() == 'true'
PUBLIC = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
SUPPORT = os.getenv('MISSION_SUPPORT_NUMBER', '')
TWILIO_FROM = os.getenv('TWILIO_FROM_NUMBER', '')
SID = os.getenv('TWILIO_ACCOUNT_SID', '')
SECRET = os.getenv('TWILIO_AUTH_TOKEN', '')


def connect():
    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    return connection


with connect() as connection:
    connection.execute('''CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, sms_sid TEXT,
        call_sid TEXT, sms TEXT NOT NULL, call TEXT NOT NULL,
        acknowledged_at TEXT, simulated INTEGER NOT NULL
    )''')


def authorized(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        supplied = request.headers.get('Authorization', '')
        if not TOKEN or not secrets.compare_digest(supplied, f'Bearer {TOKEN}'):
            abort(401)
        return fn(*args, **kwargs)
    return wrapped


@app.after_request
def cors(response):
    if request.headers.get('Origin') == ORIGIN:
        response.headers['Access-Control-Allow-Origin'] = ORIGIN
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Vary'] = 'Origin'
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.before_request
def options():
    if request.method == 'OPTIONS':
        return '', 204


def result(row):
    return {key: (bool(row[key]) if key == 'simulated' else row[key])
            for key in ['sms', 'call', 'acknowledged_at', 'simulated']}


def get_row(incident_id):
    with connect() as connection:
        row = connection.execute('SELECT * FROM incidents WHERE id=?', (incident_id,)).fetchone()
    if not row:
        abort(404)
    return row


@app.post('/api/incidents')
@authorized
def create():
    data = request.get_json(silent=True) or {}
    incident_id = data.get('id', '')
    crew = data.get('crew', '')
    problem = data.get('problem', '')
    if not isinstance(incident_id, str) or not re.fullmatch(r'[a-f0-9-]{36}', incident_id):
        abort(400)
    if not isinstance(crew, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,32}', crew):
        abort(400)
    if problem not in ['Chest pain', 'Breathing difficulty', 'Injury', 'Other / unsure']:
        abort(400)
    if LIVE and not (PUBLIC.startswith('https://') and SUPPORT and TWILIO_FROM and SID and SECRET):
        return jsonify(error='Live configuration incomplete. No alert attempted.'), 503

    # Insert before external calls. Repeated requests never create duplicate alerts.
    with connect() as connection:
        cursor = connection.execute(
            'INSERT OR IGNORE INTO incidents (id,payload,sms,call,simulated) VALUES (?,?,?,?,?)',
            (incident_id, json.dumps(data), 'pending' if LIVE else 'simulated queued',
             'pending' if LIVE else 'simulated queued', 0 if LIVE else 1))
        fresh = cursor.rowcount == 1
    if not fresh or not LIVE:
        return jsonify(result(get_row(incident_id)))

    client = Client(SID, SECRET)
    # Minimize SMS information; detailed medical information remains off SMS.
    body = (f'Crew SOS prototype: support requested. Incident {incident_id}. '
            f'Reply ACK {incident_id} to acknowledge receipt. '
            'Acknowledgment does not mean the incident is resolved.')
    try:
        message = client.messages.create(to=SUPPORT, from_=TWILIO_FROM, body=body)
        with connect() as connection:
            connection.execute('UPDATE incidents SET sms_sid=?,sms=? WHERE id=?',
                               (message.sid, message.status, incident_id))
    except Exception:
        with connect() as connection:
            connection.execute('UPDATE incidents SET sms=? WHERE id=?',
                               ('submission uncertain / error; verify provider console', incident_id))

    voice = VoiceResponse()
    voice.say('Crew SOS prototype. A crew support request has been reported. '
              'Review the incident text message and reply with its acknowledgment code. '
              'This call does not establish human acknowledgment.')
    try:
        call = client.calls.create(to=SUPPORT, from_=TWILIO_FROM, twiml=str(voice))
        with connect() as connection:
            connection.execute('UPDATE incidents SET call_sid=?,call=? WHERE id=?',
                               (call.sid, call.status, incident_id))
    except Exception:
        with connect() as connection:
            connection.execute('UPDATE incidents SET call=? WHERE id=?',
                               ('submission uncertain / error; verify provider console', incident_id))
    return jsonify(result(get_row(incident_id)))


@app.get('/api/incidents/<incident_id>')
@authorized
def status(incident_id):
    row = get_row(incident_id)
    if not row['simulated']:
        client = Client(SID, SECRET)
        for channel in ['sms', 'call']:
            provider_id = row[f'{channel}_sid']
            if not provider_id:
                continue
            try:
                current = (client.messages(provider_id).fetch() if channel == 'sms'
                           else client.calls(provider_id).fetch())
                # Column name comes from the fixed local list, never user input.
                with connect() as connection:
                    connection.execute(f'UPDATE incidents SET {channel}=? WHERE id=?',
                                       (current.status, incident_id))
            except Exception:
                return jsonify(error='Provider status unavailable; previous status may be stale.'), 503
    return jsonify(result(get_row(incident_id)))


@app.post('/twilio/inbound')
def inbound():
    # Configure the Twilio number's incoming-message webhook to this exact URL.
    expected_url = PUBLIC + '/twilio/inbound'
    if not SECRET or not RequestValidator(SECRET).validate(
        expected_url, request.form, request.headers.get('X-Twilio-Signature', '')
    ):
        abort(403)
    if request.form.get('From') != SUPPORT or request.form.get('To') != TWILIO_FROM:
        abort(403)
    match = re.fullmatch(r'ACK ([a-f0-9-]{36})', request.form.get('Body', '').strip(), re.I)
    if match:
        now = datetime.now(timezone.utc).isoformat()
        with connect() as connection:
            connection.execute('''UPDATE incidents SET acknowledged_at=COALESCE(acknowledged_at,?)
                                  WHERE id=? AND simulated=0''', (now, match.group(1).lower()))
    return '<?xml version="1.0" encoding="UTF-8"?><Response/>', 200, {'Content-Type': 'text/xml'}


if __name__ == '__main__':
    if not TOKEN:
        raise SystemExit('Set SOS_ACCESS_TOKEN before starting the server.')
    app.run(host='127.0.0.1', port=5000, debug=False)
