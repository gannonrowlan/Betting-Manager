const pool = require('../config/db');
const {
  calculateProfitLoss,
  calculateRoi,
  calculateWinRate,
  formatDateInput,
  parseDateInput,
  summarizeBets,
} = require('../services/statsService');
const { dismissAddBetTips } = require('../services/profileService');

const STRUCTURED_BET_TYPES = new Set([
  'Spread',
  'Moneyline',
  'Total',
  'Player Prop',
  'Team Prop',
  'Parlay',
  'Same Game Parlay',
  'Teaser',
  'Round Robin',
  'Future',
]);

const LEG_COUNT_BET_TYPES = new Set([
  'Parlay',
  'Same Game Parlay',
  'Teaser',
  'Round Robin',
]);

const DEFAULT_SPORT_OPTIONS = [
  'NBA',
  'NFL',
  'NCAAB',
  'NCAAF',
  'MLB',
  'NHL',
  'UFC',
  'Boxing',
  'Soccer',
  'Tennis',
  'Golf',
  'WNBA',
];

const DEFAULT_SPORTSBOOK_OPTIONS = [
  'DraftKings',
  'FanDuel',
  'BetMGM',
  'Caesars',
  'ESPN BET',
  'Fanatics Sportsbook',
  'bet365',
  'Hard Rock Bet',
  'PrizePicks',
  'Underdog',
];

const BET_OPTION_COLUMN_MAP = {
  sport: 'sport',
  sportsbook: 'sportsbook',
  bet_type: 'bet_type',
};

const MULTI_SPORT_LABEL = 'Multi-Sport';

const MARKET_VALIDATORS = {
  Spread: /.+\s[+-]\d+(?:\.\d+)?$/,
  Moneyline: /^.{2,}$/,
  Total: /.+\s(Over|Under)\s\d+(?:\.\d+)?$/i,
  'Player Prop': /.+\s.+\s(Over|Under)\s\d+(?:\.\d+)?$/i,
  'Team Prop': /.+\s.+\s(Over|Under)\s\d+(?:\.\d+)?$/i,
};

function toCsvCell(value) {
  const safeValue = value == null ? '' : String(value);
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function formatDateForCsv(rawDate) {
  if (!rawDate) {
    return '';
  }

  return new Date(rawDate).toISOString().slice(0, 10);
}

function getTodayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureBetTableColumns() {
  const [legCountColumns] = await pool.query(
    `SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bets'
        AND COLUMN_NAME = 'leg_count'`
  );

  if (!legCountColumns.length) {
    await pool.query('ALTER TABLE bets ADD COLUMN leg_count INT NULL AFTER bet_type');
  }

  const [sportsbookColumns] = await pool.query(
    `SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bets'
        AND COLUMN_NAME = 'sportsbook'`
  );

  if (!sportsbookColumns.length) {
    await pool.query('ALTER TABLE bets ADD COLUMN sportsbook VARCHAR(120) NULL AFTER sport');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_bet_options (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      option_type ENUM('sport', 'sportsbook', 'bet_type') NOT NULL,
      option_value VARCHAR(120) NOT NULL,
      last_used_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_saved_bet_options_user_type_value (user_id, option_type, option_value),
      CONSTRAINT fk_saved_bet_options_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bet_legs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bet_id INT NOT NULL,
      sport VARCHAR(80) NULL,
      market VARCHAR(255) NOT NULL,
      leg_order INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_bet_legs_bets FOREIGN KEY (bet_id) REFERENCES bets(id) ON DELETE CASCADE
    )
  `);
}

function buildBetTypeFormData(betType = '', legCount = '') {
  if (STRUCTURED_BET_TYPES.has(betType)) {
    return {
      betTypeChoice: betType,
      customBetType: '',
      legCount: legCount || '',
    };
  }

  return {
    betTypeChoice: betType ? 'Other' : '',
    customBetType: betType || '',
    legCount: legCount || '',
  };
}

function normalizeBetTypeInput({ betTypeChoice, customBetType }) {
  if (betTypeChoice === 'Other') {
    return (customBetType || '').trim();
  }

  return (betTypeChoice || '').trim();
}

function isValidMoneylineMarket(value = '') {
  return value.length > 1 && !/[+-]\d/.test(value) && !/\b(?:over|under|ml)\b/i.test(value);
}

function normalizeOptionValue(value = '') {
  return String(value || '').trim();
}

function normalizeBooleanInput(value) {
  return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

function shouldUseLegEntries(betType = '') {
  return LEG_COUNT_BET_TYPES.has((betType || '').trim());
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value == null) {
    return [];
  }

  return [value];
}

function buildLegEntries({ legSports = [], legMarkets = [], legCount = 0, isMultiSport = false }) {
  const normalizedCount = Number.isInteger(Number(legCount)) ? Number(legCount) : 0;
  const sports = toArray(legSports);
  const markets = toArray(legMarkets);

  return Array.from({ length: normalizedCount }, (_, index) => ({
    sport: isMultiSport ? normalizeOptionValue(sports[index]) : '',
    market: normalizeOptionValue(markets[index]),
    legOrder: index + 1,
  }));
}

function summarizeLegEntries(entries = [], isMultiSport = false) {
  const summary = entries
    .filter((entry) => normalizeOptionValue(entry.market))
    .map((entry, index) => {
      const market = normalizeOptionValue(entry.market);
      const sport = normalizeOptionValue(entry.sport);

      if (isMultiSport && sport) {
        return `Leg ${index + 1}: ${sport} - ${market}`;
      }

      return `Leg ${index + 1}: ${market}`;
    })
    .join(' | ');

  return summary.slice(0, 255);
}

function hasMultipleSports(entries = []) {
  const sports = entries
    .map((entry) => normalizeOptionValue(entry.sport).toLowerCase())
    .filter(Boolean);

  return new Set(sports).size > 1;
}

function buildOptionList({ recentOptions = [], savedOptions = [], defaultOptions = [] }) {
  const seen = new Set();
  const ordered = [];

  [...recentOptions, ...savedOptions, ...defaultOptions].forEach((value) => {
    const trimmedValue = normalizeOptionValue(value);
    const normalizedKey = trimmedValue.toLowerCase();

    if (!trimmedValue || seen.has(normalizedKey)) {
      return;
    }

    seen.add(normalizedKey);
    ordered.push(trimmedValue);
  });

  return ordered;
}

async function getRecentBetOptions(userId, optionType) {
  const column = BET_OPTION_COLUMN_MAP[optionType];

  if (!column) {
    return [];
  }

  const [rows] = await pool.query(
    `SELECT ${column} AS option_value, MAX(COALESCE(updated_at, created_at)) AS last_used_at
      FROM bets
      WHERE user_id = ?
        AND ${column} IS NOT NULL
        AND ${column} <> ''
      GROUP BY ${column}
      ORDER BY last_used_at DESC, option_value ASC`,
    [userId]
  );

  return rows.map((row) => row.option_value);
}

async function getSavedBetOptions(userId, optionType) {
  const [rows] = await pool.query(
    `SELECT option_value
      FROM saved_bet_options
      WHERE user_id = ?
        AND option_type = ?
      ORDER BY
        CASE WHEN last_used_at IS NULL THEN 1 ELSE 0 END,
        last_used_at DESC,
        updated_at DESC,
        option_value ASC`,
    [userId, optionType]
  );

  return rows.map((row) => row.option_value);
}

async function getBetLegsByBetIds(userId, betIds = []) {
  if (!betIds.length) {
    return new Map();
  }

  const placeholders = betIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT bet_legs.bet_id, bet_legs.sport, bet_legs.market, bet_legs.leg_order
      FROM bet_legs
      INNER JOIN bets ON bets.id = bet_legs.bet_id
      WHERE bets.user_id = ?
        AND bet_legs.bet_id IN (${placeholders})
      ORDER BY bet_legs.bet_id ASC, bet_legs.leg_order ASC`,
    [userId, ...betIds]
  );

  return rows.reduce((map, row) => {
    if (!map.has(row.bet_id)) {
      map.set(row.bet_id, []);
    }

    map.get(row.bet_id).push({
      sport: row.sport || '',
      market: row.market,
      legOrder: row.leg_order,
    });

    return map;
  }, new Map());
}

function attachLegsToBets(bets = [], legsByBetId = new Map()) {
  return bets.map((bet) => {
    const legs = legsByBetId.get(bet.id) || [];
    return {
      ...bet,
      legs,
      isMultiSport: bet.sport === MULTI_SPORT_LABEL || hasMultipleSports(legs),
      displayMarket: legs.length ? summarizeLegEntries(legs, bet.sport === MULTI_SPORT_LABEL || hasMultipleSports(legs)) : bet.market,
    };
  });
}

async function saveBetOption(userId, optionType, optionValue) {
  const trimmedValue = normalizeOptionValue(optionValue);

  if (!trimmedValue) {
    return;
  }

  await pool.query(
    `INSERT INTO saved_bet_options (user_id, option_type, option_value, last_used_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        last_used_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`,
    [userId, optionType, trimmedValue]
  );
}

async function touchSavedBetOptionUsage(userId, optionType, optionValue) {
  const trimmedValue = normalizeOptionValue(optionValue);

  if (!trimmedValue) {
    return;
  }

  await pool.query(
    `UPDATE saved_bet_options
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND option_type = ?
        AND option_value = ?`,
    [userId, optionType, trimmedValue]
  );
}

function validateMarketForBetType(betType, market) {
  const trimmedMarket = (market || '').trim();

  if (!trimmedMarket) {
    return false;
  }

  if (betType === 'Moneyline') {
    return isValidMoneylineMarket(trimmedMarket);
  }

  const validator = MARKET_VALIDATORS[betType];
  if (!validator) {
    return true;
  }

  return validator.test(trimmedMarket);
}

async function renderAddBet(req, res) {
  await ensureBetTableColumns();
  const formData = {
    isMultiSport: false,
    legEntries: [],
    ...req.session.formData,
  };
  req.session.formData = null;
  const userId = req.session.user.id;
  const [
    recentSports,
    recentSportsbooks,
    recentBetTypes,
    savedSports,
    savedSportsbooks,
    savedBetTypes,
    recentDuplicateRows,
  ] = await Promise.all([
    getRecentBetOptions(userId, 'sport'),
    getRecentBetOptions(userId, 'sportsbook'),
    getRecentBetOptions(userId, 'bet_type'),
    getSavedBetOptions(userId, 'sport'),
    getSavedBetOptions(userId, 'sportsbook'),
    getSavedBetOptions(userId, 'bet_type'),
    pool.query(
      'SELECT * FROM bets WHERE user_id = ? ORDER BY bet_date DESC, created_at DESC LIMIT 50',
      [userId]
    ),
  ]);
  const recentBets = recentDuplicateRows[0];
  const recentLegsByBetId = await getBetLegsByBetIds(userId, recentBets.map((bet) => bet.id));
  const duplicateCandidates = attachLegsToBets(recentBets, recentLegsByBetId).map((bet) => ({
    id: bet.id,
    sport: bet.sport,
    sportsbook: bet.sportsbook || '',
    betType: bet.bet_type,
    betDate: formatDateForCsv(bet.bet_date),
    market: bet.market || '',
    displayMarket: bet.displayMarket || bet.market || '',
    isMultiSport: Boolean(bet.isMultiSport),
    legs: (bet.legs || []).map((leg) => ({
      sport: leg.sport || '',
      market: leg.market || '',
    })),
  }));

  return res.render('bets/add', {
    title: 'Add Bet',
    formData,
    defaultBetDate: getTodayDateInputValue(),
    sportOptions: buildOptionList({
      recentOptions: recentSports,
      savedOptions: savedSports,
      defaultOptions: DEFAULT_SPORT_OPTIONS,
    }),
    sportsbookOptions: buildOptionList({
      recentOptions: recentSportsbooks,
      savedOptions: savedSportsbooks,
      defaultOptions: DEFAULT_SPORTSBOOK_OPTIONS,
    }),
    betTypeOptions: buildOptionList({
      recentOptions: recentBetTypes,
      savedOptions: savedBetTypes,
      defaultOptions: Array.from(STRUCTURED_BET_TYPES),
    }),
    duplicateCandidates,
    multiSportLabel: MULTI_SPORT_LABEL,
  });
}

async function createBet(req, res) {
  const userId = req.session.user.id;
  await ensureBetTableColumns();
  const {
    sport,
    sportsbook,
    betTypeChoice,
    customBetType,
    saveSportOption,
    saveSportsbookOption,
    saveBetTypeOption,
    isMultiSport,
    legSports,
    legMarkets,
    market,
    odds,
    stake,
    result,
    betDate,
    notes,
    legCount,
    submitAction,
  } = req.body;
  const normalizedSport = normalizeOptionValue(sport);
  const normalizedSportsbook = normalizeOptionValue(sportsbook);
  const normalizedBetType = normalizeBetTypeInput({ betTypeChoice, customBetType });
  const parsedLegCount = legCount ? Number(legCount) : null;
  const normalizedIsMultiSport = normalizeBooleanInput(isMultiSport);
  const legEntries = shouldUseLegEntries(normalizedBetType)
    ? buildLegEntries({
        legSports,
        legMarkets,
        legCount: parsedLegCount,
        isMultiSport: normalizedIsMultiSport,
      })
    : [];
  const derivedMarket = shouldUseLegEntries(normalizedBetType)
    ? summarizeLegEntries(legEntries, normalizedIsMultiSport)
    : (market || '').trim();
  const formData = {
    sport: normalizedIsMultiSport ? MULTI_SPORT_LABEL : normalizedSport,
    sportsbook: normalizedSportsbook,
    betTypeChoice: (betTypeChoice || '').trim(),
    customBetType: (customBetType || '').trim(),
    saveSportOption: Boolean(saveSportOption),
    saveSportsbookOption: Boolean(saveSportsbookOption),
    saveBetTypeOption: Boolean(saveBetTypeOption),
    market: derivedMarket,
    isMultiSport: normalizedIsMultiSport,
    legEntries,
    odds: odds || '',
    stake: stake || '',
    result: result || '',
    betDate: betDate || '',
    notes: notes || '',
    legCount: legCount || '',
  };

  req.session.formData = formData;

  if ((!normalizedIsMultiSport && !normalizedSport) || !normalizedBetType || !derivedMarket || !odds || !stake || !result || !betDate) {
    req.session.messages = [{ type: 'error', text: 'Please fill out all required fields.' }];
    return res.redirect('/bets/new');
  }

  if (betTypeChoice === 'Other' && !formData.customBetType) {
    req.session.messages = [{ type: 'error', text: 'Enter a custom bet type.' }];
    return res.redirect('/bets/new');
  }

  if (LEG_COUNT_BET_TYPES.has(normalizedBetType)) {
    if (!Number.isInteger(parsedLegCount) || parsedLegCount < 2) {
      req.session.messages = [{ type: 'error', text: 'Enter a valid leg count of at least 2.' }];
      return res.redirect('/bets/new');
    }

    const hasMissingLegMarket = legEntries.some((entry) => !entry.market);
    if (hasMissingLegMarket) {
      req.session.messages = [{ type: 'error', text: 'Enter a description for every leg.' }];
      return res.redirect('/bets/new');
    }

    if (normalizedIsMultiSport) {
      const hasMissingLegSport = legEntries.some((entry) => !entry.sport);
      if (hasMissingLegSport) {
        req.session.messages = [{ type: 'error', text: 'Enter a sport for every leg on a multi-sport ticket.' }];
        return res.redirect('/bets/new');
      }
    }
  }

  if (!shouldUseLegEntries(normalizedBetType) && !validateMarketForBetType(normalizedBetType, formData.market)) {
    req.session.messages = [{ type: 'error', text: 'Enter the market using the format shown below the field.' }];
    return res.redirect('/bets/new');
  }

  const parsedOdds = Number(odds);
  const parsedStake = Number(stake);
  const profitLoss = calculateProfitLoss({ odds: parsedOdds, stake: parsedStake, result });

  try {
    const [insertResult] = await pool.query(
      `INSERT INTO bets
      (user_id, sport, sportsbook, bet_type, leg_count, market, odds, stake, result, profit_loss, bet_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        normalizedIsMultiSport ? MULTI_SPORT_LABEL : normalizedSport,
        normalizedSportsbook || null,
        normalizedBetType,
        LEG_COUNT_BET_TYPES.has(normalizedBetType) ? parsedLegCount : null,
        derivedMarket,
        parsedOdds,
        parsedStake,
        result,
        profitLoss,
        betDate,
        notes || null,
      ]
    );

    if (legEntries.length) {
      const legSql = legEntries
        .map(() => '(?, ?, ?, ?)')
        .join(', ');
      const legParams = legEntries.flatMap((entry) => [
        insertResult.insertId,
        normalizedIsMultiSport ? entry.sport : null,
        entry.market,
        entry.legOrder,
      ]);

      await pool.query(
        `INSERT INTO bet_legs (bet_id, sport, market, leg_order)
          VALUES ${legSql}`,
        legParams
      );
    }

    await Promise.all([
      touchSavedBetOptionUsage(userId, 'sport', normalizedIsMultiSport ? MULTI_SPORT_LABEL : normalizedSport),
      touchSavedBetOptionUsage(userId, 'sportsbook', normalizedSportsbook),
      touchSavedBetOptionUsage(userId, 'bet_type', normalizedBetType),
      saveSportOption ? saveBetOption(userId, 'sport', normalizedIsMultiSport ? MULTI_SPORT_LABEL : normalizedSport) : Promise.resolve(),
      saveSportsbookOption ? saveBetOption(userId, 'sportsbook', normalizedSportsbook) : Promise.resolve(),
      saveBetTypeOption ? saveBetOption(userId, 'bet_type', normalizedBetType) : Promise.resolve(),
    ]);

    if (submitAction === 'save-add-another') {
      req.session.formData = {
        sport: normalizedSport,
        sportsbook: normalizedSportsbook,
        betTypeChoice: formData.betTypeChoice,
        customBetType: formData.customBetType,
        saveSportOption: formData.saveSportOption,
        saveSportsbookOption: formData.saveSportsbookOption,
        saveBetTypeOption: formData.saveBetTypeOption,
        betDate: betDate || getTodayDateInputValue(),
        legCount: LEG_COUNT_BET_TYPES.has(normalizedBetType) ? String(parsedLegCount || '') : '',
      };
      req.session.messages = [{ type: 'success', text: 'Bet added. Ready for the next one.' }];
      return res.redirect('/bets/new');
    }

    req.session.formData = null;
    req.session.messages = [{ type: 'success', text: 'Bet added.' }];
    return res.redirect('/bets/history');
  } catch (error) {
    req.session.messages = [{ type: 'error', text: 'Unable to save bet.' }];
    return res.redirect('/bets/new');
  }
}

function buildHistoryFilters(query = {}) {
  const sport = (query.sport || '').trim();
  const sportsbook = (query.sportsbook || '').trim();
  const betType = (query.betType || '').trim();
  const result = (query.result || '').trim();
  const startDate = (query.startDate || '').trim();
  const endDate = (query.endDate || '').trim();

  return {
    sport,
    sportsbook,
    betType,
    result,
    startDate,
    endDate,
    hasActiveFilters: Boolean(sport || sportsbook || betType || result || startDate || endDate),
  };
}

async function renderHistory(req, res) {
  const userId = req.session.user.id;
  await ensureBetTableColumns();
  const filters = buildHistoryFilters(req.query);

  let historyQuery = 'SELECT * FROM bets WHERE user_id = ?';
  const queryParams = [userId];

  if (filters.sport) {
    historyQuery += ' AND sport = ?';
    queryParams.push(filters.sport);
  }

  if (filters.sportsbook) {
    historyQuery += ' AND sportsbook = ?';
    queryParams.push(filters.sportsbook);
  }

  if (filters.betType) {
    historyQuery += ' AND bet_type = ?';
    queryParams.push(filters.betType);
  }

  if (filters.result) {
    historyQuery += ' AND result = ?';
    queryParams.push(filters.result);
  }

  if (filters.startDate) {
    historyQuery += ' AND bet_date >= ?';
    queryParams.push(filters.startDate);
  }

  if (filters.endDate) {
    historyQuery += ' AND bet_date <= ?';
    queryParams.push(filters.endDate);
  }

  historyQuery += ' ORDER BY bet_date DESC, created_at DESC';

  const [bets] = await pool.query(historyQuery, queryParams);
  const legsByBetId = await getBetLegsByBetIds(userId, bets.map((bet) => bet.id));
  const betsWithLegs = attachLegsToBets(bets, legsByBetId);
  const [sports] = await pool.query(
    'SELECT DISTINCT sport FROM bets WHERE user_id = ? ORDER BY sport ASC',
    [userId]
  );
  const [sportsbooks] = await pool.query(
    'SELECT DISTINCT sportsbook FROM bets WHERE user_id = ? AND sportsbook IS NOT NULL AND sportsbook <> "" ORDER BY sportsbook ASC',
    [userId]
  );
  const [betTypes] = await pool.query(
    'SELECT DISTINCT bet_type FROM bets WHERE user_id = ? ORDER BY bet_type ASC',
    [userId]
  );

  const summary = summarizeBets(bets);

  return res.render('bets/history', {
    title: 'Bet History',
    bets: betsWithLegs,
    sports: sports.map((row) => row.sport),
    sportsbooks: sportsbooks.map((row) => row.sportsbook),
    betTypes: betTypes.map((row) => row.bet_type),
    filters,
    summary: {
      totalBets: summary.totalBets,
      totalStake: summary.totalStake.toFixed(2),
      netProfit: summary.netProfit.toFixed(2),
      winRate: calculateWinRate({ wins: summary.wins, losses: summary.losses }),
      roi: calculateRoi({ netProfit: summary.netProfit, totalStake: summary.totalStake }),
      wins: summary.wins,
      losses: summary.losses,
      pushes: summary.pushes,
      averageStake: summary.averageStake.toFixed(2),
    },
  });
}

async function renderEditBet(req, res) {
  const userId = req.session.user.id;
  const betId = req.params.id;
  await ensureBetTableColumns();

  const [bets] = await pool.query('SELECT * FROM bets WHERE id = ? AND user_id = ?', [betId, userId]);
  if (!bets.length) {
    req.session.messages = [{ type: 'error', text: 'Bet not found.' }];
    return res.redirect('/bets/history');
  }

  const bet = bets[0];
  const legsByBetId = await getBetLegsByBetIds(userId, [bet.id]);
  const legEntries = legsByBetId.get(bet.id) || [];

  return res.render('bets/edit', {
    title: 'Edit Bet',
    bet,
    legEntries,
    isMultiSport: bet.sport === MULTI_SPORT_LABEL || hasMultipleSports(legEntries),
    multiSportLabel: MULTI_SPORT_LABEL,
    betTypeForm: buildBetTypeFormData(bet.bet_type, bet.leg_count),
  });
}

async function updateBet(req, res) {
  const userId = req.session.user.id;
  const betId = req.params.id;
  await ensureBetTableColumns();
  const { sport, sportsbook, betTypeChoice, customBetType, market, odds, stake, result, betDate, notes, legCount, isMultiSport, legSports, legMarkets } = req.body;
  const normalizedBetType = normalizeBetTypeInput({ betTypeChoice, customBetType });
  const parsedLegCount = legCount ? Number(legCount) : null;
  const normalizedSport = normalizeOptionValue(sport);
  const normalizedSportsbook = normalizeOptionValue(sportsbook);
  const normalizedIsMultiSport = normalizeBooleanInput(isMultiSport);
  const legEntries = shouldUseLegEntries(normalizedBetType)
    ? buildLegEntries({
        legSports,
        legMarkets,
        legCount: parsedLegCount,
        isMultiSport: normalizedIsMultiSport,
      })
    : [];
  const derivedMarket = shouldUseLegEntries(normalizedBetType)
    ? summarizeLegEntries(legEntries, normalizedIsMultiSport)
    : normalizeOptionValue(market);

  if ((!normalizedIsMultiSport && !normalizedSport) || !normalizedBetType || !derivedMarket || !odds || !stake || !result || !betDate) {
    req.session.messages = [{ type: 'error', text: 'Please fill out all required fields.' }];
    return res.redirect(`/bets/${betId}/edit`);
  }

  if (LEG_COUNT_BET_TYPES.has(normalizedBetType)) {
    if (!Number.isInteger(parsedLegCount) || parsedLegCount < 2) {
      req.session.messages = [{ type: 'error', text: 'Enter a valid leg count of at least 2.' }];
      return res.redirect(`/bets/${betId}/edit`);
    }

    const hasMissingLegMarket = legEntries.some((entry) => !entry.market);
    if (hasMissingLegMarket) {
      req.session.messages = [{ type: 'error', text: 'Enter a description for every leg.' }];
      return res.redirect(`/bets/${betId}/edit`);
    }

    if (normalizedIsMultiSport) {
      const hasMissingLegSport = legEntries.some((entry) => !entry.sport);
      if (hasMissingLegSport) {
        req.session.messages = [{ type: 'error', text: 'Enter a sport for every leg on a multi-sport ticket.' }];
        return res.redirect(`/bets/${betId}/edit`);
      }
    }
  }

  if (!shouldUseLegEntries(normalizedBetType) && !validateMarketForBetType(normalizedBetType, derivedMarket)) {
    req.session.messages = [{ type: 'error', text: 'Enter the market using the format shown below the field.' }];
    return res.redirect(`/bets/${betId}/edit`);
  }

  const parsedOdds = Number(odds);
  const parsedStake = Number(stake);
  const profitLoss = calculateProfitLoss({ odds: parsedOdds, stake: parsedStake, result });

  await pool.query(
    `UPDATE bets
    SET sport = ?, sportsbook = ?, bet_type = ?, leg_count = ?, market = ?, odds = ?, stake = ?, result = ?, profit_loss = ?, bet_date = ?, notes = ?
    WHERE id = ? AND user_id = ?`,
    [
      normalizedIsMultiSport ? MULTI_SPORT_LABEL : normalizedSport,
      normalizedSportsbook || null,
      normalizedBetType,
      LEG_COUNT_BET_TYPES.has(normalizedBetType) ? parsedLegCount : null,
      derivedMarket,
      parsedOdds,
      parsedStake,
      result,
      profitLoss,
      betDate,
      notes || null,
      betId,
      userId,
    ]
  );

  await pool.query('DELETE FROM bet_legs WHERE bet_id = ?', [betId]);

  if (legEntries.length) {
    const legSql = legEntries
      .map(() => '(?, ?, ?, ?)')
      .join(', ');
    const legParams = legEntries.flatMap((entry) => [
      betId,
      normalizedIsMultiSport ? entry.sport : null,
      entry.market,
      entry.legOrder,
    ]);

    await pool.query(
      `INSERT INTO bet_legs (bet_id, sport, market, leg_order)
        VALUES ${legSql}`,
      legParams
    );
  }

  await Promise.all([
    touchSavedBetOptionUsage(userId, 'sport', normalizedIsMultiSport ? MULTI_SPORT_LABEL : normalizedSport),
    touchSavedBetOptionUsage(userId, 'sportsbook', normalizedSportsbook),
    touchSavedBetOptionUsage(userId, 'bet_type', normalizedBetType),
  ]);

  req.session.messages = [{ type: 'success', text: 'Bet updated.' }];
  return res.redirect('/bets/history');
}

async function deleteBet(req, res) {
  const userId = req.session.user.id;
  const betId = req.params.id;

  await pool.query('DELETE FROM bets WHERE id = ? AND user_id = ?', [betId, userId]);

  req.session.messages = [{ type: 'success', text: 'Bet deleted.' }];
  return res.redirect('/bets/history');
}

async function exportHistoryCsv(req, res) {
  const userId = req.session.user.id;
  await ensureBetTableColumns();
  const filters = buildHistoryFilters(req.query);
  let exportQuery = `SELECT id, bet_date, sport, sportsbook, bet_type, leg_count, market, odds, stake, result, profit_loss, notes
      FROM bets
      WHERE user_id = ?`;
  const queryParams = [userId];

  if (filters.sport) {
    exportQuery += ' AND sport = ?';
    queryParams.push(filters.sport);
  }

  if (filters.sportsbook) {
    exportQuery += ' AND sportsbook = ?';
    queryParams.push(filters.sportsbook);
  }

  if (filters.betType) {
    exportQuery += ' AND bet_type = ?';
    queryParams.push(filters.betType);
  }

  if (filters.result) {
    exportQuery += ' AND result = ?';
    queryParams.push(filters.result);
  }

  if (filters.startDate && parseDateInput(filters.startDate)) {
    exportQuery += ' AND bet_date >= ?';
    queryParams.push(formatDateInput(parseDateInput(filters.startDate)));
  }

  if (filters.endDate && parseDateInput(filters.endDate)) {
    exportQuery += ' AND bet_date <= ?';
    queryParams.push(formatDateInput(parseDateInput(filters.endDate)));
  }

  exportQuery += ' ORDER BY bet_date DESC, created_at DESC';

  const [bets] = await pool.query(exportQuery, queryParams);
  const legsByBetId = await getBetLegsByBetIds(userId, bets.map((bet) => bet.id));
  const betsWithLegs = attachLegsToBets(bets, legsByBetId);

  const headers = ['Bet Date', 'Sport', 'Sportsbook', 'Bet Type', 'Market', 'Odds', 'Stake', 'Result', 'Profit/Loss', 'Notes'];
  const rows = betsWithLegs.map((bet) => [
    formatDateForCsv(bet.bet_date),
    bet.sport,
    bet.sportsbook || '',
    bet.leg_count ? `${bet.bet_type} (${bet.leg_count} legs)` : bet.bet_type,
    bet.displayMarket,
    bet.odds,
    Number(bet.stake || 0).toFixed(2),
    bet.result,
    Number(bet.profit_loss || 0).toFixed(2),
    bet.notes || '',
  ]);

  const csvLines = [headers, ...rows].map((row) => row.map(toCsvCell).join(','));
  const csvContent = csvLines.join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bet-history.csv"');
  return res.status(200).send(csvContent);
}

async function dismissAddBetTipsPrompt(req, res) {
  await dismissAddBetTips(req.session.user.id);
  return res.status(204).send();
}

module.exports = {
  renderAddBet,
  createBet,
  renderHistory,
  renderEditBet,
  exportHistoryCsv,
  updateBet,
  deleteBet,
  dismissAddBetTipsPrompt,
};
