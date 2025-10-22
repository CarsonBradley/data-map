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
    const fedNum = feature.properties.FED_NUM;
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
            // Process all rows
            rows.forEach(row => {
                const pollNumStr = row['Polling Station Number/Numéro du bureau de scrutin']?.trim();
                const pollNum = parseInt(pollNumStr);

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

                const isElected = row['Elected Candidate Indicator/Indicateur du candidat élu'] === 'Y';

                const candidate = {
                    name: candidateName,
                    party: party,
                    votes: votes,
                    isWinner: isElected
                };

                poll.candidates.push(candidate);
                poll.totalVotes += votes;

                if (isElected) {
                    poll.winner = {
                        name: candidateName,
                        party: party,
                        votes: votes
                    };
                }
            });

            // Calculate percentages and determine winners if not marked
            pollResults.forEach(poll => {
                poll.candidates.forEach(candidate => {
                    candidate.percentage = poll.totalVotes > 0 ?
                        ((candidate.votes / poll.totalVotes) * 100).toFixed(1) : 0;
                });

                // If no winner marked, find the one with most votes
                if (!poll.winner && poll.candidates.length > 0) {
                    const topCandidate = poll.candidates.reduce((max, c) =>
                        c.votes > max.votes ? c : max, poll.candidates[0]);
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
            const ridingFeatures = ridingBoundaries.get(fedNum);
            ridingFeatures.forEach(feature => {
                const pdNum = feature.properties.PD_NUM;
                if (pollResults.has(pdNum)) {
                    feature.properties.pollResults = pollResults.get(pdNum);
                }
            });

            const ridingGeoJSON = {
                type: 'FeatureCollection',
                features: ridingFeatures
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
