# Canadian Demographics & Election Results Visualization

An interactive web application for visualizing Canadian census data (2021) and federal election results (2019, 2021, 2025) at multiple geographic levels. Explore demographic characteristics and electoral patterns across provinces, ridings, and individual polling stations.

## Features

### Census Demographics Visualization
*   **Interactive Map:** Built with Leaflet.js for seamless pan, zoom, and click interactions
*   **Choropleth Visualization:** Census data displayed with perceptually uniform "Plasma" color palette
*   **Rich Demographics:** Visualize age, housing, income, language, ethnicity, religion, education, and commute data
*   **Dual Boundary Support:** Toggle between Dissemination Area (DA) and Federal Electoral District boundaries
*   **Province-Level Analysis:** Explore data for all 13 provinces and territories

### Election Results Visualization
*   **Hierarchical Geographic Levels:**
    *   **National:** View all 338 federal ridings at once
    *   **Provincial:** Focus on a single province (riding, poll, or advance poll level)
    *   **Single Riding:** Drill down into individual ridings with poll-by-poll analysis
*   **Multi-Year Support:** Toggle between 2019, 2021, and 2025 federal elections
*   **Three Unit Display Types:**
    *   **Riding View:** Electoral district results with winner-takes-all coloring
    *   **Poll View:** Election day polling station results with margin-based color intensity
    *   **Advance View:** Advance polling station results (early voting locations)
*   **Party Analysis:**
    *   Filter by specific political parties (Liberal, Conservative, NDP, Bloc Québécois, Green, PPC)
    *   **Absolute Scale:** Shows actual vote share (0-100%)
    *   **Relative Scale:** Normalizes color intensity to min/max within current geography for enhanced local comparison
*   **Interactive Elements:**
    *   Click any riding/poll/advance poll to see detailed results and candidate breakdown
    *   Bright yellow highlighting of selected boundaries
    *   Pie charts showing vote distribution
    *   Candidate lists with vote counts and percentages
*   **Smart Year Switching:** Automatically handles 2025 boundary changes when switching years at riding level
*   **Seamless Transitions:** Map view stays in place when switching options (year, party, unit display)

### Performance & UX
*   **Client-Side Caching:** IndexedDB caching for instant repeat visits
*   **No Loading Screens:** Smooth, instant transitions between visualizations
*   **View Preservation:** Map stays focused when switching options (except province changes)
*   **Responsive Design:** Works across different screen sizes
*   **Professional Styling:** Polished dropdowns, buttons, and controls

## Data Sources

### Census Data
*   **Source:** Statistics Canada 2021 Census
*   **Format:** CSV files with demographic data organized by characteristic groups
*   **Boundaries:** Dissemination Areas (fine-grained) and Federal Electoral Districts

### Election Data
*   **Source:** Elections Canada
*   **Years:** 2019, 2021, 2025 federal elections
*   **Levels:** Riding-level, poll-level, and advance poll results
*   **Format:** GeoJSON with embedded election results
*   **Data Structure:**
    *   Candidate names, parties, vote counts, and percentages
    *   Winner determination by vote count (not elected indicator)
    *   Margin of victory calculations
    *   Total votes per riding/poll

## Technical Stack

### Frontend
*   **Mapping:** [Leaflet.js](https://leafletjs.com/) v1.9.4 with custom layer panes for z-index control
*   **CSV Parsing:** [PapaParse](https://www.papaparse.com/)
*   **Coordinate Projection:** [Proj4js](https://github.com/proj4js/proj4js) and Proj4Leaflet
*   **State Management:** Custom pub/sub pattern with StateService
*   **Styling:** Custom CSS with CSS variables, Google Fonts (Inter)
*   **Architecture:** Vanilla JavaScript with service-oriented design (MapService, DataService, UIManager)

### Data Processing (Node.js)
*   **Coordinate Transformation:** EPSG:3347 (Statistics Canada Lambert) → EPSG:4326 (WGS84)
*   **Dependencies:** `proj4`, `stream-json`, `csv-parser`
*   **Scripts for:**
    *   Boundary file transformation
    *   Province-level file splitting (performance optimization)
    *   Election results joining
    *   Poll data organization by riding and province

## Key Scripts

### Coordinate Transformation
*   `transform_provinces.js` - Transform DA boundaries for each province (< 100MB files)
*   `transform_large.js` - Transform large province files with increased memory (100-400MB)
*   `transform_python.py` - Python-based transformer for very large files (> 400MB)
*   `transform_election_boundaries.js` - Transform riding, poll, and advance poll boundaries for all years

### Election Data Processing
*   `join_election_data_year.js <year>` - Join election results CSV with riding boundaries
*   `join_poll_data_by_riding.js <year>` - Split poll boundaries/results by riding
*   `join_adv_data_by_riding.js <year>` - Split advance poll boundaries/results by riding
*   `split_polls_by_province.js <year>` - Group polls by province for provincial view
*   `split_adv_by_province.js <year>` - Group advance polls by province
*   `merge_poll_results_to_provinces.js <year>` - Merge poll results into province files
*   `merge_adv_results_to_provinces.js <year>` - Merge advance poll results into province files

### 2025 Data (Placeholder)
*   `create_2025_riding_placeholder.js` - Create 2025 riding file with empty results (grey display)
*   `add_2025_poll_placeholders.js` - Add empty results to 2025 province poll files

### Province Splitting (Census)
*   `joining/split_provinces.js` - Basic version (loads entire file)
*   `joining/split_provinces_stream.js` - Streaming version (memory efficient)
*   `joining/split_provinces_parallel.sh` - Parallel processing with `jq` and bash

## Application Structure

### File Organization
```
/
├── index.html                          # Main entry point
├── script.js                           # Application logic (130KB+)
├── styles.css                          # Styling
├── boundaries/                         # Census boundary files
│   ├── provinces/                      # Original by-province boundaries
│   └── fed_2023_boundaries.geojson    # Federal electoral districts
├── new_boundaries/provinces/           # Fine-grained DA boundaries (WGS84)
├── output_data/provinces/              # Census CSV data by province
├── election_boundaries_19-25/          # Election boundary files
│   ├── 2019_boundaries/geojson/
│   │   ├── 2019_riding_with_results_min.json
│   │   ├── poll_by_riding/             # Per-riding poll files
│   │   ├── adv_by_riding/              # Per-riding advance poll files
│   │   ├── poll_by_province/           # Per-province poll files
│   │   └── adv_by_province/            # Per-province advance poll files
│   ├── 2021_boundaries/geojson/        # (same structure)
│   └── 2025_boundaries/geojson/        # (same structure)
├── election_data_19-25/                # Raw election CSV files
│   └── results_<year>/
│       ├── riding_<year>.csv
│       └── poll_<year>/                # Per-riding CSV files
└── joining/                            # Data processing scripts
```

### Core Services

**StateService** - Centralized state management with pub/sub pattern
*   Census mode state (province, boundaries, visualization)
*   Hierarchical election mode state (geography level, unit display, year, party, scale type)

**DataService** - Data loading and transformation
*   CSV parsing with caching
*   GeoJSON loading
*   Coordinate transformation (runtime fallback)

**MapService** - Leaflet map management
*   Multi-pane layer system (base, choropleth, overlays, labels)
*   Boundary rendering with dynamic styling
*   Election results visualization
*   Layer highlighting with yellow borders

**UIManager** - UI components and interactions
*   Control panel management
*   Province/riding dropdown population
*   Button state synchronization
*   Info panel with charts and statistics

**App** - Main application controller
*   Mode switching (census/election)
*   Geographic level management
*   Data loading orchestration
*   Event handling

## Province Codes (PRUID)

| Code | Province/Territory | Abbr | Notes |
|------|-------------------|------|-------|
| 10 | Newfoundland and Labrador | NL | |
| 11 | Prince Edward Island | PE | |
| 12 | Nova Scotia | NS | |
| 13 | New Brunswick | NB | |
| 24 | Quebec | QC | |
| 35 | Ontario | ON | Large file: 585MB |
| 46 | Manitoba | MB | |
| 47 | Saskatchewan | SK | |
| 48 | Alberta | AB | |
| 59 | British Columbia | BC | Large file: 379MB |
| 60 | Yukon | YT | |
| 61 | Northwest Territories | NT | |
| 62 | Nunavut | NU | Large file: 532MB |

## How to Use

### Census Demographics Mode

1. **Start Application:** Open `index.html` in a web browser
2. **Select Province:** Click a province tile from the welcome screen
3. **Choose Characteristic:** Select from dropdown (Age, Housing, Income, etc.)
4. **Generate Visualization:** Click "Generate Visualization"
5. **Explore Data:**
   - Toggle between count and percentage display
   - Switch to Federal Electoral District boundaries
   - Enable federal boundary overlay
   - Click areas for detailed statistics

### Election Results Mode

1. **Enter Election Mode:** Click "View Election Results" from welcome screen
2. **Select Geographic Level:**
   - **National:** See all 338 ridings
   - **Provincial:** Select a province, then choose unit display
   - **Single Riding:** Select province, then riding from dropdown
3. **Choose Unit Display:**
   - **Riding:** Electoral district results
   - **Poll:** Election day polling stations
   - **Advance:** Early voting locations
4. **Toggle Options:**
   - **Year:** Switch between 2019, 2021, 2025
   - **Party:** Filter by specific party or view all
   - **Scale:** Absolute (0-100%) or Relative (normalized to geography)
5. **Interact:**
   - Click any unit to see detailed results
   - View highlighted boundaries (bright yellow)
   - Explore pie charts and candidate lists
   - See riding winner context for polls

### Tips

*   Map view is preserved when switching years, parties, or unit displays
*   Province changes automatically fit map to new area
*   Relative scale is ideal for finding local variation in party support
*   Yellow highlighted borders show currently selected riding/poll
*   2025 boundary changes trigger automatic reset to provincial level

## Installation & Setup

### Running the Application
No build process required - serve static files:

```bash
# Python
python -m http.server 8000

# Node.js
npx http-server

# Or open directly (may have CORS issues)
open index.html
```

### Data Preprocessing

Install dependencies:
```bash
npm install
```

Transform boundaries:
```bash
# Census boundaries
node transform_provinces.js
node --max-old-space-size=8192 transform_large.js 59 BC  # Large files
python3 transform_python.py 35 ON  # Very large files

# Election boundaries (all years)
node transform_election_boundaries.js
```

Process election data:
```bash
# Join results with boundaries
node join_election_data_year.js 2019
node join_election_data_year.js 2021

# Create per-riding files
node join_poll_data_by_riding.js 2019
node join_poll_data_by_riding.js 2021
node join_adv_data_by_riding.js 2019
node join_adv_data_by_riding.js 2021

# Create per-province files
node split_polls_by_province.js 2019
node split_polls_by_province.js 2021
node split_adv_by_province.js 2019
node split_adv_by_province.js 2021

# Merge results
node merge_poll_results_to_provinces.js 2019
node merge_poll_results_to_provinces.js 2021
node merge_adv_results_to_provinces.js 2019
node merge_adv_results_to_provinces.js 2021

# 2025 placeholders (boundaries available, no results yet)
node create_2025_riding_placeholder.js
node split_polls_by_province.js 2025
node split_adv_by_province.js 2025
node add_2025_poll_placeholders.js
```

## Browser Compatibility

*   Modern browsers with ES6+ support
*   IndexedDB support for caching
*   SVG support for visualizations
*   Tested on Chrome, Firefox, Safari, Edge

## Performance Optimization

*   Province-level file splitting reduces load times (30-100MB vs 424MB national file)
*   IndexedDB caching eliminates repeat data fetches
*   Canvas rendering for smooth interaction
*   Efficient GeoJSON filtering for hierarchical views
*   No loading overlays - instant transitions

## Credits

*   **Census Data:** Statistics Canada
*   **Election Data:** Elections Canada
*   **Mapping Library:** Leaflet.js
*   **Fonts:** Google Fonts (Inter)
*   **Color Palette:** Plasma (perceptually uniform, colorblind-friendly)

## License

Data is sourced from Statistics Canada and Elections Canada. Please refer to their respective licenses for data usage terms.
