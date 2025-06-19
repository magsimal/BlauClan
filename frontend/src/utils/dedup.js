(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.Dedupe = factory();
  }
})(this, function () {
  function levenshtein(a, b) {
    a = a || '';
    b = b || '';
    const m = [];
    for (let i = 0; i <= b.length; i++) {
      m[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      if (j === 0) m[0][j] = j;
      else m[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) m[i][j] = m[i - 1][j - 1];
        else m[i][j] = Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]) + 1;
      }
    }
    return m[b.length][a.length];
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

  function getYear(str) {
    if (!str) return null;
    const m = /^(\d{4})/.exec(str);
    return m ? parseInt(m[1], 10) : null;
  }

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

  function findBestMatch(person, existing) {
    let best = null;
    let bestScore = 0;
    for (const e of existing) {
      if (person.gedcomId && e.gedcomId && person.gedcomId === e.gedcomId) {
        return { match: e, score: 100 };
      }
      const sc = matchScore(person, e);
      if (sc > bestScore) {
        best = e;
        bestScore = sc;
      }
    }
    return { match: best, score: bestScore };
  }

  return { findBestMatch, matchScore };
});
