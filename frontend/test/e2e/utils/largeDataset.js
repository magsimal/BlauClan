const DEFAULT_TARGET_SIZE = 250;

function createPersonFactory(targetSize) {
  const people = [];
  let nextId = 1;

  function createPerson({
    gender = nextId % 2 === 0 ? 'female' : 'male',
    firstName,
    lastName,
    fatherId = null,
    motherId = null,
    generation = 0,
    branch = 'Root',
  } = {}) {
    if (people.length >= targetSize) {
      throw new Error('Attempted to create person beyond target size');
    }
    const id = nextId;
    nextId += 1;
    const person = {
      id,
      firstName: firstName || `Person${id}`,
      lastName: lastName || `${branch}Family`,
      gender,
      fatherId,
      motherId,
      birthApprox: `Gen${generation}`,
    };
    if (gender === 'female' && !person.maidenName) {
      person.maidenName = `${branch}Maiden`;
    }
    people.push(person);
    return person;
  }

  return {
    createPerson,
    getPeople() {
      return people.slice();
    },
  };
}

function createLargeDataset(targetSize = DEFAULT_TARGET_SIZE) {
  if (targetSize < 10) {
    throw new Error('Target size must be at least 10 people');
  }

  const marriages = [];
  const marriagePairs = new Set();
  const { createPerson, getPeople } = createPersonFactory(targetSize);

  const couplesQueue = [];
  let multiSpouseAssigned = false;

function clampYearOffset(value) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 99) return 99;
  return value;
}

function registerMarriage(primaryId, spouseId, yearOffset = 1) {
  const key =
    primaryId < spouseId ? `${primaryId}-${spouseId}` : `${spouseId}-${primaryId}`;
  if (marriagePairs.has(key)) {
    return;
  }
  marriagePairs.add(key);
  const offset = clampYearOffset(Number.parseInt(yearOffset, 10));
  const year = 2000 + offset;
  marriages.push({
    id: marriages.length + 1,
    personId: primaryId,
    spouseId,
    dateOfMarriage: `${year}-01-01`,
  });
}

  function enqueueCouple({ fatherId, motherId, generation, branch }) {
    couplesQueue.push({ fatherId, motherId, generation, branch });
  }

  // Seed root couple
  const patriarch = createPerson({
    gender: 'male',
    firstName: 'Patriarch',
    lastName: 'Dynasty',
    generation: 0,
    branch: 'Dynasty',
  });
  const matriarch = createPerson({
    gender: 'female',
    firstName: 'Matriarch',
    lastName: 'Dynasty',
    generation: 0,
    branch: 'Dynasty',
  });
  registerMarriage(patriarch.id, matriarch.id, 0);
  enqueueCouple({
    fatherId: patriarch.id,
    motherId: matriarch.id,
    generation: 0,
    branch: 'Dynasty',
  });

  while (couplesQueue.length && getPeople().length < targetSize) {
    const couple = couplesQueue.shift();
    const currentPeople = getPeople();
    if (currentPeople.length >= targetSize) break;

    const remaining = targetSize - currentPeople.length;
    const plannedChildren = Math.min(3, Math.max(1, remaining));

    for (let i = 0; i < plannedChildren && getPeople().length < targetSize; i += 1) {
      const gender = i % 2 === 0 ? 'male' : 'female';
      const branch = `${couple.branch}-${String.fromCharCode(65 + i)}`;
      const child = createPerson({
        gender,
        generation: couple.generation + 1,
        branch,
        fatherId: couple.fatherId,
        motherId: couple.motherId,
      });

      let spouse = null;
      if (getPeople().length < targetSize) {
        spouse = createPerson({
          gender: gender === 'male' ? 'female' : 'male',
          generation: couple.generation + 1,
          branch: `${branch}-Spouse`,
        });
        const husbandId = gender === 'male' ? child.id : spouse.id;
        const wifeId = gender === 'male' ? spouse.id : child.id;
        const primaryYearOffset = ((couple.generation + 1) * 10) + i;
        registerMarriage(husbandId, wifeId, primaryYearOffset);

        if (getPeople().length < targetSize) {
          enqueueCouple({
            fatherId: husbandId,
            motherId: wifeId,
            generation: couple.generation + 1,
            branch,
          });
        }

        if (!multiSpouseAssigned && getPeople().length < targetSize) {
          const extraSpouse = createPerson({
            gender: gender === 'male' ? 'female' : 'male',
            generation: couple.generation + 1,
            branch: `${branch}-ExtraSpouse`,
          });
          const extraHusbandId = gender === 'male' ? child.id : extraSpouse.id;
          const extraWifeId = gender === 'male' ? extraSpouse.id : child.id;
          const extraYearOffset = ((couple.generation + 1) * 10) + (i + 5);
          registerMarriage(extraHusbandId, extraWifeId, extraYearOffset);
          multiSpouseAssigned = true;
        }
      }
    }
  }

  const people = getPeople();
  if (people.length !== targetSize) {
    throw new Error(`Dataset generation mismatch: expected ${targetSize}, got ${people.length}`);
  }

  return {
    people,
    marriages,
    layouts: [],
  };
}

module.exports = {
  createLargeDataset,
  DEFAULT_TARGET_SIZE,
};
