const fs = require('fs');
const csv = require('csv-parser');

// Read the 2021 riding boundaries
console.log('Loading 2021 riding boundaries...');
const boundaries = JSON.parse(fs.readFileSync('election_boundaries_19-25/2021_boundaries/geojson/2021_riding_wgs84.json', 'utf8'));

// Create a map of riding results
const ridingResults = new Map();

console.log('Parsing 2021 election results...');

// Read the election results CSV
const results = [];
fs.createReadStream('election_data_19-25/results_2021/riding_2021.csv')
    .pipe(csv())
    .on('data', (row) => {
        const fedNum = parseInt(row['Electoral District Number/Numéro de circonscription']);

        if (!ridingResults.has(fedNum)) {
            ridingResults.set(fedNum, {
                ridingNumber: fedNum,
                ridingName: row['Electoral District Name/Nom de circonscription'],
                candidates: [],
                totalVotes: 0,
                winner: null
            });
        }

        const riding = ridingResults.get(fedNum);

        // Extract party from the candidate field (format: "Name ** Party/Parti")
        const candidateField = row['Candidate/Candidat'];
        const votesStr = row['Votes Obtained/Votes obtenus']?.replace(/,/g, '').trim();
        const votes = votesStr ? parseInt(votesStr) : 0;
        const percentageStr = row['Percentage of Votes Obtained /Pourcentage des votes obtenus']?.trim();
        const percentage = percentageStr ? parseFloat(percentageStr) : 0;

        // Parse party from candidate field
        let party = 'Independent';
        if (candidateField.includes('Liberal/Libéral')) party = 'Liberal';
        else if (candidateField.includes('Conservative/Conservateur')) party = 'Conservative';
        else if (candidateField.includes('NDP-New Democratic Party')) party = 'NDP';
        else if (candidateField.includes('Bloc Québécois')) party = 'Bloc Québécois';
        else if (candidateField.includes('Green Party')) party = 'Green';
        else if (candidateField.includes('People\'s Party - PPC')) party = 'PPC';

        // The actual winner has the "Majority" field populated (not empty)
        const marginStr = row['Majority/Majorité']?.replace(/,/g, '').trim();
        const marginPercentStr = row['Majority Percentage/Pourcentage de majorité']?.trim();
        const isActualWinner = marginStr && marginStr !== '';

        const candidate = {
            name: candidateField.split('**')[0].trim(),
            party: party,
            votes: votes,
            percentage: percentage,
            isWinner: isActualWinner
        };

        riding.candidates.push(candidate);
        riding.totalVotes += votes;

        if (isActualWinner) {
            riding.winner = {
                name: candidate.name,
                party: candidate.party,
                votes: candidate.votes,
                percentage: candidate.percentage,
                margin: marginStr ? parseInt(marginStr) : 0,
                marginPercent: marginPercentStr ? parseFloat(marginPercentStr) : 0
            };
        }
    })
    .on('end', () => {
        console.log(`Parsed results for ${ridingResults.size} ridings`);

        // Join the results with the boundaries
        let matched = 0;
        let unmatched = 0;

        boundaries.features.forEach(feature => {
            const fedNum = feature.properties.FED_NUM;
            if (ridingResults.has(fedNum)) {
                feature.properties.electionResults = ridingResults.get(fedNum);
                matched++;
            } else {
                console.log(`Warning: No results found for riding ${fedNum} (${feature.properties.ED_NAMEE})`);
                unmatched++;
            }
        });

        console.log(`Matched: ${matched} ridings, Unmatched: ${unmatched} ridings`);

        // Write the combined data
        const outputPath = 'election_boundaries_19-25/2021_boundaries/geojson/2021_riding_with_results.json';
        fs.writeFileSync(outputPath, JSON.stringify(boundaries, null, 2));
        console.log(`Combined data saved to ${outputPath}`);

        // Print summary statistics
        const partyWins = {};
        boundaries.features.forEach(feature => {
            if (feature.properties.electionResults?.winner) {
                const party = feature.properties.electionResults.winner.party;
                partyWins[party] = (partyWins[party] || 0) + 1;
            }
        });

        console.log('\nSeats by party:');
        Object.entries(partyWins).sort((a, b) => b[1] - a[1]).forEach(([party, seats]) => {
            console.log(`  ${party}: ${seats} seats`);
        });
    });
