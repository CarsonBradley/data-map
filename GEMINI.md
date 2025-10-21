# GEMINI.md

## Project Overview

This project is an interactive web map for visualizing Canadian census data. It allows users to explore demographic data at the Dissemination Area (DA) and Federal Electoral District levels. The application is built with HTML, CSS, and vanilla JavaScript, using Leaflet.js for mapping.

The frontend is a single-page application that loads GeoJSON boundary data and CSV census data, allowing users to select different census characteristics to visualize as a choropleth map. The application uses client-side coordinate reprojection with `proj4.js` and caches data in IndexedDB to improve performance.

The project also includes Node.js scripts for preprocessing the geographic data. These scripts are used to reproject GeoJSON files from EPSG:3347 to EPSG:4326 (WGS84), making them suitable for web mapping.

## Building and Running

### Running the Web Application

The web application does not require a build step.

1.  Open the `index.html` file in a web browser.
2.  The application will start, displaying a welcome screen where you can select a province to begin.

### Running the Data Processing Scripts

The data processing scripts (`join_data.js`, `transform_provinces.js`) are run using Node.js.

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Run a script:**
    ```bash
    node join_data.js
    ```
    or
    ```bash
    node transform_provinces.js
    ```

These scripts are for data preparation and are not needed to run the main web application.

## Development Conventions

*   **Modularity:** The main application logic in `script.js` is organized into services, each with a specific responsibility:
    *   `CacheService`: Handles caching data in IndexedDB.
    *   `StateService`: Manages the application's state.
    *   `DataService`: Fetches and processes data.
    *   `MapService`: Manages the Leaflet.js map and layers.
    *   `UIManager`: Controls the user interface.
*   **Data:** Geographic data is stored in GeoJSON format, and census data is in CSV format. The application fetches data for each province on demand.
*   **Coordinate System:** The source GeoJSON data is in EPSG:3347 projection. The data processing scripts and the client-side application reproject the coordinates to EPSG:4326 (WGS84) for use with Leaflet.js.
*   **Dependencies:** Frontend dependencies (Leaflet, PapaParse, Proj4js) are loaded via a CDN. Node.js dependencies for data processing are managed with `package.json`.
