const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const JSONStream = require('JSONStream');

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

console.log('Processing large GeoJSON file using streams...');

// Create province boundaries directory
const provinceBoundariesDir = 'new_boundaries/provinces';
if (!fs.existsSync(provinceBoundariesDir)) {
    fs.mkdirSync(provinceBoundariesDir, { recursive: true });
}

// Initialize province file streams
const provinceStreams = {};
const featureCounts = {};

Object.entries(PROVINCES).forEach(([code, abbr]) => {
    const filename = path.join(provinceBoundariesDir, `da_${code}_${abbr}.geojson`);
    const writeStream = fs.createWriteStream(filename);
    writeStream.write('{"type":"FeatureCollection","features":[');
    provinceStreams[code] = writeStream;
    featureCounts[code] = 0;
});

// Create a transform stream to process features
const processFeatures = new Transform({
    objectMode: true,
    transform(feature, encoding, callback) {
        if (feature.properties && feature.properties.PRUID) {
            const pruid = feature.properties.PRUID;
            if (provinceStreams[pruid]) {
                if (featureCounts[pruid] > 0) {
                    provinceStreams[pruid].write(',');
                }
                provinceStreams[pruid].write(JSON.stringify(feature));
                featureCounts[pruid]++;
            }
        }
        callback();
    }
});

// Read and process the file
const readStream = fs.createReadStream('new_boundaries/lda_000b21a_e.geojson');
const parser = JSONStream.parse('features.*');

readStream
    .pipe(parser)
    .pipe(processFeatures)
    .on('finish', () => {
        // Close all province files
        Object.entries(PROVINCES).forEach(([code, abbr]) => {
            provinceStreams[code].write(']}');
            provinceStreams[code].end();
            
            if (featureCounts[code] > 0) {
                const filename = path.join(provinceBoundariesDir, `da_${code}_${abbr}.geojson`);
                const stats = fs.statSync(filename);
                const fileSize = stats.size / 1024 / 1024;
                console.log(`Created ${filename} (${fileSize.toFixed(2)} MB) with ${featureCounts[code]} features`);
            } else {
                // Remove empty files
                const filename = path.join(provinceBoundariesDir, `da_${code}_${abbr}.geojson`);
                fs.unlinkSync(filename);
                console.log(`No features found for province ${abbr}`);
            }
        });
        console.log('Done splitting provinces!');
    })
    .on('error', (error) => {
        console.error('Error processing file:', error);
    });