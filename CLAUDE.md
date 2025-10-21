# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Canadian demographics visualization web application that displays 2021 census data on an interactive map. It's built with vanilla JavaScript and uses Leaflet.js for mapping functionality.

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
node transform_provinces.js    # Transform province boundary files
# or
node join_data.js              # Alternative transformation script
```

## Architecture

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
  - Source boundaries in `/boundaries/` and `/new_boundaries/` directories
  - Split by province to reduce file size and improve load times
  - Original coordinate system: EPSG:3347 (Statistics Canada Lambert)
  - Transformed to EPSG:4326 (WGS84) via preprocessing scripts

- **Census Data**:
  - DA data by province: `/output_data/provinces/da_[PRUID]_[ABBR]_data.csv`
  - Federal electoral data: `/output_data/filtered_fed_data.csv`
  - Columns: DGUID (or FED_NUM), CHARACTERISTIC_GROUP, CHARACTERISTIC_ID, CHARACTERISTIC_NAME, C1_COUNT_TOTAL, C10_RATE_TOTAL
  - Organized by characteristic groups: 1=Age, 2=Housing, 3=Income, 4=Language, 5=Ethnicity, 6=Religion, 7=Education, 8=Commute

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

### Data Processing Scripts

- **transform_provinces.js**: Transforms province boundary files from EPSG:3347 to EPSG:4326, processing each province file individually
- **join_data.js**: Alternative transformation script using streaming JSON processing for large files
- **joining/split_provinces.js**: Basic version that splits large national GeoJSON files by province (loads entire file into memory)
- **joining/split_provinces_stream.js**: Streaming version for handling very large files without memory issues
- **joining/split_provinces_parallel.sh**: Parallel processing version using `jq` and bash for fastest execution
- All scripts filter features by PRUID (province code) and create separate files per province

### File Structure

- **Root files**: [index.html](index.html) (main entry), [script.js](script.js) (application logic), [styles.css](styles.css) (styling)
- **Boundary data**:
  - `/boundaries/` - Original boundary files
  - `/boundaries/provinces/` - Original boundary files by province
  - `/new_boundaries/` - Source files for fine-grained DA boundaries
  - `/new_boundaries/provinces/` - Fine-grained DA boundary files by province (transformed to WGS84)
  - Large national files in root (canada_da_*.geojson)
- **Census data**: `/output_data/provinces/` - CSV files with demographic data by province
- **Processing scripts**: `/joining/` - Node.js and bash scripts for data transformation

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
- 35: Ontario (ON)
- 46: Manitoba (MB)
- 47: Saskatchewan (SK)
- 48: Alberta (AB)
- 59: British Columbia (BC)
- 60: Yukon (YT)
- 61: Northwest Territories (NT)
- 62: Nunavut (NU)