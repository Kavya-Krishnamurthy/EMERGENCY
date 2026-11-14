"""Run: python3 -m unittest test_server.py (inside crew-sos). No real alerts."""
import importlib
import os
import tempfile
import unittest
from pathlib import Path


class BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        os.environ['SOS_DATABASE'] = str(Path(cls.temp.name) / 'test.sqlite3')
        os.environ['SOS_ACCESS_TOKEN'] = 'test-access-token'
        os.environ['ENABLE_REAL_ALERTS'] = 'false'
        cls.server = importlib.import_module('server')
        cls.client = cls.server.app.test_client()
        cls.auth = {'Authorization': 'Bearer test-access-token'}

    def test_auth_required(self):
        self.assertEqual(self.client.post('/api/incidents', json={}).status_code, 401)

    def test_invalid_input(self):
        self.assertEqual(self.client.post('/api/incidents', json={'id': 'bad'}, headers=self.auth).status_code, 400)

    def test_simulation_idempotency_and_status(self):
        payload = {'id': '12345678-1234-1234-1234-123456789abc', 'crew': 'A01', 'problem': 'Chest pain'}
        first = self.client.post('/api/incidents', json=payload, headers=self.auth)
        second = self.client.post('/api/incidents', json=payload, headers=self.auth)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json, second.json)
        self.assertTrue(first.json['simulated'])
        self.assertIsNone(first.json['acknowledged_at'])
        status = self.client.get('/api/incidents/' + payload['id'], headers=self.auth)
        self.assertEqual(status.json, first.json)
        with self.server.connect() as connection:
            self.assertEqual(connection.execute('SELECT count(*) FROM incidents').fetchone()[0], 1)

    def test_unsigned_ack_rejected(self):
        response = self.client.post('/twilio/inbound', data={'Body': 'ACK 12345678-1234-1234-1234-123456789abc'})
        self.assertEqual(response.status_code, 403)

    def test_cors_preflight(self):
        response = self.client.options('/api/incidents', headers={'Origin': 'http://localhost:8000'})
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://localhost:8000')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()


if __name__ == '__main__':
    unittest.main()
