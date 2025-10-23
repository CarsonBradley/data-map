const fs = require('fs');

console.log('Creating 2025 riding placeholder with boundaries but no results...');

// Read the 2025 riding boundaries (without results)
const boundariesPath = 'election_boundaries_19-25/2025_boundaries/geojson/2025_riding_wgs84.json';
const outputPath = 'election_boundaries_19-25/2025_boundaries/geojson/2025_riding_with_results_min.json';

console.log(`Reading boundaries from: ${boundariesPath}`);
const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));

console.log(`Found ${boundaries.features.length} ridings`);

// Add empty electionResults to each feature
boundaries.features.forEach((feature) => {
    feature.properties.electionResults = {
        ridingNumber: feature.properties.FED_NUM,
        ridingName: feature.properties.ED_NAMEE,
        candidates: [],
        totalVotes: 0,
        winner: null
    };
});

console.log(`Writing placeholder file to: ${outputPath}`);
fs.writeFileSync(outputPath, JSON.stringify(boundaries));

console.log('✓ Done! 2025 riding placeholder created with empty results');
console.log('  Ridings will display in grey until election results are added');
