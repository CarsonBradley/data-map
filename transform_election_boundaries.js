const fs = require('fs');
const path = require('path');
const proj4 = require('proj4');

// Define the Statistics Canada Lambert projection (EPSG:3347)
proj4.defs('EPSG:3347', '+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs');

function transformCoords(coords) {
    if (Array.isArray(coords[0])) {
        coords.forEach(transformCoords);
    } else if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        const [lon, lat] = proj4('EPSG:3347', 'EPSG:4326').forward(coords);
        if (isFinite(lon) && isFinite(lat)) {
            coords[0] = lon;
            coords[1] = lat;
        }
    }
}

const elections = [
    { year: '2019', types: ['riding', 'poll', 'adv'] },
    { year: '2021', types: ['riding', 'poll', 'adv'] },
    { year: '2025', types: ['riding', 'poll', 'adv'] }
];

elections.forEach(({ year, types }) => {
    types.forEach(type => {
        const inputPath = `election_boundaries_19-25/${year}_boundaries/geojson/${year}_${type}.json`;
        const outputPath = `election_boundaries_19-25/${year}_boundaries/geojson/${year}_${type}_wgs84.json`;

        if (fs.existsSync(inputPath)) {
            console.log(`Transforming ${year} ${type} boundaries...`);
            const geoData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

            let featureCount = 0;
            geoData.features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    transformCoords(feature.geometry.coordinates);
                    featureCount++;
                }
            });

            fs.writeFileSync(outputPath, JSON.stringify(geoData));
            console.log(`Saved ${outputPath} (${featureCount} features)`);
        } else {
            console.log(`File not found: ${inputPath}`);
        }
    });
});

console.log('All election boundaries transformed to WGS84.');
