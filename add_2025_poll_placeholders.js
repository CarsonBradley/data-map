const fs = require('fs');
const path = require('path');

console.log('Adding empty pollResults to 2025 province poll files...');

const pollDir = 'election_boundaries_19-25/2025_boundaries/geojson/poll_by_province';
const files = fs.readdirSync(pollDir).filter(f => f.endsWith('.json'));

console.log(`Found ${files.length} poll files to process`);

files.forEach(file => {
    const filePath = path.join(pollDir, file);
    console.log(`Processing: ${file}`);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Add empty pollResults to each feature if not already present
    data.features.forEach(feature => {
        if (!feature.properties.pollResults) {
            feature.properties.pollResults = {
                pollNumber: feature.properties.PD_NUM,
                pollName: null,
                rejected: 0,
                electors: 0,
                candidates: [],
                totalVotes: 0,
                winner: null
            };
        }
    });

    fs.writeFileSync(filePath, JSON.stringify(data));
    console.log(`  ✓ Updated ${data.features.length} features`);
});

console.log('\n✓ Done! All 2025 poll files now have empty pollResults');
console.log('  Polls will display in grey until election results are added');
