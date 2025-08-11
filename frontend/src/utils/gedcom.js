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
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const parts = line.split(/\s+/);
      const level = parts.shift();
      if (parts.length >= 2 && parts[0].startsWith('@') && parts[1] === 'INDI') {
        if (family) { families.push(family); family = null; }
        if (person) people.push(person);
        person = { gedcomId: parts[0] };
        ctx = null;
        return;
      }
      if (parts.length >= 2 && parts[0].startsWith('@') && parts[1] === 'FAM') {
        if (person) { people.push(person); person = null; }
        if (family) families.push(family);
        family = { gedcomId: parts[0], children: [] };
        ctx = null;
        return;
      }
      const tag = parts.shift();
      const rest = parts.join(' ');
      if (person) {
      if (level === '1' && tag === 'NAME') {
        const m = rest.match(/^([^/]*?)\s*\/([^/]*)\//);
        if (m) {
          person.firstName = m[1].trim();
          person.lastName = m[2].trim();
        } else {
          const seg = rest.split(' ');
          person.firstName = seg.shift() || '';
          person.lastName = seg.join(' ');
        }
      } else if (level === '1' && tag === 'SEX') {
        const val = rest.trim().toLowerCase();
        person.gender = val.startsWith('m') ? 'male' : val.startsWith('f') ? 'female' : '';
      } else if (level === '1' && tag === 'BIRT') {
        ctx = 'BIRT';
      } else if (level === '1' && tag === 'DEAT') {
        ctx = 'DEAT';
      } else if (level === '2' && tag === 'DATE') {
        const val = rest.trim();
        const iso = toIso(val);
        if (ctx === 'BIRT') {
          if (iso) person.dateOfBirth = iso;
          else person.birthApprox = val;
        } else if (ctx === 'DEAT') {
          if (iso) person.dateOfDeath = iso;
          else person.deathApprox = val;
        }
      } else if (level === '2' && tag === 'PLAC') {
        if (ctx === 'BIRT') person.placeOfBirth = rest.trim();
      } else {
        // end person block
      }
      }
      if (family) {
        if (level === '1' && tag === 'HUSB') family.husband = rest.trim();
        else if (level === '1' && tag === 'WIFE') family.wife = rest.trim();
        else if (level === '1' && tag === 'CHIL') family.children.push(rest.trim());
        else if (level === '1' && tag === 'MARR') ctx = 'MARR';
        else if (level === '2' && ctx === 'MARR' && tag === 'DATE') {
          const iso = toIso(rest.trim());
          if (iso) family.date = iso; else family.approx = rest.trim();
        } else if (level === '2' && ctx === 'MARR' && tag === 'PLAC') {
          family.place = rest.trim();
        } else if (level === '0') {
          families.push(family);
          family = null;
          ctx = null;
        }
      } else if (level === '0') {
        if (person) { people.push(person); person = null; ctx = null; }
        if (family) { families.push(family); family = null; ctx = null; }
      }
    });
    if (person) people.push(person);
    if (family) families.push(family);
    return { people, families };
  }

  return { parseGedcom };
});
