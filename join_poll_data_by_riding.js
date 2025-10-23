const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Get year from command line argument
const year = process.argv[2] || '2021';

console.log(`Processing ${year} poll-by-poll data...`);

const boundariesPath = `election_boundaries_19-25/${year}_boundaries/geojson/${year}_poll_wgs84.json`;
const pollDataDir = `election_data_19-25/results_${year}/poll_${year}`;
const outputDir = `election_boundaries_19-25/${year}_boundaries/geojson/poll_by_riding`;

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Loading poll boundaries...');
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

console.log(`Found ${ridingBoundaries.size} ridings with poll boundaries`);

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

    const pollResults = new Map(); // Map of poll number to results
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

            // Second pass: build results for active (non-merged) polls
            rows.forEach(row => {
                const mergeWith = row['Merge With/Fusionné avec']?.trim();
                if (mergeWith && mergeWith !== '') {
                    return; // Skip merged polls for now
                }

                const pollNumStr = row['Polling Station Number/Numéro du bureau de scrutin']?.trim();
                const pollNum = parseInt(pollNumStr); // Base number for matching boundaries

                // If this poll doesn't exist yet, create it
                if (!pollResults.has(pollNum)) {
                    pollResults.set(pollNum, {
                        pollNumber: pollNum,
                        pollName: row['Polling Station Name/Nom du bureau de scrutin'],
                        rejected: parseInt(row['Rejected Ballots for Polling Station/Bulletins rejetés du bureau'] || 0),
                        electors: parseInt(row['Electors for Polling Station/Électeurs du bureau'] || 0),
                        candidates: [],
                        totalVotes: 0,
                        winner: null
                    });
                }
                // Note: Don't update electors for subsequent rows - each row has the same elector count per poll

                const poll = pollResults.get(pollNum);

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

                // NOTE: Do NOT use 'Elected Candidate Indicator' for poll winners!
                // That field indicates who won the RIDING, not who won THIS POLL.
                // We'll determine poll winners by vote count after processing all candidates.

                const candidate = {
                    name: candidateName,
                    party: party,
                    votes: votes,
                    isWinner: false  // Will be set after determining actual poll winner
                };

                poll.candidates.push(candidate);
                poll.totalVotes += votes;
            });

            // Calculate percentages and determine winners by vote count at each poll
            pollResults.forEach(poll => {
                // Calculate percentages
                poll.candidates.forEach(candidate => {
                    candidate.percentage = poll.totalVotes > 0 ?
                        ((candidate.votes / poll.totalVotes) * 100).toFixed(1) : '0.0';
                });

                // Find the candidate with the most votes at THIS POLL
                if (poll.candidates.length > 0) {
                    const topCandidate = poll.candidates.reduce((max, c) =>
                        c.votes > max.votes ? c : max, poll.candidates[0]);

                    // Mark the winner
                    topCandidate.isWinner = true;
                    poll.winner = {
                        name: topCandidate.name,
                        party: topCandidate.party,
                        votes: topCandidate.votes,
                        percentage: topCandidate.percentage
                    };
                }

                // Filter out independent candidates with < 5%
                poll.candidates = poll.candidates.filter(c =>
                    c.party !== 'Independent' || parseFloat(c.percentage) > 5
                );
            });

            // Create GeoJSON for this riding with poll results
            // Only include features that have matching poll data (exclude merged polls)
            const ridingFeatures = ridingBoundaries.get(fedNum);
            const featuresWithData = [];

            ridingFeatures.forEach(feature => {
                // Handle both PD_NUM (2021) and PDNUM (2019)
                const pdNum = feature.properties.PD_NUM || feature.properties.PDNUM;
                if (pollResults.has(pdNum)) {
                    feature.properties.pollResults = pollResults.get(pdNum);
                    featuresWithData.push(feature); // Only include if it has data
                }
            });

            const ridingGeoJSON = {
                type: 'FeatureCollection',
                features: featuresWithData // Use filtered list
            };

            // Save to file
            const outputPath = path.join(outputDir, `${fedNum}_${year}_poll.json`);
            fs.writeFileSync(outputPath, JSON.stringify(ridingGeoJSON));

            processedCount++;
            if (processedCount % 50 === 0 || processedCount === pollFiles.length) {
                console.log(`Processed ${processedCount}/${pollFiles.length} ridings`);
            }

            // Log summary when done
            if (processedCount === pollFiles.length) {
                console.log(`\n✓ Completed! Generated ${processedCount} poll-by-riding files in ${outputDir}`);
            }
        });
});
