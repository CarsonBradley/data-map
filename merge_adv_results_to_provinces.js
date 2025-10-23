const fs = require('fs');
const path = require('path');

// Get year from command line argument
const year = process.argv[2] || '2021';

console.log(`\n=== Merging ${year} advance poll results into province files ===\n`);

const advByRidingDir = `election_boundaries_19-25/${year}_boundaries/geojson/adv_by_riding`;
const advByProvinceDir = `election_boundaries_19-25/${year}_boundaries/geojson/adv_by_province`;

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

// Build a map of all advance poll results by FED_NUM and ADV_POLL_N/ADVPDNUM
console.log('Loading advance poll results from adv_by_riding files...');
const advResultsMap = new Map(); // Key: "FED_NUM-ADV_POLL_N", Value: advResults object

// Read all adv_by_riding files
const ridingFiles = fs.readdirSync(advByRidingDir).filter(f => f.endsWith('.json'));
console.log(`Found ${ridingFiles.length} riding files with advance poll results`);

let loadedAdvPolls = 0;
ridingFiles.forEach((fileName, index) => {
    const filePath = path.join(advByRidingDir, fileName);
    const ridingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    ridingData.features.forEach(feature => {
        const fedNum = feature.properties.FED_NUM || feature.properties.FEDNUM;
        // Handle both 2021 (ADV_POLL_N) and 2019 (ADVPDNUM) property names
        const advPollNum = feature.properties.ADV_POLL_N || feature.properties.ADVPDNUM;

        if (feature.properties.advResults) {
            const key = `${fedNum}-${advPollNum}`;
            advResultsMap.set(key, feature.properties.advResults);
            loadedAdvPolls++;
        }
    });

    if ((index + 1) % 50 === 0) {
        console.log(`  Processed ${index + 1}/${ridingFiles.length} riding files...`);
    }
});

console.log(`Loaded ${loadedAdvPolls} advance poll results from riding files\n`);

// Now merge results into province files
console.log('Merging results into province files:');

Object.keys(PROVINCES).forEach(pruid => {
    const province = PROVINCES[pruid];
    const provinceFilePath = path.join(advByProvinceDir, `${pruid}_${province.abbr}_${year}_adv.json`);

    if (!fs.existsSync(provinceFilePath)) {
        console.log(`  ⚠ Skipping ${province.name}: file not found`);
        return;
    }

    const provinceData = JSON.parse(fs.readFileSync(provinceFilePath, 'utf8'));
    let matchedCount = 0;
    let unmatchedCount = 0;

    provinceData.features.forEach(feature => {
        const fedNum = feature.properties.FED_NUM || feature.properties.FEDNUM;
        const advPollNum = feature.properties.ADV_POLL_N || feature.properties.ADVPDNUM;
        const key = `${fedNum}-${advPollNum}`;

        if (advResultsMap.has(key)) {
            feature.properties.advResults = advResultsMap.get(key);
            matchedCount++;
        } else {
            unmatchedCount++;
        }
    });

    // Save the updated file
    fs.writeFileSync(provinceFilePath, JSON.stringify(provinceData));

    const fileSizeMB = (fs.statSync(provinceFilePath).size / (1024 * 1024)).toFixed(2);
    console.log(`  ✓ ${province.name} (${province.abbr}): ${matchedCount} matched, ${unmatchedCount} unmatched → ${fileSizeMB} MB`);
});

console.log(`\n✓ Completed! Merged advance poll results into province files\n`);
