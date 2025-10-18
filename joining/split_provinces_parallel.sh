#!/bin/bash

# Province codes and abbreviations - using arrays instead of associative array for compatibility
CODES=(10 11 12 13 24 35 46 47 48 59 60 61 62)
ABBRS=(NL PE NS NB QC ON MB SK AB BC YT NT NU)

echo "Processing large GeoJSON file using jq in parallel..."

# Create output directory
mkdir -p new_boundaries/provinces

# Function to process a single province
process_province() {
    local code=$1
    local abbr=$2
    local output_file="new_boundaries/provinces/da_${code}_${abbr}.geojson"
    
    echo "Processing province $abbr (code: $code)..."
    
    # Extract features for this province and create a new GeoJSON
    jq --arg pruid "$code" \
        '{type: "FeatureCollection", features: [.features[] | select(.properties.PRUID == $pruid)]}' \
        new_boundaries/lda_000b21a_e.geojson > "$output_file"
    
    # Check if the file has features
    feature_count=$(jq '.features | length' "$output_file")
    
    if [ "$feature_count" -gt 0 ]; then
        file_size=$(du -h "$output_file" | cut -f1)
        echo "Created $output_file ($file_size) with $feature_count features"
    else
        rm "$output_file"
        echo "No features found for province $abbr"
    fi
}

# Export the function so it can be used by parallel processes
export -f process_province

# Process all provinces in parallel
for i in "${!CODES[@]}"; do
    process_province "${CODES[$i]}" "${ABBRS[$i]}" &
done

# Wait for all background jobs to finish
wait

echo "Done splitting provinces!"