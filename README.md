# Canadian Demographics & Census Analytics

This project is an interactive web map for visualizing Canadian census data at the Dissemination Area (DA) and Federal Electoral District levels. It allows users to explore various demographic characteristics across different provinces and territories.

## Features

*   **Interactive Map:** Built with Leaflet.js, allowing users to pan, zoom, and click on individual areas to get more information.
*   **Choropleth Visualization:** Census data is visualized using choropleth maps, with colors representing data values (e.g., population density, income levels).
*   **Data Filtering:** Users can select different census characteristics to visualize, such as age, housing, income, and language.
*   **Boundary Overlays:** Supports toggling between Dissemination Area (DA) and Federal Electoral District boundaries.
*   **Client-Side Caching:** Uses IndexedDB to cache data, improving performance on subsequent visits.
*   **Responsive Design:** The interface is designed to work on different screen sizes.

## Data Sources

The project uses the following data sources:

*   **Census Data:** Sourced from Statistics Canada, providing demographic information at the Dissemination Area level.
*   **Boundary Files:** GeoJSON files for Dissemination Areas and Federal Electoral Districts.

## Technical Details

*   **Frontend:**
    *   **Mapping:** [Leaflet.js](https://leafletjs.com/)
    *   **CSV Parsing:** [PapaParse](https://www.papaparse.com/)
    *   **Coordinate Projection:** [Proj4js](https://github.com/proj4js/proj4js)
    *   **Styling:** Custom CSS with Google Fonts.
*   **Data Processing (Node.js):**
    *   The `join_data.js` script is used to reproject GeoJSON boundary files from EPSG:3347 to EPSG:4326 (WGS84) to make them compatible with web mapping libraries like Leaflet.
    *   Dependencies include `proj4`, `stream-json`, and `csv-parser`.

## Scripts

*   **`join_data.js`**: A Node.js script to process and reproject GeoJSON files. This is a data preparation step and not required for running the web application.

## How to Use

1.  **Open the application:**
    *   Open the `index.html` file in a web browser.
2.  **Select a province:**
    *   Click on a province or territory from the welcome screen to load the data.
3.  **Visualize data:**
    *   Use the controls in the side panel to select a census characteristic and generate a visualization.
    *   Switch between Dissemination Area and Federal Electoral District boundaries.
    *   Toggle the federal boundary overlay.
