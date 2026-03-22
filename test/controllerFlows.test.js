const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function loadModuleWithMocks(moduleRelativePath, mocks = {}) {
  const targetPath = path.resolve(projectRoot, moduleRelativePath);
  const originalEntries = new Map();

  for (const [mockRelativePath, mockExports] of Object.entries(mocks)) {
    const mockPath = path.resolve(projectRoot, mockRelativePath);
    originalEntries.set(mockPath, require.cache[mockPath]);
    require.cache[mockPath] = {
      id: mockPath,
      filename: mockPath,
      loaded: true,
      exports: mockExports,
    };
  }

  const originalTarget = require.cache[targetPath];
  delete require.cache[targetPath];

  try {
    return require(targetPath);
  } finally {
    if (originalTarget) {
      require.cache[targetPath] = originalTarget;
    } else {
      delete require.cache[targetPath];
    }

    for (const [mockPath, originalEntry] of originalEntries.entries()) {
      if (originalEntry) {
        require.cache[mockPath] = originalEntry;
      } else {
        delete require.cache[mockPath];
      }
    }
  }
}

function createResponse() {
  return {
    redirectedTo: null,
    renderedView: null,
    renderedModel: null,
    statusCode: 200,
    body: undefined,
    headers: {},
    redirect(value) {
      this.redirectedTo = value;
      return this;
    },
    render(view, model) {
      this.renderedView = view;
      this.renderedModel = model;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

function createSession(overrides = {}) {
  return {
    save(callback) {
      callback?.(null);
    },
    ...overrides,
  };
}

function createDbMock(sequence = []) {
  const calls = [];
  let index = 0;

  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (index < sequence.length) {
        const next = sequence[index];
        index += 1;
        return typeof next === 'function' ? next(sql, params, calls) : next;
      }

      return [[]];
    },
  };
}

function createBetDbMock() {
  return {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });

      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
        return [[{ COLUMN_NAME: sql.includes('leg_count') ? 'leg_count' : 'sportsbook' }]];
      }

      if (sql.includes('INSERT INTO bets')) {
        return [{ insertId: 77 }];
      }

      return [[]];
    },
  };
}

test('requireAuth redirects unauthenticated users and stores return path', () => {
  const { requireAuth } = require('../src/middleware/authMiddleware');
  const req = {
    method: 'GET',
    originalUrl: '/stats?range=30d',
    session: createSession(),
  };
  const res = createResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(req.session.returnTo, '/stats?range=30d');
  assert.deepEqual(req.session.messages, [{ type: 'error', text: 'Please log in to continue.' }]);
  assert.equal(res.redirectedTo, '/auth/login');
});

test('loginRateLimit blocks the sixth failed login attempt', () => {
  const loginRateLimitMiddleware = require('../src/middleware/loginRateLimitMiddleware');
  const buildRequest = () => ({
    headers: {},
    ip: '127.0.0.1',
    body: {
      email: 'bettor@example.com',
      rememberMe: 'on',
    },
    session: createSession(),
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    loginRateLimitMiddleware.recordFailedLogin(buildRequest());
  }

  const blockedReq = buildRequest();
  const blockedRes = createResponse();
  let nextCalled = false;

  loginRateLimitMiddleware.loginRateLimit(blockedReq, blockedRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(blockedRes.redirectedTo, '/auth/login');
  assert.equal(blockedReq.session.formData.email, 'bettor@example.com');
  assert.match(blockedReq.session.messages[0].text, /Too many login attempts/);
});

test('requestPasswordReset creates a dev reset link for known users', async () => {
  const dbMock = createDbMock([
    [[{ id: 42 }]],
  ]);
  let createdForUserId = null;

  const authController = loadModuleWithMocks('src/controllers/authController.js', {
    'src/config/db.js': dbMock,
    'src/services/passwordResetService.js': {
      createPasswordResetToken: async (userId) => {
        createdForUserId = userId;
        return { plainToken: 'reset-token-123' };
      },
      findActivePasswordReset: async () => null,
      markPasswordResetUsed: async () => {},
    },
  });

  const req = {
    body: { email: 'Bettor@example.com' },
    session: createSession(),
    protocol: 'http',
    get(header) {
      return header === 'host' ? 'localhost:3000' : '';
    },
  };
  const res = createResponse();

  await authController.requestPasswordReset(req, res);

  assert.equal(createdForUserId, 42);
  assert.equal(res.redirectedTo, '/auth/forgot-password');
  assert.deepEqual(req.session.messages, [{
    type: 'success',
    text: 'If that email is registered, a password reset link is now ready.',
  }]);
  assert.equal(
    req.session.devPasswordResetLink,
    'http://localhost:3000/auth/reset-password?token=reset-token-123'
  );
});

test('renderResetPassword rejects invalid or expired tokens', async () => {
  const authController = loadModuleWithMocks('src/controllers/authController.js', {
    'src/config/db.js': createDbMock(),
    'src/services/passwordResetService.js': {
      ensurePasswordResetTable: async () => {},
      createPasswordResetToken: async () => ({ plainToken: 'unused' }),
      findActivePasswordReset: async () => null,
      markPasswordResetUsed: async () => {},
    },
  });

  const req = {
    query: { token: 'bad-token' },
    session: createSession(),
  };
  const res = createResponse();

  await authController.renderResetPassword(req, res);

  assert.equal(res.redirectedTo, '/auth/forgot-password');
  assert.deepEqual(req.session.messages, [{
    type: 'error',
    text: 'This password reset link is invalid or has expired.',
  }]);
});

test('resetPassword updates the password and marks the token used', async () => {
  const dbMock = createDbMock();
  let usedResetId = null;

  const authController = loadModuleWithMocks('src/controllers/authController.js', {
    'src/config/db.js': dbMock,
    'src/services/passwordResetService.js': {
      ensurePasswordResetTable: async () => {},
      createPasswordResetToken: async () => ({ plainToken: 'unused' }),
      findActivePasswordReset: async () => ({
        id: 18,
        user_id: 9,
        email: 'bettor@example.com',
        name: 'Sharp Bettor',
      }),
      markPasswordResetUsed: async (resetId) => {
        usedResetId = resetId;
      },
    },
  });

  const req = {
    body: {
      token: 'fresh-reset-token',
      password: 'vault-ladder-2026',
      confirmPassword: 'vault-ladder-2026',
    },
    session: createSession(),
  };
  const res = createResponse();

  await authController.resetPassword(req, res);

  assert.equal(res.redirectedTo, '/auth/login');
  assert.equal(usedResetId, 18);
  assert.deepEqual(req.session.messages, [{
    type: 'success',
    text: 'Password updated. You can log in with your new password.',
  }]);
  assert.equal(req.session.passwordResetFormData, null);
  assert.equal(dbMock.calls.length, 1);
  assert.match(dbMock.calls[0].sql, /UPDATE users SET password_hash = \?/);
  assert.equal(dbMock.calls[0].params[1], 9);
  assert.notEqual(dbMock.calls[0].params[0], 'vault-ladder-2026');
});

test('createBet rejects incomplete multi-sport parlays before any bet insert', async () => {
  const dbMock = createBetDbMock();
  const betController = loadModuleWithMocks('src/controllers/betController.js', {
    'src/config/db.js': dbMock,
    'src/services/profileService.js': {
      dismissAddBetTips: async () => {},
    },
  });

  const req = {
    session: {
      ...createSession(),
      user: { id: 5 },
    },
    body: {
      sport: '',
      sportsbook: 'DraftKings',
      betTypeChoice: 'Parlay',
      customBetType: '',
      isMultiSport: 'on',
      legCount: '2',
      legSports: ['', 'NFL'],
      legMarkets: ['Lakers ML', 'Chiefs ML'],
      odds: '+180',
      stake: '25',
      result: 'win',
      betDate: '2026-03-22',
    },
  };
  const res = createResponse();

  await betController.createBet(req, res);

  assert.equal(res.redirectedTo, '/bets/new');
  assert.deepEqual(req.session.messages, [{
    type: 'error',
    text: 'Enter a sport for every leg on a multi-sport ticket.',
  }]);
  assert.equal(
    dbMock.calls.some((call) => call.sql.includes('INSERT INTO bets')),
    false
  );
});

test('createBet saves a valid straight bet and keeps add-another defaults', async () => {
  const dbMock = createBetDbMock();
  const betController = loadModuleWithMocks('src/controllers/betController.js', {
    'src/config/db.js': dbMock,
    'src/services/profileService.js': {
      dismissAddBetTips: async () => {},
    },
  });

  const req = {
    session: {
      ...createSession(),
      user: { id: 7 },
    },
    body: {
      sport: 'NBA',
      sportsbook: 'FanDuel',
      betTypeChoice: 'Spread',
      customBetType: '',
      market: 'Lakers -4.5',
      odds: '-110',
      stake: '22',
      result: 'win',
      betDate: '2026-03-22',
      notes: 'Late injury edge',
      submitAction: 'save-add-another',
    },
  };
  const res = createResponse();

  await betController.createBet(req, res);

  assert.equal(res.redirectedTo, '/bets/new');
  assert.deepEqual(req.session.messages, [{
    type: 'success',
    text: 'Bet added. Ready for the next one.',
  }]);
  assert.equal(req.session.formData.sport, 'NBA');
  assert.equal(req.session.formData.sportsbook, 'FanDuel');
  assert.equal(req.session.formData.betTypeChoice, 'Spread');
  assert.equal(
    dbMock.calls.some((call) => call.sql.includes('INSERT INTO bets')),
    true
  );
});

test('updateBankrollSettings rejects negative starting bankrolls', async () => {
  const pageController = loadModuleWithMocks('src/controllers/pageController.js', {
    'src/config/db.js': createDbMock(),
    'src/services/profileService.js': {
      createBankrollTransaction: async () => {},
      deleteBankrollTransaction: async () => {},
      getBankrollTransactions: async () => [],
      getOrCreateProfile: async () => ({ startingBankroll: 0, unitSize: 10 }),
      updateProfile: async () => {},
    },
  });

  const req = {
    session: createSession({ user: { id: 3 } }),
    body: {
      startingBankroll: '-5',
      unitSize: '10',
    },
  };
  const res = createResponse();

  await pageController.updateBankrollSettings(req, res);

  assert.equal(res.redirectedTo, '/settings/bankroll');
  assert.deepEqual(req.session.messages, [{
    type: 'error',
    text: 'Starting bankroll must be 0 or greater.',
  }]);
});

test('updateBankrollSettings persists valid bankroll preferences', async () => {
  let updatedPayload = null;

  const pageController = loadModuleWithMocks('src/controllers/pageController.js', {
    'src/config/db.js': createDbMock(),
    'src/services/profileService.js': {
      createBankrollTransaction: async () => {},
      deleteBankrollTransaction: async () => {},
      getBankrollTransactions: async () => [],
      getOrCreateProfile: async () => ({ startingBankroll: 0, unitSize: 10 }),
      updateProfile: async (userId, payload) => {
        updatedPayload = { userId, payload };
      },
    },
  });

  const req = {
    session: createSession({ user: { id: 11 } }),
    body: {
      startingBankroll: '250.5',
      unitSize: '12.25',
    },
  };
  const res = createResponse();

  await pageController.updateBankrollSettings(req, res);

  assert.equal(res.redirectedTo, '/settings/bankroll');
  assert.deepEqual(req.session.messages, [{
    type: 'success',
    text: 'Bankroll settings updated.',
  }]);
  assert.deepEqual(updatedPayload, {
    userId: 11,
    payload: {
      startingBankroll: '250.50',
      unitSize: '12.25',
    },
  });
});

test('createBankrollAdjustment validates transaction type, amount, and date', async () => {
  const createdTransactions = [];
  const pageController = loadModuleWithMocks('src/controllers/pageController.js', {
    'src/config/db.js': createDbMock(),
    'src/services/profileService.js': {
      createBankrollTransaction: async (...args) => {
        createdTransactions.push(args);
      },
      deleteBankrollTransaction: async () => {},
      getBankrollTransactions: async () => [],
      getOrCreateProfile: async () => ({ startingBankroll: 0, unitSize: 10 }),
      updateProfile: async () => {},
    },
  });

  const invalidTypeReq = {
    session: createSession({ user: { id: 4 } }),
    body: {
      transactionType: 'bonus',
      amount: '25',
      transactionDate: '2026-03-22',
      notes: 'bad type',
    },
  };
  const invalidTypeRes = createResponse();
  await pageController.createBankrollAdjustment(invalidTypeReq, invalidTypeRes);
  assert.equal(invalidTypeRes.redirectedTo, '/settings/bankroll');
  assert.equal(createdTransactions.length, 0);

  const invalidAmountReq = {
    session: createSession({ user: { id: 4 } }),
    body: {
      transactionType: 'deposit',
      amount: '0',
      transactionDate: '2026-03-22',
      notes: 'bad amount',
    },
  };
  const invalidAmountRes = createResponse();
  await pageController.createBankrollAdjustment(invalidAmountReq, invalidAmountRes);
  assert.equal(invalidAmountRes.redirectedTo, '/settings/bankroll');
  assert.equal(createdTransactions.length, 0);

  const invalidDateReq = {
    session: createSession({ user: { id: 4 } }),
    body: {
      transactionType: 'deposit',
      amount: '25',
      transactionDate: 'not-a-date',
      notes: 'bad date',
    },
  };
  const invalidDateRes = createResponse();
  await pageController.createBankrollAdjustment(invalidDateReq, invalidDateRes);
  assert.equal(invalidDateRes.redirectedTo, '/settings/bankroll');
  assert.equal(createdTransactions.length, 0);
});

test('createBankrollAdjustment saves valid adjustments in fixed-point format', async () => {
  let createdPayload = null;

  const pageController = loadModuleWithMocks('src/controllers/pageController.js', {
    'src/config/db.js': createDbMock(),
    'src/services/profileService.js': {
      createBankrollTransaction: async (userId, payload) => {
        createdPayload = { userId, payload };
      },
      deleteBankrollTransaction: async () => {},
      getBankrollTransactions: async () => [],
      getOrCreateProfile: async () => ({ startingBankroll: 0, unitSize: 10 }),
      updateProfile: async () => {},
    },
  });

  const req = {
    session: createSession({ user: { id: 21 } }),
    body: {
      transactionType: 'deposit',
      amount: '125.5',
      transactionDate: '2026-03-22',
      notes: 'Weekend reload',
    },
  };
  const res = createResponse();

  await pageController.createBankrollAdjustment(req, res);

  assert.equal(res.redirectedTo, '/settings/bankroll');
  assert.deepEqual(req.session.messages, [{
    type: 'success',
    text: 'Bankroll adjustment saved.',
  }]);
  assert.deepEqual(createdPayload, {
    userId: 21,
    payload: {
      transactionType: 'deposit',
      amount: '125.50',
      transactionDate: '2026-03-22',
      notes: 'Weekend reload',
    },
  });
});

test('removeBankrollAdjustment validates ids and deletes valid records', async () => {
  const deleted = [];
  const pageController = loadModuleWithMocks('src/controllers/pageController.js', {
    'src/config/db.js': createDbMock(),
    'src/services/profileService.js': {
      createBankrollTransaction: async () => {},
      deleteBankrollTransaction: async (userId, transactionId) => {
        deleted.push({ userId, transactionId });
      },
      getBankrollTransactions: async () => [],
      getOrCreateProfile: async () => ({ startingBankroll: 0, unitSize: 10 }),
      updateProfile: async () => {},
    },
  });

  const invalidReq = {
    session: createSession({ user: { id: 8 } }),
    params: { id: 'abc' },
  };
  const invalidRes = createResponse();
  await pageController.removeBankrollAdjustment(invalidReq, invalidRes);
  assert.equal(invalidRes.redirectedTo, '/settings/bankroll');
  assert.deepEqual(invalidReq.session.messages, [{
    type: 'error',
    text: 'Invalid bankroll adjustment.',
  }]);
  assert.equal(deleted.length, 0);

  const validReq = {
    session: createSession({ user: { id: 8 } }),
    params: { id: '14' },
  };
  const validRes = createResponse();
  await pageController.removeBankrollAdjustment(validReq, validRes);
  assert.equal(validRes.redirectedTo, '/settings/bankroll');
  assert.deepEqual(validReq.session.messages, [{
    type: 'success',
    text: 'Bankroll adjustment removed.',
  }]);
  assert.deepEqual(deleted, [{ userId: 8, transactionId: 14 }]);
});

test('exportHistoryCsv returns a filtered bet ledger as downloadable csv', async () => {
  const dbMock = {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });

      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
        return [[{ COLUMN_NAME: sql.includes('leg_count') ? 'leg_count' : 'sportsbook' }]];
      }

      if (sql.includes('SELECT * FROM bets WHERE user_id = ?')) {
        return [[{
          id: 91,
          bet_date: '2026-03-22',
          sport: 'NBA',
          sportsbook: 'FanDuel',
          bet_type: 'Spread',
          leg_count: null,
          market: 'Lakers -4.5',
          odds: -110,
          stake: 22,
          result: 'win',
          profit_loss: 20,
          notes: 'Late swap, "A" grade',
          created_at: '2026-03-22T18:00:00Z',
        }]];
      }

      if (sql.includes('SELECT bet_legs.bet_id')) {
        return [[]];
      }

      return [[]];
    },
  };

  const betController = loadModuleWithMocks('src/controllers/betController.js', {
    'src/config/db.js': dbMock,
    'src/services/profileService.js': {
      dismissAddBetTips: async () => {},
    },
  });

  const req = {
    session: createSession({ user: { id: 7 } }),
    query: {
      sport: 'NBA',
      sort: 'date_desc',
    },
  };
  const res = createResponse();

  await betController.exportHistoryCsv(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.match(res.headers['Content-Disposition'], /bet-history-export\.csv/);
  assert.match(res.body, /Bet Date,Sport,Sportsbook,Bet Type/);
  assert.match(res.body, /2026-03-22,NBA,FanDuel,Spread/);
  assert.match(res.body, /"Late swap, ""A"" grade"/);
});

test('exportBankrollTransactionsCsv returns bankroll adjustments as downloadable csv', async () => {
  const pageController = loadModuleWithMocks('src/controllers/pageController.js', {
    'src/config/db.js': createDbMock(),
    'src/services/profileService.js': {
      createBankrollTransaction: async () => {},
      deleteBankrollTransaction: async () => {},
      getBankrollTransactions: async () => [
        {
          id: 3,
          transactionType: 'deposit',
          amount: 100.5,
          transactionDate: '2026-03-22',
          notes: 'Initial bankroll',
          createdAt: '2026-03-22T19:30:00Z',
        },
      ],
      getOrCreateProfile: async () => ({ startingBankroll: 0, unitSize: 10 }),
      updateProfile: async () => {},
    },
  });

  const req = {
    session: createSession({ user: { id: 5 } }),
  };
  const res = createResponse();

  await pageController.exportBankrollTransactionsCsv(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.match(res.headers['Content-Disposition'], /bankroll-adjustments-export\.csv/);
  assert.match(res.body, /Transaction Date,Type,Amount,Notes,Created At/);
  assert.match(res.body, /2026-03-22,deposit,100\.50,Initial bankroll/);
});

test('importBets rejects empty csv payloads', async () => {
  const betController = loadModuleWithMocks('src/controllers/betController.js', {
    'src/config/db.js': createDbMock(),
    'src/services/profileService.js': {
      dismissAddBetTips: async () => {},
    },
  });

  const req = {
    session: createSession({ user: { id: 4 } }),
    body: { csvText: '' },
  };
  const res = createResponse();

  await betController.importBets(req, res);

  assert.equal(res.redirectedTo, '/bets/import');
  assert.deepEqual(req.session.messages, [{
    type: 'error',
    text: 'Choose a CSV file or paste CSV text to import.',
  }]);
});

test('importBets inserts parsed rows and redirects to history on success', async () => {
  const dbMock = createDbMock();
  const betController = loadModuleWithMocks('src/controllers/betController.js', {
    'src/config/db.js': dbMock,
    'src/services/profileService.js': {
      dismissAddBetTips: async () => {},
    },
  });

  const req = {
    session: createSession({ user: { id: 12 } }),
    body: {
      csvText: 'Bet Date,Sport,Sportsbook,Bet Type,Market,Odds,Stake,Result,Notes\n2026-03-22,NBA,FanDuel,Spread,Lakers -4.5,-110,22,win,Late edge',
    },
  };
  const res = createResponse();

  await betController.importBets(req, res);

  assert.equal(res.redirectedTo, '/bets/history');
  assert.deepEqual(req.session.messages, [{
    type: 'success',
    text: '1 bet imported successfully.',
  }]);
  assert.equal(
    dbMock.calls.some((call) => call.sql.includes('INSERT INTO bets')),
    true
  );
});
