# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Canadian demographics visualization web application that displays 2021 census data and federal election results (2019, 2021, 2025) on an interactive map. It's built with vanilla JavaScript and uses Leaflet.js for mapping functionality. The application features three distinct modes: Census Mode for demographic data, Election Mode for national riding results, and Poll View Mode for province-level year-over-year election comparisons at the polling station level.

## Technology Stack

- **Frontend**: Pure JavaScript (no framework), HTML5, CSS3
- **Mapping**: Leaflet.js v1.9.4
- **Data Processing**: PapaParse for CSV parsing
- **Coordinate Projection**: Proj4js and Proj4Leaflet (converts from EPSG:3347 to EPSG:4326)
- **Dependencies**: All loaded via CDN in index.html
- **Backend**: Node.js script for data preprocessing only

## Commands

### Running the Application
```bash
# No build process required - serve static files with any HTTP server
# Examples:
python -m http.server 8000
# or
npx http-server
# or
open index.html  # Opens directly in browser (may have CORS issues with local files)
```

### Data Preprocessing
```bash
# Install Node.js dependencies for data processing scripts
npm install

# Split large GeoJSON boundary files by province (only needed if source data changes)
cd joining
node split_provinces.js        # Basic version
node split_provinces_stream.js # Streaming version for very large files
./split_provinces_parallel.sh  # Parallel processing version using jq

# Transform coordinate systems from EPSG:3347 to EPSG:4326
node transform_provinces.js         # Transform province boundary files
node transform_election_boundaries.js  # Transform election boundaries (2019, 2021, 2025)
# or
node join_data.js                   # Alternative transformation script

# Join election results with boundaries
node join_election_data_year.js 2019  # Join 2019 election results
node join_election_data_year.js 2021  # Join 2021 election results

# Split poll boundaries by riding for drill-down views
node join_poll_data_by_riding.js 2019  # Create per-riding poll files for 2019
node join_poll_data_by_riding.js 2021  # Create per-riding poll files for 2021

# Split advance poll boundaries by riding for drill-down views
node join_adv_data_by_riding.js 2019   # Create per-riding advance poll files for 2019
node join_adv_data_by_riding.js 2021   # Create per-riding advance poll files for 2021

# Generate province-level poll files for Poll View mode
node split_polls_by_province.js 2019   # Split 2019 polls by province
node split_polls_by_province.js 2021   # Split 2021 polls by province
node split_polls_by_province.js 2025   # Split 2025 polls by province

# Merge election results into province-level poll files
node merge_poll_results_to_provinces.js 2019  # Merge 2019 results into province files
node merge_poll_results_to_provinces.js 2021  # Merge 2021 results into province files

# Create placeholder files for 2025 (boundaries without election results - displays grey)
node create_2025_riding_placeholder.js         # Create 2025 riding file with empty results
node add_2025_poll_placeholders.js             # Add empty pollResults to 2025 province poll files
```

## Architecture

The application operates in three distinct modes:
1. **Census Mode**: Province-based visualization of 2021 census data with DA and Federal Electoral District boundaries
2. **Election Mode**: National visualization of 2019/2021 federal election results with riding-level and poll-level views
3. **Poll View Mode**: Province-level comparison of polling station results across 2019, 2021, and 2025 elections for year-over-year analysis

### Core Components

1. **CacheService** ([script.js:16-132](script.js#L16-L132)): IndexedDB caching layer
   - Stores parsed CSV and GeoJSON data
   - Dramatically reduces load times on repeat visits
   - Gracefully degrades if IndexedDB unavailable
   - Access via `window.CensusApp.clearCache()` in console for debugging

2. **StateService** ([script.js:135-166](script.js#L135-L166)): Central state management using pub/sub pattern
   - Manages province selection, census data, visualization state
   - All UI updates flow through state changes via `setState()`
   - Components subscribe to state changes with `subscribe(listener)`

3. **DataService** ([script.js:169-280](script.js#L169-L280)): Handles data fetching and transformation
   - CSV parsing for census data with PapaParse
   - GeoJSON loading with optional runtime coordinate transformation
   - Data organization by characteristic groups (1=Age, 2=Housing, 3=Income, etc.)
   - `calculateVisualizationData()` computes min/max values and creates value maps for choropleth rendering

4. **MapService** ([script.js:283-529](script.js#L283-L529)): Leaflet map management
   - Boundary rendering (Dissemination Areas and Federal Electoral Districts)
   - Choropleth visualization with Plasma color palette
   - Layer management using custom panes for z-index control
   - Interactive popups with census data on click

5. **UIManager** ([script.js:532-806](script.js#L532-L806)): UI components and interactions
   - Province selection grid
   - Characteristic dropdown population
   - Federal overlay toggle
   - Info panel and legend rendering
   - Loading state management

### Data Structure

- **Boundary Files**:
  - DA boundaries by province: `/new_boundaries/provinces/da_[PRUID]_[ABBR]_wgs84.geojson`
  - Federal electoral boundaries: `/boundaries/fed_2023_boundaries.geojson`
  - Election boundaries (2019, 2021, 2025):
    - Riding level: `/election_boundaries_19-25/[YEAR]_boundaries/geojson/[YEAR]_riding_wgs84.json`
    - Poll level: `/election_boundaries_19-25/[YEAR]_boundaries/geojson/[YEAR]_poll_wgs84.json`
    - Advanced poll: `/election_boundaries_19-25/[YEAR]_boundaries/geojson/[YEAR]_adv_wgs84.json`
    - Poll by riding: `/election_boundaries_19-25/[YEAR]_boundaries/geojson/poll_by_riding/[FED_NUM]_[YEAR]_poll.json`
    - Advance polls by riding: `/election_boundaries_19-25/[YEAR]_boundaries/geojson/adv_by_riding/[FED_NUM]_[YEAR]_adv.json`
  - Source boundaries in `/boundaries/` and `/new_boundaries/` directories
  - Split by province to reduce file size and improve load times
  - Original coordinate system: EPSG:3347 (Statistics Canada Lambert)
  - Transformed to EPSG:4326 (WGS84) via preprocessing scripts

- **Census Data**:
  - DA data by province: `/output_data/provinces/da_[PRUID]_[ABBR]_data.csv`
  - Federal electoral data: `/output_data/filtered_fed_data.csv`
  - Columns: DGUID (or FED_NUM), CHARACTERISTIC_GROUP, CHARACTERISTIC_ID, CHARACTERISTIC_NAME, C1_COUNT_TOTAL, C10_RATE_TOTAL
  - Organized by characteristic groups: 1=Age, 2=Housing, 3=Income, 4=Language, 5=Ethnicity, 6=Religion, 7=Education, 8=Commute

- **Election Data**:
  - Riding results: `/election_boundaries_19-25/[YEAR]_boundaries/geojson/[YEAR]_riding_with_results_min.json`
  - Poll results: Embedded in `electionResults` property of each feature
  - Structure includes: `ridingNumber`, `ridingName`, `candidates[]`, `totalVotes`, `winner` (with `party`, `votes`, `percentage`, `margin`, `marginPercent`)
  - Raw CSV data: `/election_data_19-25/results_[YEAR]/riding_[YEAR].csv` and `/election_data_19-25/results_[YEAR]/poll_[YEAR]/[FED_NUM].csv`

### Key Implementation Details

- The app uses a functional architecture with service objects rather than classes
- All map features are styled dynamically based on census data values using a "Plasma" color palette
- Province boundaries are loaded on-demand to improve performance
- Federal electoral district overlay can be toggled without reloading province data
- The coordinate transformation from Statistics Canada Lambert (EPSG:3347) to WGS84 (EPSG:4326) happens:
  - During preprocessing via `transform_provinces.js` (recommended for production)
  - Can also happen at runtime via `DataService.transformGeoJSON()` for legacy data
- **Leaflet Layer Panes**: Custom z-index stacking controls layer order:
  - `base` (z-index 200): Base map tiles without labels
  - `choroplethPane` (z-index 450): Census data visualization layer
  - `federalOverlay` (z-index 475): Federal electoral boundaries overlay
  - `labels` (z-index 500): Map labels on top of everything
- Average/median characteristics only show "Total Count" display type (percentages don't make sense)
- Join keys: DA boundaries use `DGUID` property, Federal boundaries extract `FED_NUM` from the `description` field

### Election Visualization Features

The application includes a comprehensive election results visualization system:

**Election Mode (National View):**
- **Multi-year Support**: Toggle between 2019 and 2021 federal election results
- **Three-level View**:
  - **Riding View**: Shows all 338 federal electoral districts colored by winning party
  - **Poll View**: Drill down into individual ridings to see poll-by-poll results (election day polls)
  - **Advance View**: Drill down into individual ridings to see advance poll results
- **Interactive Elements**:
  - Click riding to view detailed results in info panel
  - Click "Poll" button to load granular poll boundaries (election day voting)
  - Click "Advance" button to load advance poll boundaries (early voting locations)
  - Toggle between years preserves current view (riding, poll, or advance)
  - Automatic party color coding (Liberal=red, Conservative=blue, NDP=orange, Bloc=cyan, Green=green, PPC=purple)
  - Color intensity reflects margin of victory within each poll/advance poll
- **State Management**: Election state tracked via `showingElections`, `currentElectionYear`, `currentViewLevel` ('riding', 'poll', or 'advance'), `currentRidingNumber`
- **Data Loading**: Poll and advance poll boundaries loaded on-demand per riding (files in `poll_by_riding/` and `adv_by_riding/` folders) to optimize performance

**Poll View Mode (Province-Level Comparison):**
- **Purpose**: Enables year-over-year comparison of election results at the polling station level within a single province
- **Multi-year Support**: Toggle between 2019, 2021, and 2025 federal election results
- **Key Feature**: Since poll boundaries remain geographically consistent across election years, users can observe electoral shifts at specific voting locations over time
- **Province Selection**: Dedicated province selector for choosing which province's polls to view
- **Data Structure**: Poll data pre-grouped by province for fast loading (files in `poll_by_province/` folders)
- **Performance**: Significantly faster than loading national poll data (~30-100 MB per province vs. 424 MB national file)
- **2025 Support**: Poll boundaries are available for 2025; election results can be added when available
- **State Management**: Poll View state tracked via `showingPollView`, `pollViewProvinceId`, `pollViewYear`, `pollViewData`
- **Interactive Elements**: Click individual polls to view detailed results; toggle years while maintaining current map view

### Data Processing Scripts

**Census Data Processing:**
- **transform_provinces.js**: Transforms province boundary files from EPSG:3347 to EPSG:4326, processing each province file individually. Works for files up to ~100MB. Modify the `provinces` object to transform specific provinces only.
- **transform_large.js**: Handles larger files (100MB-400MB) using increased Node.js memory allocation. Run with: `node --max-old-space-size=8192 transform_large.js <code> <abbr>`
- **transform_python.py**: Python-based transformer for very large files (400MB+). Requires `pip3 install pyproj`. Run with: `python3 transform_python.py <code> <abbr>`
- **join_data.js**: Alternative transformation script using streaming JSON processing for large files
- **joining/split_provinces.js**: Basic version that splits large national GeoJSON files by province (loads entire file into memory)
- **joining/split_provinces_stream.js**: Streaming version for handling very large files without memory issues
- **joining/split_provinces_parallel.sh**: Parallel processing version using `jq` and bash for fastest execution
- All scripts filter features by PRUID (province code) and create separate files per province

**Election Data Processing:**
- **transform_election_boundaries.js**: Transforms election boundary files (riding, poll, advanced poll) for 2019, 2021, and 2025 from EPSG:3347 to EPSG:4326. Processes all years and types in one run.
- **join_election_data_year.js**: Joins election results CSV data with riding boundaries. Takes year as argument (2019 or 2021). Parses candidate data, identifies winners, normalizes party names, creates `_riding_with_results.json` output.
- **join_poll_data_by_riding.js**: Splits poll-level boundaries and results by riding to create per-riding files for drill-down views. Takes year as argument. Creates one JSON file per riding in `poll_by_riding/` directory. Filters for regular polling stations (poll numbers < 600).
- **join_adv_data_by_riding.js**: Splits advance poll boundaries and results by riding to create per-riding files for advance voting visualization. Takes year as argument. Creates one JSON file per riding in `adv_by_riding/` directory. Filters for advance polls only (poll numbers 600-699 range). Handles both 2019 (`ADVPDNUM`, `FEDNUM`) and 2021 (`ADV_POLL_N`, `FED_NUM`) property naming conventions.

**Poll View Data Processing:**
- **split_polls_by_province.js**: Groups poll boundaries by province for Poll View mode. Takes year as argument (2019, 2021, or 2025). Extracts province code (PRUID) from first 2 digits of FED_NUM property. Creates one JSON file per province in `poll_by_province/` directory. Significantly reduces file sizes compared to national file (~30-100 MB per province vs. 424 MB national).
- **merge_poll_results_to_provinces.js**: Merges election results from `poll_by_riding/` files into province-level poll files. Takes year as argument (2019 or 2021). Builds a map of all poll results by FED_NUM and PD_NUM, then merges into corresponding province files. Must be run after `split_polls_by_province.js` and requires `poll_by_riding/` files to exist.

**2025 Placeholder Data Processing:**
- **create_2025_riding_placeholder.js**: Creates placeholder riding file for 2025 with boundaries but empty election results. Reads `2025_riding_wgs84.json` and adds empty `electionResults` structure to each feature. Output file: `2025_riding_with_results_min.json`. Ridings display in grey until actual election results are added. Run once when 2025 boundaries are available.
- **add_2025_poll_placeholders.js**: Adds empty `pollResults` property to all 2025 province poll files. Processes all files in `poll_by_province/` directory ending in `_2025_poll.json`. Each poll gets empty candidates array and null winner. Polls display in grey until actual election results are merged. Run after `split_polls_by_province.js 2025`.

### File Structure

- **Root files**: [index.html](index.html) (main entry), [script.js](script.js) (application logic), [styles.css](styles.css) (styling)
- **Boundary data**:
  - `/boundaries/` - Original boundary files
  - `/boundaries/provinces/` - Original boundary files by province
  - `/new_boundaries/` - Source files for fine-grained DA boundaries
  - `/new_boundaries/provinces/` - Fine-grained DA boundary files by province (transformed to WGS84)
  - Large national files in root (canada_da_*.geojson)
- **Census data**: `/output_data/provinces/` - CSV files with demographic data by province
- **Election data**:
  - `/election_boundaries_19-25/[YEAR]_boundaries/` - Boundary files by year
    - `geojson/` - Contains riding, poll, and advanced poll boundaries (both original and _wgs84 versions)
    - `geojson/poll_by_riding/` - Per-riding poll boundary files for drill-down views (election day polls)
    - `geojson/adv_by_riding/` - Per-riding advance poll boundary files for drill-down views (advance voting locations)
    - `geojson/poll_by_province/` - Per-province poll boundary files for Poll View mode (format: `[PRUID]_[ABBR]_[YEAR]_poll.json`)
  - `/election_data_19-25/results_[YEAR]/` - Raw election result CSV files
    - `riding_[YEAR].csv` - Riding-level results
    - `poll_[YEAR]/` - Poll-level results (one CSV per riding, includes both regular and advance poll data)
- **Processing scripts**: Root directory and `/joining/` - Node.js and bash scripts for data transformation

### UI Patterns

- Loading states managed through StateService with visual feedback
- Error handling displays user-friendly messages
- Responsive design with collapsible control panel
- Color gradients for data visualization use a perceptually uniform "Plasma" scale for accessibility
- Panel can be opened/closed with buttons, state tracked in StateService
- Province selection returns user to welcome screen and resets state

### Province Codes

All province/territory codes (PRUID values) used in the application:
- 10: Newfoundland and Labrador (NL)
- 11: Prince Edward Island (PE)
- 12: Nova Scotia (NS)
- 13: New Brunswick (NB)
- 24: Quebec (QC)
- 35: Ontario (ON) - Large file: 585MB
- 46: Manitoba (MB)
- 47: Saskatchewan (SK)
- 48: Alberta (AB)
- 59: British Columbia (BC) - Large file: 379MB
- 60: Yukon (YT)
- 61: Northwest Territories (NT)
- 62: Nunavut (NU) - Large file: 532MB

## Critical Path Notes

### File Path Requirements
**IMPORTANT**: All file paths in [script.js](script.js) must be relative to the root directory (where [index.html](index.html) is located), NOT with `../` prefixes going up a directory. The application is served from the root, so paths should be:
- ✅ CORRECT: `new_boundaries/provinces/da_10_NL_wgs84.geojson`
- ❌ INCORRECT: `../new_boundaries/provinces/da_10_NL_wgs84.geojson`

If provinces fail to load with "Could not load data" errors, check that no `../` prefixes have been added to paths in the `selectProvince` and `loadFederalData` functions.

### Required File Format
The application expects province boundary files to be:
1. Named with `_wgs84` suffix: `da_[PRUID]_[ABBR]_wgs84.geojson`
2. Already transformed to WGS84 (EPSG:4326) coordinate system
3. GeoJSON format with valid `FeatureCollection` structure

If a province fails to load, verify:
- The `_wgs84.geojson` file exists in `new_boundaries/provinces/`
- Coordinates are in WGS84 format (longitude/latitude, e.g., -63.4, 46.2)
- NOT in EPSG:3347 format (large numbers like 8420430, 1659492)

### Transforming Large Province Files
For large provinces (ON, BC, NU), use the appropriate transformation tool:
```bash
# For files < 100MB (NL, PE, NS, NB, QC, MB, SK, AB, YT, NT)
node transform_provinces.js

# For files 100-400MB (BC)
node --max-old-space-size=8192 transform_large.js 59 BC

# For files > 400MB (ON, NU)
pip3 install pyproj
python3 transform_python.py 35 ON
python3 transform_python.py 62 NU
```

## Application State

The StateService manages application state using a pub/sub pattern. Key state properties include:

**Census Mode:**
- `currentProvinceId`: Selected province code (PRUID)
- `provinceGeoData`: Province DA boundaries
- `provinceCensusData`: Province census data
- `federalGeoData`: Federal electoral district boundaries
- `federalCensusData`: Federal census data
- `currentBoundaryType`: 'DA' or 'Federal'
- `showFederalOverlay`: Boolean for federal boundary overlay
- `hasLoadedFederalData`: Boolean tracking if federal data is cached

**Election Mode:**
- `showingElections`: Boolean indicating election mode is active
- `currentElectionYear`: '2019' or '2021'
- `electionData`: GeoJSON with embedded election results
- `currentViewLevel`: 'riding', 'poll', or 'advance'
- `currentRidingNumber`: FED_NUM when in poll or advance view
- `isTogglingElection`: Boolean for year toggle loading state

**Common:**
- `currentVisualization`: Active visualization config (characteristicName, dataType, valueMap, min, max)
- `isPanelOpen`: Control panel visibility
- `isLoading`: Full-screen loading overlay state
- `loadingMessage`: Loading text message