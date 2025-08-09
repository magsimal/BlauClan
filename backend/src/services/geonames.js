/**
 * GeoNames service utilities.
 *
 * Exposes cached suggest and postal-code lookups and a simple validation helper.
 * All functions are safe to call when the service is disabled (returning empty/null results).
 *
 * @module services/geonames
 */

const crypto = require('crypto');
const cache = require('../cache');

const GEONAMES_USER = process.env.GEONAMES_USER;
let geonamesEnabled = true;

const PRIORITY_COUNTRIES = new Set(['DE', 'PL', 'HU']);
const EUROPE_COUNTRIES = new Set([
  'AL','AD','AM','AT','AZ','BY','BE','BA','BG','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB','GE','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME','MK','MT','NL','NO','PL','PT','RO','RU','SE','SI','SK','SM','TR','UA','VA','XK','RS','FO'
]);
const AMERICAS_COUNTRIES = new Set([
  'US','CA','MX','GT','HN','SV','BZ','CR','PA','NI','CU','HT','DO','JM','BS','BB','TT','GY','SR','VE','CO','EC','PE','BO','CL','AR','PY','UY','BR'
]);

function regionPriority(cc) {
  if (PRIORITY_COUNTRIES.has(cc)) return 1;
  if (EUROPE_COUNTRIES.has(cc)) return 2;
  if (AMERICAS_COUNTRIES.has(cc)) return 3;
  return 4;
}

async function geonamesPostalCode(lat, lng, cc) {
  if (!geonamesEnabled) return null;
  const key = `gnzip:${lat}:${lng}:${cc}`;
  const cached = await cache.get(key);
  if (cached !== null) return cached;
  const url =
    `http://api.geonames.org/findNearbyPostalCodesJSON?lat=${lat}&lng=${lng}` +
    (cc ? `&country=${cc}` : '') +
    `&maxRows=1&username=${GEONAMES_USER}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.postalCodes && data.postalCodes.length) {
      const code = data.postalCodes[0].postalCode || null;
      await cache.set(key, code, 604800); // one week
      return code;
    }
  } catch (e) {
    // swallow and cache null briefly
  }
  await cache.set(key, null, 86400);
  return null;
}

async function geonamesSuggest(query, lang = 'en', cc = '') {
  if (!geonamesEnabled) return [];
  let q = (query || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 128);
  if (!q) return [];
  const hash = crypto.createHash('sha1').update((q + lang + cc).toLowerCase()).digest('hex');
  const key = `gn:${hash}`;
  const cached = await cache.get(key);
  if (cached) return cached;
  const encoded = encodeURIComponent(q).replace(/-/g, '%2D');
  const queryParam = q.length < 4 ? `name_startsWith=${encoded}` : `q=${encoded}&fuzzy=0.8`;
  const url = `http://api.geonames.org/searchJSON?${queryParam}`
    + `&maxRows=100&username=${GEONAMES_USER}`
    + `&lang=${encodeURIComponent(String(lang || 'en').slice(0, 5))}`
    + (cc ? `&country=${encodeURIComponent(String(cc).toUpperCase().slice(0, 2))}` : '')
    + '&isNameRequired=true';
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    let res = Array.isArray(data.geonames) ? data.geonames : [];
    if (!/County|Province|District/i.test(q)) {
      res = res.filter((r) => r.fcode && r.fcode.startsWith('PPL'));
    }
    res.sort((a, b) => {
      const pa = regionPriority(a.countryCode);
      const pb = regionPriority(b.countryCode);
      if (pa !== pb) return pa - pb;
      return (b.score || 0) - (a.score || 0);
    });
    const seen = new Set();
    const unique = res.filter((r) => {
      if (seen.has(r.geonameId)) return false;
      seen.add(r.geonameId);
      return true;
    });
    const final = await Promise.all(
      unique.map(async (r) => ({
        geonameId: r.geonameId,
        name: r.name,
        adminName1: r.adminName1,
        countryCode: r.countryCode,
        lat: r.lat,
        lng: r.lng,
        score: r.score,
        postalCode: await geonamesPostalCode(r.lat, r.lng, r.countryCode),
      })),
    );
    await cache.set(key, final, 86400);
    return final;
  } catch (_e) {
    return [];
  }
}

async function verifyGeonames() {
  if (!process.env.GEONAMES_USER) {
    geonamesEnabled = false;
    return;
  }
  try {
    const res = await geonamesSuggest('Berlin', 'en');
    geonamesEnabled = res.length > 0;
    if (!geonamesEnabled) {
      // check service reachability with demo
      try {
        const demo = await fetch('http://api.geonames.org/searchJSON?q=london&maxRows=10&username=demo');
        const data = await demo.json();
        if (!(demo.ok && Array.isArray(data.geonames) && data.geonames.length)) {
          // unreachable; still disable
        }
      } catch (_err) { /* ignore */ }
    }
  } catch (_e) {
    geonamesEnabled = false;
  }
}

async function validatePlace(place) {
  if (process.env.VALIDATOR_STRICT !== 'true' || !place) return true;
  const suggestions = await geonamesSuggest(place, 'en');
  if (!suggestions.length) return false;
  return suggestions.some((s) => s.score >= 0.9 && (s.name || '').toLowerCase() === place.toLowerCase());
}

module.exports = { geonamesSuggest, geonamesPostalCode, verifyGeonames, validatePlace };