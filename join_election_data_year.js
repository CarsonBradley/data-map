const fs = require('fs');
const csv = require('csv-parser');

// Get year from command line argument, default to 2021
const year = process.argv[2] || '2021';

console.log(`Processing ${year} election results...`);

// Read the riding boundaries for the specified year
const boundariesPath = `election_boundaries_19-25/${year}_boundaries/geojson/${year}_riding_wgs84.json`;
const csvPath = `election_data_19-25/results_${year}/riding_${year}.csv`;
const outputPath = `election_boundaries_19-25/${year}_boundaries/geojson/${year}_riding_with_results.json`;

console.log(`Loading ${year} riding boundaries...`);
const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));

// Create a map of riding results
const ridingResults = new Map();

console.log(`Parsing ${year} election results...`);

// Read the election results CSV
fs.createReadStream(csvPath)
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

        // Parse party from candidate field and remove French translations
        let party = 'Independent';
        if (candidateField.includes('Liberal')) party = 'Liberal';
        else if (candidateField.includes('Conservative')) party = 'Conservative';
        else if (candidateField.includes('NDP-New Democratic Party')) party = 'NDP';
        else if (candidateField.includes('Bloc Québécois')) party = 'Bloc Québécois';
        else if (candidateField.includes('Green Party')) party = 'Green';
        else if (candidateField.includes('People\'s Party - PPC')) party = 'PPC';

        // The actual winner has the "Majority" field populated (not empty)
        const marginStr = row['Majority/Majorité']?.replace(/,/g, '').trim();
        const marginPercentStr = row['Majority Percentage/Pourcentage de majorité']?.trim();
        const isActualWinner = marginStr && marginStr !== '';

        // Extract clean candidate name (remove ** and any party text after it)
        let candidateName = candidateField.split('**')[0].trim();
        // Remove party affiliation if it's in the name field
        const partyPatterns = ['Liberal', 'Conservative', 'NDP', 'Bloc', 'Green', 'People\'s Party', 'PPC', 'Independent'];
        partyPatterns.forEach(pattern => {
            const regex = new RegExp(`\\s+${pattern}.*$`, 'i');
            candidateName = candidateName.replace(regex, '').trim();
        });

        const candidate = {
            name: candidateName,
            party: party,
            votes: votes,
            percentage: percentage,
            isWinner: isActualWinner
        };

        // Only include independent candidates if they have > 5% of vote
        if (party !== 'Independent' || percentage > 5) {
            riding.candidates.push(candidate);
        }

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
            // Handle both FED_NUM (2021) and FEDNUM (2019) property names
            const fedNum = feature.properties.FED_NUM || feature.properties.FEDNUM;
            if (ridingResults.has(fedNum)) {
                feature.properties.electionResults = ridingResults.get(fedNum);
                // Normalize the property name to FED_NUM for consistency
                if (!feature.properties.FED_NUM) {
                    feature.properties.FED_NUM = fedNum;
                }
                // Normalize riding name property
                if (!feature.properties.ED_NAMEE && feature.properties.ENNAME) {
                    feature.properties.ED_NAMEE = feature.properties.ENNAME;
                    feature.properties.ED_NAMEF = feature.properties.FRNAME;
                }
                matched++;
            } else {
                const ridingName = feature.properties.ED_NAMEE || feature.properties.ENNAME || 'Unknown';
                console.log(`Warning: No results found for riding ${fedNum} (${ridingName})`);
                unmatched++;
            }
        });

        console.log(`Matched: ${matched} ridings, Unmatched: ${unmatched} ridings`);

        // Write the combined data
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

        console.log(`\n${year} Election - Seats by party:`);
        Object.entries(partyWins).sort((a, b) => b[1] - a[1]).forEach(([party, seats]) => {
            console.log(`  ${party}: ${seats} seats`);
        });
    });
