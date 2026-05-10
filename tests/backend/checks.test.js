'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../index');
const db = require('../../db/config');
const jwt = require('jsonwebtoken');
const VisaCheck = require('../../model/schema/visaCheck');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

let mongoServer;

function makeToken(userId, role = 'user') {
  return jwt.sign({ userId: userId.toString(), role }, JWT_SECRET);
}

function amerToken(userId) {
  return makeToken(userId, 'amer');
}

describe('Checks API', function () {
  this.timeout(30000);

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await db(mongoServer.getUri(), 'tammat_checks_test');
  });

  after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  afterEach(async () => {
    await VisaCheck.deleteMany({});
  });

  // ---------------------------------------------------------------------------
  // VisaCheck.isFreeService static method
  // ---------------------------------------------------------------------------
  describe('VisaCheck.isFreeService()', () => {
    it('returns true for overstay-fine', () => {
      if (!VisaCheck.isFreeService('overstay-fine')) throw new Error('should be free');
    });

    it('returns true for absconding', () => {
      if (!VisaCheck.isFreeService('absconding')) throw new Error('should be free');
    });

    it('returns false for travel-ban', () => {
      if (VisaCheck.isFreeService('travel-ban')) throw new Error('should not be free');
    });

    it('returns false for nawakas', () => {
      if (VisaCheck.isFreeService('nawakas')) throw new Error('should not be free');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/checks — createCheck
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/checks', () => {
    it('creates a free check (overstay-fine) with status submitted', async () => {
      const res = await request(app)
        .post('/api/v1/checks')
        .field('serviceId', 'overstay-fine')
        .field('serviceType', 'Overstay Fine Check')
        .field('identifiers', JSON.stringify({ passportNumber: 'A1234567' }))
        .expect(201);

      const { check } = res.body.data;
      if (check.status !== 'submitted') throw new Error(`Expected submitted, got ${check.status}`);
      if (!check.isFreeService) throw new Error('Should be free service');
      if (check.amount !== 0) throw new Error('Amount should be 0');
    });

    it('creates a free check (absconding) without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/checks')
        .field('serviceId', 'absconding')
        .field('serviceType', 'Absconding Check')
        .expect(201);

      if (res.body.data.check.isFreeService !== true) throw new Error('Should be free');
    });

    it('creates a paid check (travel-ban) with status pending_payment and standard amount 20', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = makeToken(userId);

      const res = await request(app)
        .post('/api/v1/checks')
        .set('Authorization', `Bearer ${token}`)
        .field('serviceId', 'travel-ban')
        .field('serviceType', 'Travel Ban Check')
        .field('speedTier', 'standard')
        .field('identifiers', JSON.stringify({ emiratesId: '784-1234-1234567-1' }))
        .expect(201);

      const { check } = res.body.data;
      if (check.status !== 'pending_payment') throw new Error(`Expected pending_payment, got ${check.status}`);
      if (check.amount !== 20) throw new Error(`Expected 20, got ${check.amount}`);
    });

    it('creates a paid fast-track check with amount 50', async () => {
      const res = await request(app)
        .post('/api/v1/checks')
        .field('serviceId', 'nawakas')
        .field('serviceType', 'Nawakas Check')
        .field('speedTier', 'fast-track')
        .expect(201);

      const { check } = res.body.data;
      if (check.amount !== 50) throw new Error(`Expected 50, got ${check.amount}`);
      if (check.speedTier !== 'fast-track') throw new Error('Wrong speedTier');
    });

    it('links check to authenticated user', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = makeToken(userId);

      const res = await request(app)
        .post('/api/v1/checks')
        .set('Authorization', `Bearer ${token}`)
        .field('serviceId', 'overstay-fine')
        .field('serviceType', 'Overstay Fine Check')
        .expect(201);

      const { check } = res.body.data;
      if (!check.userId) throw new Error('userId should be set');
    });

    it('returns 400 when serviceId is missing', async () => {
      await request(app)
        .post('/api/v1/checks')
        .field('serviceType', 'Some Service')
        .expect(400);
    });

    it('returns 400 when serviceType is missing', async () => {
      await request(app)
        .post('/api/v1/checks')
        .field('serviceId', 'overstay-fine')
        .expect(400);
    });

    it('returns 400 when identifiers is malformed JSON', async () => {
      await request(app)
        .post('/api/v1/checks')
        .field('serviceId', 'overstay-fine')
        .field('serviceType', 'Overstay Fine Check')
        .field('identifiers', '{bad json}')
        .expect(400);
    });

    it('adds a history entry for creation', async () => {
      const res = await request(app)
        .post('/api/v1/checks')
        .field('serviceId', 'overstay-fine')
        .field('serviceType', 'Overstay Fine Check')
        .expect(201);

      const { check } = res.body.data;
      if (!check.history.length) throw new Error('history should not be empty');
      if (check.history[0].action !== 'created') throw new Error('First history action should be created');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/checks — getUserChecks
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/checks', () => {
    it('requires authentication — returns 401 without token', async () => {
      await request(app).get('/api/v1/checks').expect(401);
    });

    it("returns only the authenticated user's checks", async () => {
      const userId = new mongoose.Types.ObjectId();
      const otherId = new mongoose.Types.ObjectId();

      await VisaCheck.create([
        { serviceId: 'overstay-fine', serviceType: 'X', userId, isFreeService: true, status: 'submitted' },
        { serviceId: 'absconding', serviceType: 'Y', userId, isFreeService: true, status: 'submitted' },
        { serviceId: 'travel-ban', serviceType: 'Z', userId: otherId, isFreeService: false, status: 'pending_payment' },
      ]);

      const token = makeToken(userId);
      const res = await request(app)
        .get('/api/v1/checks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      if (res.body.results !== 2) throw new Error(`Expected 2 results, got ${res.body.results}`);
    });

    it('returns empty array when user has no checks', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = makeToken(userId);

      const res = await request(app)
        .get('/api/v1/checks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      if (res.body.results !== 0) throw new Error('Should return 0 results');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/checks/:checkId — getCheckById
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/checks/:checkId', () => {
    it('returns a check by ID (unauthenticated guest)', async () => {
      const check = await VisaCheck.create({
        serviceId: 'overstay-fine',
        serviceType: 'Overstay Fine Check',
        isFreeService: true,
        status: 'submitted',
      });

      const res = await request(app)
        .get(`/api/v1/checks/${check._id}`)
        .expect(200);

      if (res.body.data.check._id.toString() !== check._id.toString()) {
        throw new Error('Wrong check returned');
      }
    });

    it('returns 404 for non-existent check ID', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await request(app).get(`/api/v1/checks/${fakeId}`).expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/v1/checks/:checkId/status — updateCheckStatus
  // ---------------------------------------------------------------------------
  describe('PUT /api/v1/checks/:checkId/status', () => {
    it('updates status when called by an amer officer', async () => {
      const check = await VisaCheck.create({
        serviceId: 'overstay-fine',
        serviceType: 'Test',
        isFreeService: true,
        status: 'submitted',
      });

      const officerId = new mongoose.Types.ObjectId();
      const token = amerToken(officerId);

      const res = await request(app)
        .put(`/api/v1/checks/${check._id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'processing', note: 'Reviewing documents' })
        .expect(200);

      if (res.body.data.check.status !== 'processing') {
        throw new Error('Status was not updated');
      }
    });

    it('returns 400 for invalid status value', async () => {
      const check = await VisaCheck.create({
        serviceId: 'overstay-fine',
        serviceType: 'Test',
        isFreeService: true,
        status: 'submitted',
      });

      const officerId = new mongoose.Types.ObjectId();
      const token = amerToken(officerId);

      await request(app)
        .put(`/api/v1/checks/${check._id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'invalid_status' })
        .expect(400);
    });

    it('returns 401 when called without a token', async () => {
      const check = await VisaCheck.create({
        serviceId: 'overstay-fine',
        serviceType: 'Test',
        isFreeService: true,
        status: 'submitted',
      });

      await request(app)
        .put(`/api/v1/checks/${check._id}/status`)
        .send({ status: 'processing' })
        .expect(401);
    });

    it('adds a history entry when status is updated', async () => {
      const check = await VisaCheck.create({
        serviceId: 'overstay-fine',
        serviceType: 'Test',
        isFreeService: true,
        status: 'submitted',
      });

      const officerId = new mongoose.Types.ObjectId();
      const token = amerToken(officerId);

      const res = await request(app)
        .put(`/api/v1/checks/${check._id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' })
        .expect(200);

      const history = res.body.data.check.history;
      const statusEntry = history.find(h => h.action === 'status_updated');
      if (!statusEntry) throw new Error('No status_updated history entry found');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/checks/:checkId/comment — addComment
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/checks/:checkId/comment', () => {
    it('adds a comment from an authenticated user', async () => {
      const check = await VisaCheck.create({
        serviceId: 'overstay-fine',
        serviceType: 'Test',
        isFreeService: true,
        status: 'submitted',
      });

      const userId = new mongoose.Types.ObjectId();
      const token = makeToken(userId, 'amer');

      const res = await request(app)
        .post(`/api/v1/checks/${check._id}/comment`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Please provide clearer passport scan.' })
        .expect(201);

      if (res.body.data.comment.text !== 'Please provide clearer passport scan.') {
        throw new Error('Comment text mismatch');
      }
    });

    it('returns 400 when text is empty', async () => {
      const check = await VisaCheck.create({
        serviceId: 'overstay-fine',
        serviceType: 'Test',
        isFreeService: true,
        status: 'submitted',
      });

      const token = makeToken(new mongoose.Types.ObjectId());

      await request(app)
        .post(`/api/v1/checks/${check._id}/comment`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: '   ' })
        .expect(400);
    });

    it('returns 401 without authentication', async () => {
      const check = await VisaCheck.create({
        serviceId: 'overstay-fine',
        serviceType: 'Test',
        isFreeService: true,
        status: 'submitted',
      });

      await request(app)
        .post(`/api/v1/checks/${check._id}/comment`)
        .send({ text: 'Test comment' })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/checks/:checkId/request-docs — requestDocuments
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/checks/:checkId/request-docs', () => {
    it('sets status to requires_documents and stores requested doc list', async () => {
      const check = await VisaCheck.create({
        serviceId: 'travel-ban',
        serviceType: 'Travel Ban',
        isFreeService: false,
        status: 'processing',
        amount: 20,
      });

      const officerId = new mongoose.Types.ObjectId();
      const token = amerToken(officerId);

      const res = await request(app)
        .post(`/api/v1/checks/${check._id}/request-docs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          documents: [
            { label: 'Emirates ID (front)', description: 'Clear scan required' },
            { label: 'Passport bio page', description: '' },
          ]
        })
        .expect(200);

      const { check: updated } = res.body.data;
      if (updated.status !== 'requires_documents') throw new Error('Status should be requires_documents');
      if (updated.requestedDocuments.length !== 2) throw new Error('Should have 2 requested docs');
    });

    it('returns 400 when documents array is empty', async () => {
      const check = await VisaCheck.create({
        serviceId: 'travel-ban',
        serviceType: 'Travel Ban',
        isFreeService: false,
        status: 'processing',
        amount: 20,
      });

      const token = amerToken(new mongoose.Types.ObjectId());

      await request(app)
        .post(`/api/v1/checks/${check._id}/request-docs`)
        .set('Authorization', `Bearer ${token}`)
        .send({ documents: [] })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/checks/officer/all — getOfficerChecks
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/checks/officer/all', () => {
    it('returns all checks for an amer officer', async () => {
      await VisaCheck.create([
        { serviceId: 'overstay-fine', serviceType: 'A', isFreeService: true, status: 'submitted' },
        { serviceId: 'absconding', serviceType: 'B', isFreeService: true, status: 'processing' },
      ]);

      const officerId = new mongoose.Types.ObjectId();
      const token = amerToken(officerId);

      const res = await request(app)
        .get('/api/v1/checks/officer/all')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      if (res.body.results !== 2) throw new Error(`Expected 2, got ${res.body.results}`);
      if (typeof res.body.total !== 'number') throw new Error('total should be a number');
    });

    it('filters by status when query param provided', async () => {
      await VisaCheck.create([
        { serviceId: 'overstay-fine', serviceType: 'A', isFreeService: true, status: 'submitted' },
        { serviceId: 'absconding', serviceType: 'B', isFreeService: true, status: 'processing' },
        { serviceId: 'travel-ban', serviceType: 'C', isFreeService: false, status: 'processing', amount: 20 },
      ]);

      const token = amerToken(new mongoose.Types.ObjectId());

      const res = await request(app)
        .get('/api/v1/checks/officer/all?status=processing')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      if (res.body.results !== 2) throw new Error(`Expected 2 processing, got ${res.body.results}`);
    });

    it('returns 400 for invalid status filter', async () => {
      const token = amerToken(new mongoose.Types.ObjectId());

      await request(app)
        .get('/api/v1/checks/officer/all?status=unknown')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('returns 401 for regular user without amer role', async () => {
      const token = makeToken(new mongoose.Types.ObjectId(), 'user');

      await request(app)
        .get('/api/v1/checks/officer/all')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('returns 401 without token', async () => {
      await request(app).get('/api/v1/checks/officer/all').expect(401);
    });
  });
});
