// --- join_data.js (FINAL, LEAN VERSION) ---
const BOUNDARIES_PATH = '/Users/carsonbradley/Desktop/data_tiles_map/new_boundaries/lda_000b21a_e.geojson';
const OUTPUT_PATH = 'canada_da_boundaries_wgs84.geojson'; // New, clean output file

const fs = require('fs');
const { pipeline } = require('stream/promises');
const proj4 = require('proj4');
const { parser } = require('stream-json');
const { pick } = require('stream-json/filters/Pick');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { Transform } = require('stream');

proj4.defs('EPSG:3347', '+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +ellps=GRS80 +datum=NAD83 +units=m +no_defs');
const sourceProjection = 'EPSG:3347';
const destProjection = 'EPSG:4326';

const transformCoords = (coords) => {
    if (typeof coords[0] !== 'number') {
        coords.forEach(transformCoords);
    } else {
        const [lon, lat] = proj4(sourceProjection, destProjection, coords);
        coords[0] = lon;
        coords[1] = lat;
    }
};

const run = async () => {
    console.log(`Processing and reprojecting ${BOUNDARIES_PATH}...`);
    let featuresProcessed = 0;
    let isFirstFeature = true;
    const outputStream = fs.createWriteStream(OUTPUT_PATH);
    outputStream.write('{"type":"FeatureCollection","name":"DAs_WGS84","crs":{"type":"name","properties":{"name":"urn:ogc:def:crs:OGC:1.3:CRS84"}},"features":[');

    const featureProcessor = new Transform({
        writableObjectMode: true,
        transform(data, encoding, callback) {
            featuresProcessed++;
            const feature = data.value;
            if (feature.geometry && feature.geometry.coordinates) {
                transformCoords(feature.geometry.coordinates);
            }
            const prefix = isFirstFeature ? '' : ',';
            isFirstFeature = false;
            this.push(prefix + JSON.stringify(feature));
            callback();
        }
    });

    await pipeline(
        fs.createReadStream(BOUNDARIES_PATH),
        parser(),
        pick({ filter: 'features' }),
        streamArray(),
        featureProcessor,
        outputStream,
        { end: false }
    );

    outputStream.end(']}');
    console.log(`\nFinished! Processed and reprojected a total of ${featuresProcessed} features.`);
    console.log(`Clean boundary file saved to: ${OUTPUT_PATH}`);
};

run().catch(error => console.error("An error occurred:", error));