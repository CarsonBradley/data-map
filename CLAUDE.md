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
./split_provinces_parallel.sh  # Parallel processing version

# Transform coordinate systems and process boundary data from EPSG:3347 to EPSG:4326
node join_data.js
```

## Architecture

### Core Components

1. **StateService** (script.js:16-47): Central state management using a pub/sub pattern
   - Manages province selection, census data, visualization state
   - All UI updates flow through state changes

2. **DataService** (script.js:50-118): Handles data fetching and transformation
   - CSV parsing for census data
   - GeoJSON loading and coordinate transformation
   - Data organization by characteristic groups

3. **MapService** (script.js:120-400): Leaflet map management
   - Boundary rendering (Dissemination Areas and Federal Electoral Districts)
   - Choropleth visualization
   - Layer management and styling

4. **UIService** (script.js:402-600): UI components and interactions
   - Province selection
   - Characteristic dropdown
   - Federal overlay toggle
   - Info panel updates

### Data Structure

- **Boundary Files**:
  - DA boundaries by province: `/new_boundaries/provinces/da_[PRUID]_[ABBR].geojson`
  - Federal electoral boundaries: `/boundaries/fed_2023_boundaries.geojson`
  - Source boundaries in `/boundaries/` and `/new_boundaries/` directories
  - Split by province to reduce file size and improve load times
  - Original coordinate system: EPSG:3347 (Statistics Canada Lambert)
  - Can be transformed to EPSG:4326 (WGS84) via preprocessing or at runtime

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
- The coordinate transformation from Statistics Canada Lambert (EPSG:3347) to WGS84 (EPSG:4326) can happen:
  - During preprocessing via `join_data.js` (recommended for production)
  - At runtime via `DataService.transformGeoJSON()` (currently used for new_boundaries)
- **Leaflet Layer Panes**: Custom z-index stacking controls layer order:
  - `base` (z-index 200): Base map tiles without labels
  - `choroplethPane` (z-index 450): Census data visualization layer
  - `federalOverlay` (z-index 475): Federal electoral boundaries overlay
  - `labels` (z-index 500): Map labels on top of everything
- Average/median characteristics only show "Total Count" display type (percentages don't make sense)

### Data Processing Scripts

- **join_data.js**: Transforms coordinate systems and processes boundary data from EPSG:3347 to EPSG:4326 using streaming JSON processing
- **joining/split_provinces.js**: Basic version that splits large national GeoJSON files by province (loads entire file into memory)
- **joining/split_provinces_stream.js**: Streaming version for handling very large files without memory issues
- **joining/split_provinces_parallel.sh**: Parallel processing version using bash for faster execution
- All scripts filter features by PRUID (province code) and create separate files per province

### File Structure

- **Root files**: index.html (main entry), script.js (application logic), styles.css (styling)
- **Boundary data**:
  - `/boundaries/provinces/` - Original boundary files by province
  - `/new_boundaries/provinces/` - Fine-grained boundary files
  - Large national files in root (canada_da_*.geojson)
- **Census data**: `/output_data/provinces/` - CSV files with demographic data by province
- **Processing scripts**: `/joining/` - Node.js scripts for data transformation

### UI Patterns

- Loading states managed through StateService with visual feedback
- Error handling displays user-friendly messages
- Responsive design with collapsible control panel
- Color gradients for data visualization use a diverging scale