const fs = require('fs');
const path = require('path');

// Get year from command line argument
const year = process.argv[2] || '2021';

console.log(`\n=== Splitting ${year} poll data by province ===\n`);

const boundariesPath = `election_boundaries_19-25/${year}_boundaries/geojson/${year}_poll_wgs84.json`;
const outputDir = `election_boundaries_19-25/${year}_boundaries/geojson/poll_by_province`;

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Province mapping
const PROVINCES = {
    10: { name: 'Newfoundland and Labrador', abbr: 'NL' },
    11: { name: 'Prince Edward Island', abbr: 'PE' },
    12: { name: 'Nova Scotia', abbr: 'NS' },
    13: { name: 'New Brunswick', abbr: 'NB' },
    24: { name: 'Quebec', abbr: 'QC' },
    35: { name: 'Ontario', abbr: 'ON' },
    46: { name: 'Manitoba', abbr: 'MB' },
    47: { name: 'Saskatchewan', abbr: 'SK' },
    48: { name: 'Alberta', abbr: 'AB' },
    59: { name: 'British Columbia', abbr: 'BC' },
    60: { name: 'Yukon', abbr: 'YT' },
    61: { name: 'Northwest Territories', abbr: 'NT' },
    62: { name: 'Nunavut', abbr: 'NU' }
};

console.log('Loading poll boundaries...');
const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
console.log(`Loaded ${boundaries.features.length} poll features`);

// Group boundaries by province (extracted from FED_NUM)
const provinceBoundaries = new Map();

boundaries.features.forEach((feature, index) => {
    // Handle both FED_NUM (2021) and FEDNUM (2019)
    const fedNum = feature.properties.FED_NUM || feature.properties.FEDNUM;

    if (!fedNum) {
        console.warn(`Warning: Feature ${index} has no FED_NUM/FEDNUM property`);
        return;
    }

    // Extract province code from first 2 digits of FED_NUM
    const pruid = Math.floor(fedNum / 1000);

    if (!PROVINCES[pruid]) {
        console.warn(`Warning: Unknown PRUID ${pruid} from FED_NUM ${fedNum}`);
        return;
    }

    if (!provinceBoundaries.has(pruid)) {
        provinceBoundaries.set(pruid, []);
    }

    provinceBoundaries.get(pruid).push(feature);
});

console.log(`\nGrouped polls into ${provinceBoundaries.size} provinces:`);

// Create a file for each province
let filesCreated = 0;
provinceBoundaries.forEach((features, pruid) => {
    const province = PROVINCES[pruid];

    const provinceGeoJSON = {
        type: 'FeatureCollection',
        features: features
    };

    const outputPath = path.join(outputDir, `${pruid}_${province.abbr}_${year}_poll.json`);
    fs.writeFileSync(outputPath, JSON.stringify(provinceGeoJSON));

    const fileSizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
    console.log(`  ✓ ${province.name} (${province.abbr}): ${features.length} polls → ${fileSizeMB} MB`);

    filesCreated++;
});

console.log(`\n✓ Completed! Generated ${filesCreated} province-level poll files in ${outputDir}\n`);
