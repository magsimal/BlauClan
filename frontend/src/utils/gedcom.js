(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.Gedcom = factory();
  }
})(this, function () {
  const monthMap = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };

  function toIso(str) {
    if (!str || typeof str !== 'string') return null;
    const trimmed = str.trim();
    const m = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (m) {
      const d = m[1].padStart(2, '0');
      const mo = monthMap[m[2].toUpperCase()];
      if (!mo) return null;
      return `${m[3]}-${mo}-${d}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    return null;
  }

  function parseGedcom(text) {
    const lines = text.split(/\r?\n/);
    const people = [];
    const families = [];
    let person = null;
    let family = null;
    let ctx = null;
    let prevLevel = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      const level = parts.shift();
      if (prevLevel === '2' && level !== '2') {
        ctx = null;
      }
      if (parts.length >= 2 && parts[0].startsWith('@') && parts[1] === 'INDI') {
        if (family) { families.push(family); family = null; }
        if (person) people.push(person);
        person = { gedcomId: parts[0] };
        ctx = null;
        prevLevel = level;
        continue;
      }
      if (parts.length >= 2 && parts[0].startsWith('@') && parts[1] === 'FAM') {
        if (person) { people.push(person); person = null; }
        if (family) families.push(family);
        family = { gedcomId: parts[0], children: [] };
        ctx = null;
        prevLevel = level;
        continue;
      }
      const tag = parts.shift();
      const rest = parts.join(' ');
      if (person) {
        if (level === '1') {
          if (tag === 'BIRT' || tag === 'DEAT') {
            ctx = tag;
          } else {
            ctx = null;
            if (tag === 'NAME') {
              const m = rest.match(/^([^/]*?)\s*\/([^/]*)\//);
              if (m) {
                person.firstName = m[1].trim();
                person.lastName = m[2].trim();
              } else {
                const seg = rest.split(' ');
                person.firstName = seg.shift() || '';
                person.lastName = seg.join(' ');
              }
            } else if (tag === 'SEX') {
              const val = rest.trim().toLowerCase();
              person.gender = val.startsWith('m') ? 'male' : val.startsWith('f') ? 'female' : '';
            }
          }
        } else if (level === '2') {
          if (ctx === 'BIRT') {
            if (tag === 'DATE') {
              const val = rest.trim();
              const iso = toIso(val);
              if (iso) person.dateOfBirth = iso; else person.birthApprox = val;
            } else if (tag === 'PLAC') {
              person.placeOfBirth = rest.trim();
            }
          } else if (ctx === 'DEAT') {
            if (tag === 'DATE') {
              const val = rest.trim();
              const iso = toIso(val);
              if (iso) person.dateOfDeath = iso; else person.deathApprox = val;
            }
          }
        }
      }
      if (family) {
        if (level === '1') {
          if (tag === 'MARR') {
            ctx = 'MARR';
          } else {
            ctx = null;
            if (tag === 'HUSB') family.husband = rest.trim();
            else if (tag === 'WIFE') family.wife = rest.trim();
            else if (tag === 'CHIL') family.children.push(rest.trim());
          }
        } else if (level === '2' && ctx === 'MARR') {
          if (tag === 'DATE') {
            const iso = toIso(rest.trim());
            if (iso) family.date = iso; else family.approx = rest.trim();
          } else if (tag === 'PLAC') {
            family.place = rest.trim();
          }
        } else if (level === '0') {
          families.push(family);
          family = null;
          ctx = null;
        }
      } else if (level === '0') {
        if (person) { people.push(person); person = null; ctx = null; }
        if (family) { families.push(family); family = null; ctx = null; }
      }
      prevLevel = level;
    }
    if (person) people.push(person);
    if (family) families.push(family);
    return { people, families };
  }

  return { parseGedcom };
});
