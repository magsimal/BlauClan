(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.Dedupe = factory();
  }
})(this, function () {
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
  const getYear = (str) => {
    const m = str && /^(\d{4})/.exec(str);
    return m ? parseInt(m[1], 10) : null;
  };
  function matchScore(p, e) {
    let score = 0;
    const ln = (p.lastName || '').toLowerCase();
    const ln2 = (e.lastName || '').toLowerCase();
    const mn2 = (e.maidenName || '').toLowerCase();
    if (ln && ln2 && ln === ln2) score += 3;
    else if (ln && mn2 && ln === mn2) score += 3;

    score += similarity(p.firstName, e.firstName) * 2;

    const yearP = getYear(p.dateOfBirth || p.birthApprox);
    const yearE = getYear(e.dateOfBirth || e.birthApprox);
    if (yearP && yearE) {
      const diff = Math.abs(yearP - yearE);
      if (diff === 0) score += 2;
      else if (diff <= 1) score += 1.5;
      else if (diff <= 3) score += 1;
    }

    score += similarity(p.placeOfBirth, e.placeOfBirth);

    return score;
  }
  function attributeMatchCount(p, e) {
    let count = 0;
    const ln = (p.lastName || '').toLowerCase();
    const ln2 = (e.lastName || '').toLowerCase();
    const mn2 = (e.maidenName || '').toLowerCase();
    if ((ln && ln2 && ln === ln2) || (ln && mn2 && ln === mn2)) count += 1;

    if (similarity(p.firstName, e.firstName) >= 0.8) count += 1;

    const yearP = getYear(p.dateOfBirth || p.birthApprox);
    const yearE = getYear(e.dateOfBirth || e.birthApprox);
    if (yearP && yearE && Math.abs(yearP - yearE) <= 1) count += 1;

    if (similarity(p.placeOfBirth, e.placeOfBirth) >= 0.8) count += 1;

    return count;
  }
  function findBestMatch(person, existing) {
    let best = null;
    let bestScore = 0;
    for (const e of existing) {
      if (person.gedcomId && e.gedcomId && person.gedcomId === e.gedcomId) {
        return { match: e, score: 100 };
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
