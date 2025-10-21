const fs = require('fs');
const proj4 = require('proj4');

proj4.defs('EPSG:3347', '+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs');

const transformer = proj4('EPSG:3347', 'EPSG:4326');

function transformCoords(coords) {
    if (Array.isArray(coords[0])) {
        coords.forEach(transformCoords);
    } else if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        const [lon, lat] = transformer.forward(coords);
        if (isFinite(lon) && isFinite(lat)) {
            coords[0] = lon;
            coords[1] = lat;
        }
    }
}

const [code, abbr] = process.argv.slice(2);
if (!code || !abbr) {
    console.error('Usage: node transform_large.js <code> <abbr>');
    process.exit(1);
}

const inputPath = `new_boundaries/provinces/da_${code}_${abbr}.geojson`;
const outputPath = `new_boundaries/provinces/da_${code}_${abbr}_wgs84.geojson`;

console.log(`Transforming ${abbr}...`);
console.log('Reading file...');

const content = fs.readFileSync(inputPath, 'utf8');
console.log('Parsing JSON...');
const geoData = JSON.parse(content);

console.log(`Transforming ${geoData.features.length} features...`);
let count = 0;
geoData.features.forEach(feature => {
    if (feature.geometry && feature.geometry.coordinates) {
        transformCoords(feature.geometry.coordinates);
    }
    count++;
    if (count % 1000 === 0) {
        process.stdout.write(`\r  Progress: ${count}/${geoData.features.length}`);
    }
});
console.log(`\n  Transformed all features`);

console.log('Writing output...');
fs.writeFileSync(outputPath, JSON.stringify(geoData));
console.log(`Saved ${outputPath}`);
