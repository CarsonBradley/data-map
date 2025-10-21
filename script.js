document.addEventListener('DOMContentLoaded', () => {

    // --- CONSTANTS ---
    const PROVINCES = {
        '10': { name: 'Newfoundland and Labrador', abbr: 'NL' }, '11': { name: 'Prince Edward Island', abbr: 'PE' },
        '12': { name: 'Nova Scotia', abbr: 'NS' }, '13': { name: 'New Brunswick', abbr: 'NB' },
        '24': { name: 'Quebec', abbr: 'QC' }, '35': { name: 'Ontario', abbr: 'ON' },
        '46': { name: 'Manitoba', abbr: 'MB' }, '47': { name: 'Saskatchewan', abbr: 'SK' },
        '48': { name: 'Alberta', abbr: 'AB' }, '59': { name: 'British Columbia', abbr: 'BC' },
        '60': { name: 'Yukon', abbr: 'YT' }, '61': { name: 'Northwest Territories', abbr: 'NT' },
        '62': { name: 'Nunavut', abbr: 'NU' }
    };
    

    // --- INDEXEDDB CACHE SERVICE ---
    const CacheService = {
        DB_NAME: 'CensusDataCache',
        DB_VERSION: 1,
        STORE_NAME: 'censusData',
        db: null,

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

                request.onerror = () => {
                    console.warn('IndexedDB failed to open, caching disabled:', request.error);
                    resolve(null); // Gracefully degrade
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('IndexedDB cache initialized');
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'url' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
            });
        },

        async get(url) {
            if (!this.db) return null;

            return new Promise((resolve, reject) => {
                try {
                    const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
                    const store = transaction.objectStore(this.STORE_NAME);
                    const request = store.get(url);

                    request.onsuccess = () => {
                        const result = request.result;
                        if (result) {
                            console.log(`Cache HIT for ${url.split('/').pop()}`);
                            resolve(result.data);
                        } else {
                            console.log(`Cache MISS for ${url.split('/').pop()}`);
                            resolve(null);
                        }
                    };

                    request.onerror = () => {
                        console.warn('Cache read error:', request.error);
                        resolve(null);
                    };
                } catch (error) {
                    console.warn('Cache get error:', error);
                    resolve(null);
                }
            });
        },

        async set(url, data) {
            if (!this.db) return false;

            return new Promise((resolve) => {
                try {
                    const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(this.STORE_NAME);
                    const record = {
                        url: url,
                        data: data,
                        timestamp: Date.now()
                    };
                    const request = store.put(record);

                    request.onsuccess = () => {
                        console.log(`Cached ${url.split('/').pop()}`);
                        resolve(true);
                    };

                    request.onerror = () => {
                        console.warn('Cache write error:', request.error);
                        resolve(false);
                    };
                } catch (error) {
                    console.warn('Cache set error:', error);
                    resolve(false);
                }
            });
        },

        async clear() {
            if (!this.db) return false;

            return new Promise((resolve) => {
                try {
                    const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(this.STORE_NAME);
                    const request = store.clear();

                    request.onsuccess = () => {
                        console.log('Cache cleared');
                        resolve(true);
                    };

                    request.onerror = () => {
                        console.warn('Cache clear error:', request.error);
                        resolve(false);
                    };
                } catch (error) {
                    console.warn('Cache clear error:', error);
                    resolve(false);
                }
            });
        }
    };

    // --- STATE MANAGEMENT ---
    const StateService = {
        _state: {
            currentProvinceId: null,
            provinceGeoData: null,
            provinceCensusData: null,
            federalGeoData: null,
            federalCensusData: null,
            characteristicGroups: new Map(),
            currentVisualization: null,
            currentBoundaryType: 'DA',
            showFederalOverlay: false,
            isPanelOpen: false,
            isLoading: false,
            loadingMessage: '',
            hasLoadedFederalData: false
        },
        _listeners: [],

        getState() { return { ...this._state }; },

        setState(newState) {
            this._state = { ...this._state, ...newState };
            this._listeners.forEach(listener => listener(this._state));
        },

        subscribe(listener) {
            this._listeners.push(listener);
            return () => {
                this._listeners = this._listeners.filter(l => l !== listener);
            };
        }
    };

    // --- DATA HANDLING ---
    const DataService = {
        async fetchAndParseCSV(url) {
            // Try to get from cache first
            const cachedData = await CacheService.get(url);
            if (cachedData) {
                return cachedData;
            }

            // Cache miss - fetch and parse from network
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load data from ${url}`);
            const text = await response.text();

            const data = await new Promise((resolve, reject) => {
                Papa.parse(text, {
                    header: true, skipEmptyLines: true, dynamicTyping: true,
                    complete: results => resolve(results.data),
                    error: error => reject(error)
                });
            });

            // Cache the parsed data for next time
            await CacheService.set(url, data);

            return data;
        },

        async fetchGeoJSON(url) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load boundaries from ${url}`);
            return response.json();  // No transformation needed
        },
        
        transformGeoJSON(geoData) {
            const transformer = proj4('EPSG:3347', 'EPSG:4326');
            const transformCoords = (coords) => {
                if (Array.isArray(coords[0])) {
                    coords.forEach(transformCoords);
                } else if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                    const [lon, lat] = transformer.forward(coords);
                    if (isFinite(lon) && isFinite(lat)) {
                        coords[0] = lon;
                        coords[1] = lat;
                    }
                }
            };
            geoData.features.forEach(feature => {
                if(feature.geometry && feature.geometry.coordinates) {
                   transformCoords(feature.geometry.coordinates);
                }
            });
            return geoData;
        },

        organizeCensusData(data) {
            const groups = new Map();
            data.forEach(row => {
                const groupId = row['CHARACTERISTIC_GROUP'];
                const charId = row['CHARACTERISTIC_ID'];
                const charName = row['CHARACTERISTIC_NAME'];
                if (groupId && charId && charName) {
                    if (!groups.has(groupId)) {
                        groups.set(groupId, new Map());
                    }
                    groups.get(groupId).set(charId, charName.trim());
                }
            });
            return groups;
        },

        calculateVisualizationData(characteristicId, dataType, boundaryType) {
            const { provinceCensusData, federalCensusData, currentProvinceId } = StateService.getState();
            const dataSource = boundaryType === 'Federal' ? federalCensusData : provinceCensusData;
            
            if (!dataSource) return null;

            let minVal = Infinity, maxVal = -Infinity;
            const valueMap = new Map();
            const dataKey = dataType === 'Percentage' ? 'C10_RATE_TOTAL' : 'C1_COUNT_TOTAL';
            let characteristicName = '';
            
            dataSource.forEach(row => {
                if (row['CHARACTERISTIC_ID'] == characteristicId) {
                    if (!characteristicName) characteristicName = row['CHARACTERISTIC_NAME'];
                    
                    let joinId;
                    if (boundaryType === 'Federal') {
                        // For federal data, use FED_NUM directly
                        joinId = row['FED_NUM'];
                    } else {
                        // For DA data, use DGUID
                        joinId = String(row['DGUID'] || '').trim();
                        // Filter by current province if using global data
                        if (currentProvinceId && !joinId.includes(`S0512${currentProvinceId}`)) {
                            return;
                        }
                    }
                    
                    const value = parseFloat(row[dataKey]);
                    if (isFinite(value)) {
                        minVal = Math.min(minVal, value);
                        maxVal = Math.max(maxVal, value);
                        valueMap.set(joinId, value);
                    }
                }
            });
            
            if (!isFinite(minVal)) { minVal = 0; maxVal = 0; }

            return { characteristicName, dataType, minVal, maxVal, valueMap, boundaryType };
        }
    };
    
    // --- MAP RENDERING ---
    const MapService = {
        map: null,
        geojsonLayer: null,
        federalOverlayLayer: null,
        
        initialize() {
            this.map = L.map('map', { 
                center: [56.1304, -106.3468], 
                zoom: 4, 
                zoomControl: true, 
                attributionControl: false, 
                preferCanvas: true 
            });
            
            // Define the stacking order for our layers
            this.map.createPane('base');
            this.map.getPane('base').style.zIndex = 200; // Base map tiles

            this.map.createPane('choroplethPane');
            this.map.getPane('choroplethPane').style.zIndex = 450; // Our data layer
            
            this.map.createPane('federalOverlay');
            this.map.getPane('federalOverlay').style.zIndex = 475; // Sits above data, below labels

            this.map.createPane('labels');
            this.map.getPane('labels').style.zIndex = 500; // Labels on top

            // 1. Add the BASE map layer (without labels)
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                pane: 'base' // Assign to the 'base' pane
            }).addTo(this.map);

            // 2. Add the LABELS layer on top
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
                subdomains: 'abcd',
                pane: 'labels' // Assign to the 'labels' pane
            }).addTo(this.map);
        },


        clearLayers() {
            if (this.geojsonLayer) {
                this.map.removeLayer(this.geojsonLayer);
                this.geojsonLayer = null;
            }
            if (this.federalOverlayLayer) {
                this.map.removeLayer(this.federalOverlayLayer);
                this.federalOverlayLayer = null;
            }
        },

        displayBoundaries(geoData, boundaryType = 'DA') {
            this.clearLayers();
            const style = boundaryType === 'Federal' ? 
                { weight: 2, color: '#059669', fillColor: '#e2e8f0', fillOpacity: 0.4 } :
                { weight: 1.5, color: '#475569', fillColor: '#e2e8f0', fillOpacity: 0.4 };
            
            this.geojsonLayer = L.geoJSON(geoData, {
                pane: 'choroplethPane', // <-- Add the layer to our custom pane
                style: style,
                onEachFeature: (feature, layer) => this.bindPopup(feature, layer, boundaryType)
            }).addTo(this.map);
            
            // Only fit bounds if we have valid bounds
            try {
                const bounds = this.geojsonLayer.getBounds();
                if (bounds.isValid()) {
                    this.map.fitBounds(bounds);
                }
            } catch (e) {
                console.warn('Could not fit bounds:', e);
            }
        },
        
        renderChoropleth(geoData, vizData) {
            this.clearLayers();
            const { valueMap, minVal, maxVal, boundaryType } = vizData;
            
            this.geojsonLayer = L.geoJSON(geoData, {
                pane: 'choroplethPane', // <-- Add the layer to our custom pane
                style: feature => {
                    let idKey = boundaryType === 'Federal' ? this.extractFedNum(feature) : feature.properties.DGUID;
                    const value = valueMap.get(idKey);
                    return {
                        fillColor: this.getColor(value, minVal, maxVal),
                        weight: boundaryType === 'Federal' ? 2 : 1, 
                        color: boundaryType === 'Federal' ? '#059669' : '#475569', 
                        opacity: 1, 
                        fillOpacity: 0.8 // Opacity can stay high now
                    };
                },
                onEachFeature: (feature, layer) => this.bindPopup(feature, layer, boundaryType)
            }).addTo(this.map);
            
            // Maintain federal overlay if it was active
            const { showFederalOverlay, federalGeoData } = StateService.getState();
            if (showFederalOverlay && boundaryType === 'DA' && federalGeoData) {
                this.displayFederalOverlay(federalGeoData);
            }
        },

        displayFederalOverlay(federalData) {
            if (this.federalOverlayLayer) {
                this.map.removeLayer(this.federalOverlayLayer);
                this.federalOverlayLayer = null;
            }
            
            this.federalOverlayLayer = L.geoJSON(federalData, {
                pane: 'federalOverlay', // Assigns the layer to the correct pane
                style: {
                    weight: 2.5,
                    color: '#059669',
                    fillColor: 'transparent',
                    fillOpacity: 0,
                    dashArray: '8, 4',
                    lineCap: 'round',
                    lineJoin: 'round'
                },
                onEachFeature: (feature, layer) => {
                    const name = feature.properties.Name || feature.properties.ENNAME || 'Unknown Riding';
                    layer.bindTooltip(name, {
                        permanent: false,
                        direction: 'center',
                        className: 'federal-tooltip'
                    });
                }
            }).addTo(this.map);
        },

        removeFederalOverlay() {
            if (this.federalOverlayLayer) {
                this.map.removeLayer(this.federalOverlayLayer);
                this.federalOverlayLayer = null;
            }
        },

        extractFedNum(feature) {
            // Extract FED_NUM from the HTML description (for federal boundaries)
            const description = feature.properties.description || '';
            const fedNumMatch = description.match(/<td>FED_NUM<\/td>\s*<td>(\d+)<\/td>/);
            return fedNumMatch ? parseInt(fedNumMatch[1]) : null;
        },
        
        bindPopup(feature, layer, boundaryType) {
            layer.on('click', () => {
                const { currentVisualization } = StateService.getState();
                const props = feature.properties;
                
                let header, subtitle, idValue;
                if (boundaryType === 'Federal') {
                    const name = props.Name || props.ENNAME || 'Unknown Riding';
                    const fedNum = this.extractFedNum(feature);
                    header = `<div class="popup-header federal"><h4>Federal Electoral District</h4><div class="subtitle">${name}</div></div>`;
                    subtitle = `FED_NUM: ${fedNum}`;
                    idValue = fedNum;
                } else {
                    const dauid = props.DAUID || 'Unknown';
                    header = `<div class="popup-header"><h4>Dissemination Area</h4><div class="subtitle">DAUID: ${dauid}</div></div>`;
                    idValue = props.DGUID;
                }

                let body = '<div class="popup-body">';
                
                // Add identifier info
                if (subtitle) {
                    body += `<div class="popup-stat"><div class="popup-stat-label">${subtitle}</div></div>`;
                }
                
                if (currentVisualization && currentVisualization.boundaryType === boundaryType) {
                    const value = currentVisualization.valueMap.get(idValue);
                    if (value !== undefined && isFinite(value)) {
                        const formattedValue = currentVisualization.dataType === 'Percentage' ? `${value.toFixed(2)}%` : value.toLocaleString();
                        body += `
                            <div class="popup-stat">
                                <div class="popup-stat-label">${currentVisualization.characteristicName}</div>
                                <div class="popup-stat-value">${formattedValue}</div>
                            </div>`;
                    } else {
                        body += `<div class="popup-nodata">No data available for this characteristic.</div>`;
                    }
                } else {
                    body += `<div class="popup-nodata">Select a characteristic to visualize data.</div>`;
                }
                
                body += '</div>';
                
                const popupContent = header + body;
                
                L.popup({ maxWidth: 320, minWidth: 300, closeButton: true })
                    .setLatLng(layer.getBounds().getCenter())
                    .setContent(popupContent)
                    .openOn(this.map);
            });
        },

        getColor(value, min, max) {
            if (value == null || !isFinite(value)) {
                return '#E2E8F0'; // No data color
            }

            // A perceptually uniform color palette ("Plasma") from light to dark.
            // This palette is good for accessibility (colorblind-friendly).
            const palette = ['#f0f921', '#fdb827', '#f58536', '#da5a64', '#b63679', '#8e0186', '#5b007f', '#0d0887'];

            if (max - min === 0) {
                return palette[Math.floor(palette.length / 2)]; // Return a middle color if all values are the same
            }

            // Normalize the value to a 0-1 range
            let t = (value - min) / (max - min);

            // Clamp t to the 0-1 range to handle potential floating point errors
            t = Math.max(0, Math.min(1, t));

            // Determine the two colors to interpolate between
            const colorIndex = t * (palette.length - 1);
            const index1 = Math.floor(colorIndex);
            const index2 = Math.min(index1 + 1, palette.length - 1);

            // Determine the amount to interpolate between the two selected colors
            const t_segment = colorIndex - index1;

            // Helper function for interpolation
            const interpolateColor = (color1, color2, factor) => {
                const r1 = parseInt(color1.substring(1, 3), 16);
                const g1 = parseInt(color1.substring(3, 5), 16);
                const b1 = parseInt(color1.substring(5, 7), 16);

                const r2 = parseInt(color2.substring(1, 3), 16);
                const g2 = parseInt(color2.substring(3, 5), 16);
                const b2 = parseInt(color2.substring(5, 7), 16);

                const r = Math.round(r1 + (r2 - r1) * factor);
                const g = Math.round(g1 + (g2 - g1) * factor);
                const b = Math.round(b1 + (b2 - b1) * factor);
                
                // Function to pad with a zero if needed
                const toHex = c => ('0' + c.toString(16)).slice(-2);

                return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            };

            return interpolateColor(palette[index1], palette[index2], t_segment);
        }
    };

    // --- UI MANAGEMENT ---
    const UIManager = {
        elements: {
            welcomeOverlay: document.getElementById('welcome-overlay'),
            provinceGrid: document.getElementById('province-grid'),
            provinceDisplay: document.getElementById('province-display'),
            provinceName: document.getElementById('province-name'),
            changeProvinceBtn: document.getElementById('change-province-btn'),
            controlPanel: document.getElementById('control-panel'),
            panelCloseBtn: document.getElementById('panel-close'),
            controlsContainer: document.getElementById('controls-container'),
            legendWrapper: document.getElementById('legend-wrapper'),
            openControlsBtn: document.getElementById('open-controls-btn'), 
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),
        },

        initialize() {
            this.renderProvinceSelector();
            this.elements.panelCloseBtn.addEventListener('click', () => this.setPanelOpen(false));
            this.elements.openControlsBtn.addEventListener('click', () => this.setPanelOpen(true)); // <-- ADD THIS LINE
            this.elements.changeProvinceBtn.addEventListener('click', () => this.resetToWelcome());
            StateService.subscribe(this.handleStateChange.bind(this));
        },

        handleStateChange(state) {
            // Update Panel
            if (state.isPanelOpen !== this.elements.controlPanel.classList.contains('open')) {
                this.elements.controlPanel.classList.toggle('open', state.isPanelOpen);
            }

            // Show/hide the 'Open Controls' button based on state
            const canShowButton = state.currentProvinceId && !state.isPanelOpen; // <-- ADD THIS LINE
            this.elements.openControlsBtn.classList.toggle('hidden', !canShowButton); // <-- ADD THIS LINE

            // Update Loading Overlay
            if(state.isLoading !== !this.elements.loadingOverlay.classList.contains('hidden')) {
               this.setLoading(state.isLoading, state.loadingMessage);
            }
            // Update Province Display
            if (state.currentProvinceId) {
                this.elements.provinceName.textContent = PROVINCES[state.currentProvinceId].name;
                this.elements.provinceDisplay.classList.remove('hidden');
            } else {
                this.elements.provinceDisplay.classList.add('hidden');
            }
            // Update Legend
            this.renderLegend(state.currentVisualization);
        },

        renderProvinceSelector() {
            Object.entries(PROVINCES).forEach(([code, { name, abbr }]) => {
                const button = document.createElement('button');
                button.className = 'province-button';
                button.innerHTML = `<div class="abbr">${abbr}</div><div class="name">${name}</div>`;
                button.addEventListener('click', () => App.selectProvince(code));
                this.elements.provinceGrid.appendChild(button);
            });
        },

        setPanelOpen(isOpen) {
            StateService.setState({ isPanelOpen: isOpen });
        },
        
        setLoading(isLoading, message = '') {
            this.elements.loadingText.textContent = message;
            this.elements.loadingOverlay.classList.toggle('hidden', !isLoading);
        },

        showWelcome(isVisible) {
            this.elements.welcomeOverlay.classList.toggle('hidden', !isVisible);
        },
        
        resetToWelcome() {
            MapService.clearLayers();
            MapService.map.setView([56.1304, -106.3468], 4);
            this.showWelcome(true);
            this.setPanelOpen(false);
            StateService.setState({ 
                currentProvinceId: null, 
                provinceGeoData: null, 
                provinceCensusData: null, 
                currentVisualization: null,
                currentBoundaryType: 'DA',
                showFederalOverlay: false
            });
            
            // Reset UI controls
            const boundaryDA = document.getElementById('boundaryDA');
            if (boundaryDA) boundaryDA.checked = true;
            const federalToggle = document.getElementById('federalBoundariesToggle');
            if (federalToggle) federalToggle.checked = false;
        },
        
        renderControls(characteristicGroups) {
            this.elements.controlsContainer.innerHTML = '';

            const html = `
                <div class="form-section">
                    <div class="boundary-type-section">
                        <label class="form-label">Boundary Type</label>
                        <div class="radio-group">
                            <input type="radio" id="boundaryDA" name="boundaryType" value="DA" class="radio-input" checked>
                            <label for="boundaryDA" class="radio-label">Dissemination Areas</label>
                            <input type="radio" id="boundaryFederal" name="boundaryType" value="Federal" class="radio-input">
                            <label for="boundaryFederal" class="radio-label">Federal Electoral</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="characteristicGroupSelect">Characteristic Group</label>
                        <select id="characteristicGroupSelect" class="form-select">
                            <option value="">Select a group...</option>
                            ${[...characteristicGroups.keys()].map(groupId => `<option value="${groupId}">${this.getGroupName(groupId)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="characteristicSelect">Specific Characteristic</label>
                        <select id="characteristicSelect" class="form-select" disabled><option>First select a group...</option></select>
                    </div>
                </div>
                <div class="form-section">
                    <div class="form-group">
                        <label class="form-label">Display Type</label>
                        <div class="radio-group">
                            <input type="radio" id="dataTypePercentage" name="dataType" value="Percentage" class="radio-input" checked><label for="dataTypePercentage" class="radio-label">Percentage</label>
                            <input type="radio" id="dataTypeTotal" name="dataType" value="Total" class="radio-input"><label for="dataTypeTotal" class="radio-label">Total Count</label>
                        </div>
                    </div>
                </div>
                <button id="renderMapButton" class="btn btn-primary">Generate Visualization</button>
                <div class="form-overlay-group" id="federalOverlayGroup">
                    <label class="checkbox-label">
                        <input type="checkbox" id="federalBoundariesToggle" class="checkbox-input">
                        Show Federal Electoral Boundaries
                    </label>
                    <p class="form-help">Display federal riding boundaries over dissemination areas</p>
                </div>
            `;
            this.elements.controlsContainer.innerHTML = html;
            
            // Event listeners
            document.getElementById('characteristicGroupSelect').addEventListener('change', e => this.updateCharacteristicOptions(e.target.value));
            document.getElementById('characteristicSelect').addEventListener('change', e => {
                if (e.target.value) {
                    this.updateDisplayTypeOptions(e.target.value);
                }
            });
            document.getElementById('renderMapButton').addEventListener('click', e => App.generateVisualization(e.currentTarget));
            document.getElementById('federalBoundariesToggle').addEventListener('change', e => App.toggleFederalOverlay(e.target.checked));
            
            // Boundary type change handlers
            document.querySelectorAll('input[name="boundaryType"]').forEach(radio => {
                radio.addEventListener('change', async (e) => {
                    const newBoundaryType = e.target.value;
                    StateService.setState({ currentBoundaryType: newBoundaryType });
                    
                    // Hide federal overlay option when viewing federal boundaries
                    document.getElementById('federalOverlayGroup').style.display = 
                        newBoundaryType === 'Federal' ? 'none' : 'block';
                    
                    // Load federal data if switching to federal and not loaded
                    if (newBoundaryType === 'Federal' && !StateService.getState().hasLoadedFederalData) {
                        await App.loadFederalData();
                    }
                    
                    // Update boundaries display
                    await App.updateBoundaryDisplay();
                });
            });
        },

        getGroupName(groupId) {
             const names = {1:'Age', 2:'Housing', 3:'Income', 4:'Language', 5:'Ethnicity', 6:'Religion', 7:'Education', 8:'Commute'};
             return names[groupId] || `Group ${groupId}`;
        },

        updateCharacteristicOptions(groupId) {
            const select = document.getElementById('characteristicSelect');
            select.innerHTML = '';
            if (!groupId) {
                select.disabled = true;
                select.innerHTML = '<option>First select a group...</option>';
                return;
            }
            
            const { characteristicGroups } = StateService.getState();
            const characteristics = characteristicGroups.get(parseInt(groupId));
            
            select.innerHTML = '<option value="">Select a characteristic...</option>';
            if (characteristics) {
                characteristics.forEach((name, id) => {
                    select.innerHTML += `<option value="${id}">${name}</option>`;
                });
                select.disabled = false;
            } else {
                select.disabled = true;
            }
        },
        
        isAverageCharacteristic(characteristicName) {
            if (!characteristicName) return false;
            const lowerName = characteristicName.toLowerCase();
            return lowerName.includes('average') || lowerName.includes('median');
        },
        
        updateDisplayTypeOptions(characteristicId) {
            const { characteristicGroups } = StateService.getState();
            let characteristicName = '';
            
            // Find the characteristic name
            characteristicGroups.forEach((group) => {
                if (group.has(parseInt(characteristicId))) {
                    characteristicName = group.get(parseInt(characteristicId));
                }
            });
            
            const displayTypeSection = document.querySelector('.form-section:nth-child(2) .form-group');
            const isAverage = this.isAverageCharacteristic(characteristicName);
            
            if (isAverage) {
                // Only show Total Count option for averages and medians
                displayTypeSection.innerHTML = `
                    <label class="form-label">Display Type</label>
                    <div class="radio-group">
                        <input type="radio" id="dataTypeTotal" name="dataType" value="Total" class="radio-input" checked>
                        <label for="dataTypeTotal" class="radio-label">Total Count</label>
                    </div>
                `;
            } else {
                // Show both options for non-average characteristics
                displayTypeSection.innerHTML = `
                    <label class="form-label">Display Type</label>
                    <div class="radio-group">
                        <input type="radio" id="dataTypePercentage" name="dataType" value="Percentage" class="radio-input" checked>
                        <label for="dataTypePercentage" class="radio-label">Percentage</label>
                        <input type="radio" id="dataTypeTotal" name="dataType" value="Total" class="radio-input">
                        <label for="dataTypeTotal" class="radio-label">Total Count</label>
                    </div>
                `;
            }
        },
        

        setButtonLoading(button, isLoading) {
            button.disabled = isLoading;
            if (isLoading) {
                button.innerHTML = '<div class="spinner"></div><span>Generating...</span>';
            } else {
                button.textContent = 'Generate Visualization';
            }
        },
        
        renderLegend(vizData) {
            if (!vizData) {
                this.elements.legendWrapper.classList.remove('visible');
                return;
            }

            const { characteristicName, dataType, minVal, maxVal, boundaryType } = vizData;
            const format = v => dataType === 'Percentage' ? `${v.toFixed(1)}%` : v.toLocaleString();
            
            // Use the same palette as in the new getColor function
            const palette = ['#f0f921', '#fdb827', '#f58536', '#da5a64', '#b63679', '#8e0186', '#5b007f', '#0d0887'];

            this.elements.legendWrapper.innerHTML = `
                <div class="legend-title">${characteristicName}</div>
                <div class="legend-subtitle">${dataType} by ${boundaryType === 'Federal' ? 'Federal Electoral District' : 'Dissemination Area'}</div>
                <div class="legend-scale" style="background: linear-gradient(to right, ${palette.join(', ')})"></div>
                <div class="legend-labels">
                    <span>${format(minVal)}</span>
                    <span>${format(maxVal)}</span>
                </div>
            `;
            this.elements.legendWrapper.classList.add('visible');
        }
    };

    // --- MAIN APPLICATION LOGIC ---
    const App = {
        async initialize() {
            // Initialize cache service first
            await CacheService.init();

            MapService.initialize();
            UIManager.initialize();
        },
        
        async loadFederalData() {
            const state = StateService.getState();
            if (state.hasLoadedFederalData) return;
            
            try {
                StateService.setState({ isLoading: true, loadingMessage: 'Loading federal electoral data...' });
                
                // Load federal boundaries
                const federalGeoData = await DataService.fetchGeoJSON('boundaries/fed_2023_boundaries.geojson');

                // Load federal census data
                const federalCensusData = await DataService.fetchAndParseCSV('output_data/filtered_fed_data.csv');
                
                StateService.setState({ 
                    federalGeoData, 
                    federalCensusData,
                    hasLoadedFederalData: true,
                    isLoading: false
                });
            } catch (error) {
                console.error("Failed to load federal data:", error);
                StateService.setState({ isLoading: false });
                alert('Failed to load federal electoral data. Please check the console for details.');
            }
        },
        
        async selectProvince(provinceId) {
            StateService.setState({ isLoading: true, loadingMessage: `Loading ${PROVINCES[provinceId].name}...` });
            UIManager.showWelcome(false);
            UIManager.setPanelOpen(true);

            try {
                const abbr = PROVINCES[provinceId].abbr;
                const geoUrl = `new_boundaries/provinces/da_${provinceId}_${abbr}_wgs84.geojson`;
                const censusUrl = `output_data/provinces/da_${provinceId}_${abbr}_data.csv`;
                
                const [geoData, censusData] = await Promise.all([
                    DataService.fetchGeoJSON(geoUrl),
                    DataService.fetchAndParseCSV(censusUrl)
                ]);
                const characteristicGroups = DataService.organizeCensusData(censusData);
                
                StateService.setState({
                    currentProvinceId: provinceId,
                    provinceGeoData: geoData,
                    provinceCensusData: censusData,
                    characteristicGroups: characteristicGroups,
                    isLoading: false
                });

                MapService.displayBoundaries(geoData, 'DA');
                UIManager.renderControls(characteristicGroups);

            } catch (error) {
                console.error("Failed to load province data:", error);
                StateService.setState({ isLoading: false });
                UIManager.resetToWelcome();
                alert(`Error: Could not load data for ${PROVINCES[provinceId].name}. Please check the console.`);
            }
        },
        
        async updateBoundaryDisplay() {
            const { currentBoundaryType, provinceGeoData, federalGeoData, currentVisualization } = StateService.getState();
            
            if (currentBoundaryType === 'Federal') {
                if (!federalGeoData) {
                    await this.loadFederalData();
                }
                const geoData = StateService.getState().federalGeoData;
                if (geoData) {
                    MapService.displayBoundaries(geoData, 'Federal');
                }
            } else {
                if (provinceGeoData) {
                    MapService.displayBoundaries(provinceGeoData, 'DA');
                }
            }
            
            // Reapply visualization if one exists
            if (currentVisualization) {
                const geoData = currentBoundaryType === 'Federal' ? 
                    StateService.getState().federalGeoData : 
                    StateService.getState().provinceGeoData;
                if (geoData) {
                    MapService.renderChoropleth(geoData, currentVisualization);
                }
            }
        },
        
        async generateVisualization(button) {
            const { currentBoundaryType } = StateService.getState();
            const charId = document.getElementById('characteristicSelect').value;
            const dataType = document.querySelector('input[name="dataType"]:checked').value;
            
            if (!charId) {
                alert('Please select a specific characteristic.');
                return;
            }

            UIManager.setButtonLoading(button, true);

            try {
                // Load federal data if needed
                if (currentBoundaryType === 'Federal' && !StateService.getState().hasLoadedFederalData) {
                    await this.loadFederalData();
                }

                // Simulate processing time for better UX
                await new Promise(resolve => setTimeout(resolve, 300));

                const vizData = DataService.calculateVisualizationData(charId, dataType, currentBoundaryType);
                const { provinceGeoData, federalGeoData } = StateService.getState();
                const geoData = currentBoundaryType === 'Federal' ? federalGeoData : provinceGeoData;
                
                if (!geoData) {
                    throw new Error(`No ${currentBoundaryType} boundary data available`);
                }
                
                StateService.setState({ currentVisualization: vizData });
                MapService.renderChoropleth(geoData, vizData);
                
                // Reapply federal overlay if it was on
                const { showFederalOverlay } = StateService.getState();
                if (showFederalOverlay && currentBoundaryType === 'DA' && federalGeoData) {
                    MapService.displayFederalOverlay(federalGeoData);
                }
            } catch (error) {
                console.error('Visualization error:', error);
                alert(`Failed to generate visualization: ${error.message}`);
            } finally {
                UIManager.setButtonLoading(button, false);
            }
        },
        
        async toggleFederalOverlay(show) {
            StateService.setState({ showFederalOverlay: show });
            
            if (show) {
                // Load federal data if not already loaded
                if (!StateService.getState().hasLoadedFederalData) {
                    await this.loadFederalData();
                }
                
                const { federalGeoData } = StateService.getState();
                if (federalGeoData) {
                    MapService.displayFederalOverlay(federalGeoData);
                }
            } else {
                MapService.removeFederalOverlay();
            }
        }
    };

    // Expose cache utilities to console for debugging
    window.CensusApp = {
        clearCache: () => CacheService.clear(),
        cache: CacheService
    };

    App.initialize();
});