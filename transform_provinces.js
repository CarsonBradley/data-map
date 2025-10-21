const fs = require('fs');
const path = require('path');
const proj4 = require('proj4');

proj4.defs('EPSG:3347', '+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs');

const provinces = {
    '46': 'MB', '47': 'SK', '48': 'AB', '61': 'NT'
};

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

Object.entries(provinces).forEach(([code, abbr]) => {
    const inputPath = `new_boundaries/provinces/da_${code}_${abbr}.geojson`;
    const outputPath = `new_boundaries/provinces/da_${code}_${abbr}_wgs84.geojson`;

    if (fs.existsSync(inputPath)) {
        console.log(`Transforming ${abbr}...`);
        const geoData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        geoData.features.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                transformCoords(feature.geometry.coordinates);
            }
        });
        fs.writeFileSync(outputPath, JSON.stringify(geoData));
        console.log(`Saved ${outputPath}`);
    } else {
        console.log(`File not found: ${inputPath}`);
    }
});

console.log('All provinces transformed to WGS84.');