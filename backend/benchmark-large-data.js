/**
 * Benchmark script to generate and test large datasets
 * Usage: node benchmark-large-data.js [size]
 */

const fs = require('fs');
const path = require('path');

function generateLargeFamilyTree(size = 5000) {
  console.log(`Generating family tree with ${size} people...`);
  const people = [];
  const generations = Math.ceil(Math.log2(size)) + 1;
  
  // Generation 0 (ancestors)
  const ancestorCount = Math.min(50, Math.floor(size * 0.05));
  for (let i = 1; i <= ancestorCount; i++) {
    people.push({
      id: i,
      firstName: `Ancestor${i}`,
      lastName: 'Root',
      gender: Math.random() > 0.5 ? 'male' : 'female',
      dateOfBirth: `19${String(Math.floor(Math.random() * 50) + 20).padStart(2, '0')}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      fatherId: null,
      motherId: null,
      generation: 0
    });
  }

  let currentId = ancestorCount + 1;
  
  // Generate subsequent generations
  for (let gen = 1; gen < generations && currentId <= size; gen++) {
    const previousGen = people.filter(p => p.generation === gen - 1);
    const currentGenSize = Math.min(
      size - currentId + 1,
      Math.floor(previousGen.length * (1.5 + Math.random())) // Variable growth rate
    );
    
    // Create couples from previous generation
    const couples = [];
    for (let i = 0; i < previousGen.length - 1; i += 2) {
      if (previousGen[i].gender !== previousGen[i + 1].gender) {
        couples.push([previousGen[i], previousGen[i + 1]]);
      }
    }
    
    // Generate children for couples
    for (let i = 0; i < currentGenSize && currentId <= size; i++) {
      let fatherId = null;
      let motherId = null;
      
      if (couples.length > 0 && Math.random() > 0.2) {
        const couple = couples[Math.floor(Math.random() * couples.length)];
        const father = couple.find(p => p.gender === 'male') || couple[0];
        const mother = couple.find(p => p.gender === 'female') || couple[1];
        fatherId = father.id;
        motherId = mother.id;
      }
      
      people.push({
        id: currentId,
        firstName: `Person${currentId}`,
        lastName: fatherId ? people.find(p => p.id === fatherId)?.lastName || 'Unknown' : `Family${Math.floor(currentId / 100)}`,
        gender: Math.random() > 0.5 ? 'male' : 'female',
        dateOfBirth: `19${String(Math.floor(Math.random() * 80) + 40).padStart(2, '0')}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
        fatherId,
        motherId,
        generation: gen
      });
      
      currentId++;
    }
  }
  
  // Add some marriages within same generation
  const marriageCount = Math.floor(people.length * 0.3);
  const marriages = [];
  const seenPairs = new Set();
  
  for (let i = 0; i < marriageCount; i++) {
    const person1 = people[Math.floor(Math.random() * people.length)];
    const sameGenPeople = people.filter(p => 
      p.generation === person1.generation && 
      p.gender !== person1.gender && 
      p.id !== person1.id
    );
    
    if (sameGenPeople.length > 0) {
      const person2 = sameGenPeople[Math.floor(Math.random() * sameGenPeople.length)];
      const [primaryId, secondaryId] = person1.id < person2.id ? [person1.id, person2.id] : [person2.id, person1.id];
      const key = `${primaryId}-${secondaryId}`;
      if (seenPairs.has(key)) {
        continue;
      }
      seenPairs.add(key);
      marriages.push({
        id: marriages.length + 1,
        personId: primaryId,
        spouseId: secondaryId,
        dateOfMarriage: `20${String(Math.floor(Math.random() * 23)).padStart(2, '0')}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`
      });
    }
  }

  console.log(`Generated ${people.length} people and ${marriages.length} marriages`);
  return { people, marriages };
}

function saveTestData(data, filename) {
  const filepath = path.join(__dirname, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`Test data saved to ${filepath}`);
}

function generatePerformanceReport(size, people, marriages) {
  const report = {
    timestamp: new Date().toISOString(),
    datasetSize: size,
    actualPeopleCount: people.length,
    marriageCount: marriages.length,
    generations: Math.max(...people.map(p => p.generation)) + 1,
    estimatedMemoryUsage: `${Math.round(JSON.stringify({ people, marriages }).length / 1024)} KB`,
    performanceMetrics: {
      expectedLoadTime: size > 5000 ? '5-10 seconds' : size > 1000 ? '2-5 seconds' : 'Under 2 seconds',
      expectedTidyUpTime: size > 5000 ? '10-20 seconds' : size > 1000 ? '3-10 seconds' : 'Under 3 seconds',
      recommendedChunkSize: Math.min(500, Math.max(50, Math.floor(size / 10))),
      memoryOptimizationNeeded: size > 10000
    },
    testScenarios: [
      `Initial loading of ${people.length} nodes`,
      `Tidy-up operation with ${people.length} nodes`,
      'UI responsiveness during processing',
      'Memory usage optimization',
      'Progress indication for user feedback'
    ]
  };
  
  return report;
}

// Main execution
const args = process.argv.slice(2);
const size = parseInt(args[0]) || 3000;

console.log(`\n=== BlauClan Performance Benchmark ===`);
console.log(`Target dataset size: ${size} people\n`);

const startTime = Date.now();
const { people, marriages } = generateLargeFamilyTree(size);
const generationTime = Date.now() - startTime;

console.log(`\nData generation completed in ${generationTime}ms`);

// Save test data
saveTestData({ people, marriages }, `large-test-data-${size}.json`);

// Generate performance report
const report = generatePerformanceReport(size, people, marriages);
saveTestData(report, `performance-report-${size}.json`);

console.log(`\n=== Performance Report ===`);
console.log(`Dataset: ${report.actualPeopleCount} people, ${report.marriageCount} marriages`);
console.log(`Generations: ${report.generations}`);
console.log(`Estimated memory: ${report.estimatedMemoryUsage}`);
console.log(`Expected load time: ${report.performanceMetrics.expectedLoadTime}`);
console.log(`Expected tidy-up time: ${report.performanceMetrics.expectedTidyUpTime}`);
console.log(`Recommended chunk size: ${report.performanceMetrics.recommendedChunkSize}`);

if (report.performanceMetrics.memoryOptimizationNeeded) {
  console.log(`⚠️  WARNING: Large dataset detected. Memory optimization recommended.`);
}

console.log(`\n=== Test Instructions ===`);
console.log(`1. Import the generated data: large-test-data-${size}.json`);
console.log(`2. Test the following scenarios:`);
report.testScenarios.forEach((scenario, i) => {
  console.log(`   ${i + 1}. ${scenario}`);
});
console.log(`3. Verify performance improvements are working correctly`);
console.log(`4. Check that progress indicators appear for operations`);

console.log(`\nBenchmark completed! 🚀`);
