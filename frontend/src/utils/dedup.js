(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.Dedupe = factory();
  }
})(this, function () {
  const THRESHOLDS = {
    GIVEN_NAME_STRONG: 0.82,
    GIVEN_NAME_GATE: 0.82,
    PLACE_SIM_CONFLICT: 0.6,
    PLACE_SIM_STRONG: 0.8,
    YEAR_CONFLICT_DIFF: 5,
    YEAR_STRONG_DIFF: 1,
  };
  function levenshtein(a = '', b = '') {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(
          dp[j] + 1,
          prev + (a[i - 1] === b[j - 1] ? 0 : 1),
          dp[j - 1] + 1,
        );
        prev = tmp;
      }
    }
    return dp[b.length];
  }
  function similarity(a, b) {
    a = (a || '').toLowerCase();
    b = (b || '').toLowerCase();
    if (!a || !b) return 0;
    if (a === b) return 1;
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return (maxLen - dist) / maxLen;
  }

  function normalizePlace(str) {
    if (!str) return '';
    let s = str.toLowerCase().trim();
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[,\.]/g, '');
    s = s.replace(/frankfurt a ?\. ?m\.?/g, 'frankfurt am main');
    s = s.replace(/koln/g, 'cologne');
    s = s.replace(/deutschland/g, 'germany');
    return s;
  }

  function firstNameSimilarity(a, b) {
    a = (a || '').trim();
    b = (b || '').trim();
    if (!a || !b) return 0;
    const aParts = a.toLowerCase().split(/\s+/);
    const bParts = b.toLowerCase().split(/\s+/);
    if (aParts.length > 1 && bParts.length > 1) {
      if (similarity(aParts[1], bParts[1]) < THRESHOLDS.GIVEN_NAME_STRONG) {
        return 0;
      }
    }
    return similarity(a, b);
  }

  // New: consider callName as alternative given name and take best similarity
  function bestGivenNameSimilarity(p, e) {
    const pNames = [p && p.firstName, p && p.callName].filter(Boolean);
    const eNames = [e && e.firstName, e && e.callName].filter(Boolean);
    if (pNames.length === 0 || eNames.length === 0) return 0;
    let best = 0;
    for (const pn of pNames) {
      for (const en of eNames) {
        const s = firstNameSimilarity(pn, en);
        if (s > best) best = s;
      }
    }
    return best;
  }

  function hasConflictingInfo(p, e) {
    const yearBirthP = getYear(p.dateOfBirth || p.birthApprox);
    const yearBirthE = getYear(e.dateOfBirth || e.birthApprox);
    if (yearBirthP && yearBirthE && Math.abs(yearBirthP - yearBirthE) >= THRESHOLDS.YEAR_CONFLICT_DIFF) {
      return true;
    }
    const yearDeathP = getYear(p.dateOfDeath || p.deathApprox);
    const yearDeathE = getYear(e.dateOfDeath || e.deathApprox);
    if (yearDeathP && yearDeathE && Math.abs(yearDeathP - yearDeathE) >= THRESHOLDS.YEAR_CONFLICT_DIFF) {
      return true;
    }
    if (p.placeOfBirth && e.placeOfBirth && similarity(normalizePlace(p.placeOfBirth), normalizePlace(e.placeOfBirth)) < THRESHOLDS.PLACE_SIM_CONFLICT) {
      return true;
    }
    if (p.placeOfDeath && e.placeOfDeath && similarity(normalizePlace(p.placeOfDeath), normalizePlace(e.placeOfDeath)) < THRESHOLDS.PLACE_SIM_CONFLICT) {
      return true;
    }
    return false;
  }
  const getYear = (str) => {
    const m = str && /^(\d{4})/.exec(str);
    return m ? parseInt(m[1], 10) : null;
  };
  function matchScore(p, e) {
    let score = 0;
    const ln = (p.lastName || '').toLowerCase();
    const ln2 = (e.lastName || '').toLowerCase();
    const mn2 = (e.maidenName || '').toLowerCase();
    if (ln && ln2 && ln === ln2) score += 1.5;
    else if (ln && mn2 && ln === mn2) score += 1.5;

    const givenSim = bestGivenNameSimilarity(p, e);
    score += givenSim * 2.5;

    const yearP = getYear(p.dateOfBirth || p.birthApprox);
    const yearE = getYear(e.dateOfBirth || e.birthApprox);
    if (yearP && yearE) {
      const diff = Math.abs(yearP - yearE);
      if (diff === 0) score += 2;
      else if (diff <= THRESHOLDS.YEAR_STRONG_DIFF) score += 1.5;
      else if (diff <= 3) score += 1;
    }

    score += similarity(normalizePlace(p.placeOfBirth), normalizePlace(e.placeOfBirth));

    return score;
  }
  function attributeMatchCount(p, e) {
    let count = 0;
    const ln = (p.lastName || '').toLowerCase();
    const ln2 = (e.lastName || '').toLowerCase();
    const mn2 = (e.maidenName || '').toLowerCase();
    if ((ln && ln2 && ln === ln2) || (ln && mn2 && ln === mn2)) count += 1;

    const givenSim = bestGivenNameSimilarity(p, e);
    if (givenSim >= THRESHOLDS.GIVEN_NAME_STRONG) count += 1;

    const yearP = getYear(p.dateOfBirth || p.birthApprox);
    const yearE = getYear(e.dateOfBirth || e.birthApprox);
    if (yearP && yearE && Math.abs(yearP - yearE) <= THRESHOLDS.YEAR_STRONG_DIFF) count += 1;

    if (similarity(normalizePlace(p.placeOfBirth), normalizePlace(e.placeOfBirth)) >= THRESHOLDS.PLACE_SIM_STRONG) count += 1;

    return count;
  }
  function findBestMatch(person, existing) {
    let best = null;
    let bestScore = 0;
    for (const e of existing) {
      if (person.gedcomId && e.gedcomId && person.gedcomId === e.gedcomId) {
        return { match: e, score: 100 };
      }
      if (person.gender && e.gender && person.gender !== e.gender) {
        continue;
      }
      if (hasConflictingInfo(person, e)) {
        continue;
      }
      // Stricter: if both have given-name info but similarity is low, skip
      const hasGiven = (person.firstName || person.callName) && (e.firstName || e.callName);
      if (hasGiven) {
        const givenSim = bestGivenNameSimilarity(person, e);
        if (givenSim < THRESHOLDS.GIVEN_NAME_GATE) {
          continue;
        }
      }
      const sc = matchScore(person, e);
      const matches = attributeMatchCount(person, e);
      if (matches <= 1) continue;
      if (sc > bestScore) {
        best = e;
        bestScore = sc;
      }
    }
    return { match: best, score: bestScore };
  }
  return { findBestMatch, matchScore };
});
