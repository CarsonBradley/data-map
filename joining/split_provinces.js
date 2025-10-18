const fs = require('fs');
const path = require('path');

// Province codes
const PROVINCES = {
    '10': 'NL',
    '11': 'PE',
    '12': 'NS',
    '13': 'NB',
    '24': 'QC',
    '35': 'ON',
    '46': 'MB',
    '47': 'SK',
    '48': 'AB',
    '59': 'BC',
    '60': 'YT',
    '61': 'NT',
    '62': 'NU'
};

console.log('Reading large GeoJSON file...');
const geoData = JSON.parse(fs.readFileSync('new_boundaries/lda_000b21a_e.geojson', 'utf8'));

// Create province boundaries directory
const provinceBoundariesDir = 'new_boundaries/provinces';
if (!fs.existsSync(provinceBoundariesDir)) {
    fs.mkdirSync(provinceBoundariesDir, { recursive: true });
}

// Split by province
Object.entries(PROVINCES).forEach(([code, abbr]) => {
    console.log(`Processing province ${abbr} (${code})...`);
    
    const provinceFeatures = geoData.features.filter(feature => 
        feature.properties && feature.properties.PRUID === code
    );
    
    if (provinceFeatures.length > 0) {
        const provinceGeoJSON = {
            type: "FeatureCollection",
            features: provinceFeatures
        };
        
        const filename = path.join(provinceBoundariesDir, `da_${code}_${abbr}.geojson`);
        fs.writeFileSync(filename, JSON.stringify(provinceGeoJSON));
        
        const fileSize = fs.statSync(filename).size / 1024 / 1024;
        console.log(`Created ${filename} (${fileSize.toFixed(2)} MB) with ${provinceFeatures.length} features`);
    } else {
        console.log(`No features found for province ${abbr}`);
    }
});

console.log('Done splitting provinces!');