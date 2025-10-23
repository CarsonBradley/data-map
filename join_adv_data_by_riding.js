const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Get year from command line argument
const year = process.argv[2] || '2021';

console.log(`Processing ${year} advance poll data...`);

const boundariesPath = `election_boundaries_19-25/${year}_boundaries/geojson/${year}_adv_wgs84.json`;
const pollDataDir = `election_data_19-25/results_${year}/poll_${year}`;
const outputDir = `election_boundaries_19-25/${year}_boundaries/geojson/adv_by_riding`;

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Loading advance poll boundaries...');
const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));

// Group boundaries by riding
const ridingBoundaries = new Map();
boundaries.features.forEach(feature => {
    // Handle both FED_NUM (2021) and FEDNUM (2019)
    const fedNum = feature.properties.FED_NUM || feature.properties.FEDNUM;
    if (!ridingBoundaries.has(fedNum)) {
        ridingBoundaries.set(fedNum, []);
    }
    ridingBoundaries.get(fedNum).push(feature);
});

console.log(`Found ${ridingBoundaries.size} ridings with advance poll boundaries`);

// Process each riding
let processedCount = 0;
const pollFiles = fs.readdirSync(pollDataDir).filter(f => f.endsWith('.csv'));

console.log(`Processing ${pollFiles.length} poll data files...`);

pollFiles.forEach((fileName, index) => {
    const ridingCode = fileName.match(/(\d+)\.csv$/)[1];
    const fedNum = parseInt(ridingCode);

    if (!ridingBoundaries.has(fedNum)) {
        return;
    }

    const advResults = new Map(); // Map of advance poll number to results
    const filePath = path.join(pollDataDir, fileName);

    // Read the CSV file for this riding
    const rows = [];
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', () => {
            // First pass: track merged polls
            const mergedPolls = new Map(); // Maps merged poll number -> target poll number
            rows.forEach(row => {
                const mergeWith = row['Merge With/Fusionné avec']?.trim();
                if (mergeWith && mergeWith !== '') {
                    const pollNumStr = row['Polling Station Number/Numéro du bureau de scrutin']?.trim();
                    const pollNum = parseInt(pollNumStr);
                    const targetPoll = parseInt(mergeWith);
                    mergedPolls.set(pollNum, targetPoll);
                }
            });

            // Second pass: build results for advance polls only (600-699 range)
            rows.forEach(row => {
                const mergeWith = row['Merge With/Fusionné avec']?.trim();
                if (mergeWith && mergeWith !== '') {
                    return; // Skip merged polls
                }

                const pollNumStr = row['Polling Station Number/Numéro du bureau de scrutin']?.trim();
                const pollNum = parseInt(pollNumStr);

                // Only process advance polls (typically 600-699 range)
                if (pollNum < 600 || pollNum >= 700) {
                    return; // Skip non-advance polls
                }

                // If this advance poll doesn't exist yet, create it
                if (!advResults.has(pollNum)) {
                    advResults.set(pollNum, {
                        advPollNumber: pollNum,
                        pollName: row['Polling Station Name/Nom du bureau de scrutin'],
                        rejected: parseInt(row['Rejected Ballots for Polling Station/Bulletins rejetés du bureau'] || 0),
                        electors: parseInt(row['Electors for Polling Station/Électeurs du bureau'] || 0),
                        candidates: [],
                        totalVotes: 0,
                        winner: null
                    });
                }
                // Note: Don't update electors for subsequent rows - each row has the same elector count per poll

                const advPoll = advResults.get(pollNum);

                // Parse party - remove French translations
                const partyEng = row['Political Affiliation Name_English/Appartenance politique_Anglais'];
                let party = 'Independent';
                if (partyEng.includes('Liberal')) party = 'Liberal';
                else if (partyEng.includes('Conservative')) party = 'Conservative';
                else if (partyEng.includes('NDP')) party = 'NDP';
                else if (partyEng.includes('Bloc')) party = 'Bloc Québécois';
                else if (partyEng.includes('Green')) party = 'Green';
                else if (partyEng.includes('PPC') || partyEng.includes('People')) party = 'PPC';

                const votes = parseInt(row['Candidate Poll Votes Count/Votes du candidat pour le bureau'] || 0);
                const firstName = row['Candidate\'s First Name/Prénom du candidat'];
                const middleName = row['Candidate\'s Middle Name/Second prénom du candidat'];
                const lastName = row['Candidate\'s Family Name/Nom de famille du candidat'];
                const candidateName = [firstName, middleName, lastName].filter(n => n).join(' ');

                const isElected = row['Elected Candidate Indicator/Indicateur du candidat élu'] === 'Y';

                const candidate = {
                    name: candidateName,
                    party: party,
                    votes: votes,
                    isWinner: isElected
                };

                advPoll.candidates.push(candidate);
                advPoll.totalVotes += votes;

                if (isElected) {
                    advPoll.winner = {
                        name: candidateName,
                        party: party,
                        votes: votes
                    };
                }
            });

            // Calculate percentages and determine winners if not marked
            advResults.forEach(advPoll => {
                advPoll.candidates.forEach(candidate => {
                    candidate.percentage = advPoll.totalVotes > 0 ?
                        ((candidate.votes / advPoll.totalVotes) * 100).toFixed(1) : 0;
                });

                // If no winner marked, find the one with most votes
                if (!advPoll.winner && advPoll.candidates.length > 0) {
                    const topCandidate = advPoll.candidates.reduce((max, c) =>
                        c.votes > max.votes ? c : max, advPoll.candidates[0]);
                    advPoll.winner = {
                        name: topCandidate.name,
                        party: topCandidate.party,
                        votes: topCandidate.votes,
                        percentage: topCandidate.percentage
                    };
                }

                // Filter out independent candidates with < 5%
                advPoll.candidates = advPoll.candidates.filter(c =>
                    c.party !== 'Independent' || parseFloat(c.percentage) > 5
                );
            });

            // Only create files for ridings that have advance poll data
            if (advResults.size === 0) {
                return; // No advance polls for this riding
            }

            // Create GeoJSON for this riding with advance poll results
            const ridingFeatures = ridingBoundaries.get(fedNum);
            const featuresWithData = [];

            ridingFeatures.forEach(feature => {
                // Handle both property names: ADV_POLL_N (2021) and ADVPDNUM (2019)
                const advPollNumStr = feature.properties.ADV_POLL_N || feature.properties.ADVPDNUM;
                if (!advPollNumStr) return;

                const advPollNum = parseInt(advPollNumStr);
                if (advResults.has(advPollNum)) {
                    feature.properties.advResults = advResults.get(advPollNum);
                    featuresWithData.push(feature);
                }
            });

            // Only write file if we have features with data
            if (featuresWithData.length === 0) {
                return;
            }

            const ridingGeoJSON = {
                type: 'FeatureCollection',
                features: featuresWithData
            };

            // Save to file
            const outputPath = path.join(outputDir, `${fedNum}_${year}_adv.json`);
            fs.writeFileSync(outputPath, JSON.stringify(ridingGeoJSON));

            processedCount++;
            if (processedCount % 50 === 0 || processedCount === pollFiles.length) {
                console.log(`Processed ${processedCount} ridings with advance poll data`);
            }

            // Log summary when done
            if (index === pollFiles.length - 1) {
                setTimeout(() => {
                    console.log(`\n✓ Completed! Generated ${processedCount} advance-poll-by-riding files in ${outputDir}`);
                }, 100);
            }
        });
});
