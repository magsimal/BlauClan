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
    const m = str.match(/^(\d{1,2}) ([A-Z]{3}) (\d{4})$/);
    if (m) {
      const d = m[1].padStart(2, '0');
      const mo = monthMap[m[2]];
      return `${m[3]}-${mo}-${d}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    return null;
  }

  function parseGedcom(text) {
    const lines = text.split(/\r?\n/);
    const people = [];
    let person = null;
    let ctx = null;
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const parts = line.split(/\s+/);
      const level = parts.shift();
      if (parts.length >= 2 && parts[0].startsWith('@') && parts[1] === 'INDI') {
        if (person) people.push(person);
        person = {};
        ctx = null;
        return;
      }
      if (!person) return;
      const tag = parts.shift();
      const rest = parts.join(' ');
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
      } else if (level === '0') {
        if (person) {
          people.push(person);
          person = null;
          ctx = null;
        }
      }
    });
    if (person) people.push(person);
    return people;
  }

  return { parseGedcom };
});
