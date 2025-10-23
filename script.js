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
        electionLayer: null,
        selectedPollLayer: null,

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

            this.map.createPane('electionPane');
            this.map.getPane('electionPane').style.zIndex = 460; // Election results layer

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
            if (this.electionLayer) {
                this.map.removeLayer(this.electionLayer);
                this.electionLayer = null;
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

        displayElectionResults(electionData, preserveView = false) {
            if (this.electionLayer) {
                this.map.removeLayer(this.electionLayer);
                this.electionLayer = null;
            }

            this.electionLayer = L.geoJSON(electionData, {
                pane: 'electionPane',
                style: feature => {
                    const results = feature.properties.electionResults;
                    const party = results?.winner?.party;
                    return {
                        fillColor: this.getPartyColor(party),
                        weight: 1.5,
                        color: '#333333',
                        opacity: 0.8,
                        fillOpacity: 0.7
                    };
                },
                onEachFeature: (feature, layer) => {
                    layer.on('click', () => {
                        const results = feature.properties.electionResults;
                        const props = feature.properties;

                        // When clicking a riding, save it as the current riding so poll toggle becomes available
                        StateService.setState({ currentRidingNumber: props.FED_NUM });

                        // Build content for side panel
                        let content = '';

                        if (results && results.winner) {
                            const winner = results.winner;
                            content += `
                                <div class="info-election-winner">
                                    <div class="info-party-badge" style="background-color: ${this.getPartyColor(winner.party)}"></div>
                                    <div class="info-winner-info">
                                        <div class="info-winner-name">${winner.name}</div>
                                        <div class="info-winner-party">${winner.party}</div>
                                    </div>
                                </div>
                                <div class="info-election-stats">
                                    <div class="info-stat">
                                        <div class="info-stat-label">Votes</div>
                                        <div class="info-stat-value">${winner.votes.toLocaleString()} (${winner.percentage}%)</div>
                                    </div>
                                    <div class="info-stat">
                                        <div class="info-stat-label">Margin</div>
                                        <div class="info-stat-value">${winner.margin.toLocaleString()} (${winner.marginPercent}%)</div>
                                    </div>
                                    <div class="info-stat">
                                        <div class="info-stat-label">Total Votes</div>
                                        <div class="info-stat-value">${results.totalVotes.toLocaleString()}</div>
                                    </div>
                                </div>`;

                            if (results.candidates && results.candidates.length > 1) {
                                content += `<div class="info-all-candidates"><strong>All Candidates</strong>`;
                                results.candidates.forEach(candidate => {
                                    const indicator = candidate.isWinner ? ' ★' : '';
                                    content += `
                                        <div class="info-candidate-row">
                                            <span class="info-candidate-party" style="color: ${this.getPartyColor(candidate.party)}">${candidate.party}</span>
                                            <span class="info-candidate-votes">${candidate.votes.toLocaleString()} (${candidate.percentage}%)${indicator}</span>
                                        </div>`;
                                });
                                content += `</div>`;
                            }
                        } else {
                            content += `<div class="info-panel-hint">No election data available</div>`;
                        }

                        // Update side panel
                        UIManager.updateElectionInfo(`${props.ED_NAMEE} (Riding ${props.FED_NUM})`, content);
                    });
                }
            }).addTo(this.map);

            // Only fit bounds on initial load, not when toggling years
            if (!preserveView) {
                try {
                    const bounds = this.electionLayer.getBounds();
                    if (bounds.isValid()) {
                        this.map.fitBounds(bounds);
                    }
                } catch (e) {
                    console.warn('Could not fit bounds:', e);
                }
            }
        },

        removeElectionResults() {
            if (this.electionLayer) {
                this.map.removeLayer(this.electionLayer);
                this.electionLayer = null;
            }
        },

        displayPollResults(pollData, ridingNumber, preserveView = false) {
            if (this.electionLayer) {
                this.map.removeLayer(this.electionLayer);
                this.electionLayer = null;
            }

            this.electionLayer = L.geoJSON(pollData, {
                pane: 'electionPane',
                style: feature => {
                    const results = feature.properties.pollResults;
                    const colorInfo = this.getPollColorInfo(results);

                    return {
                        fillColor: colorInfo.color || '#E5E7EB',
                        weight: 0.5,
                        color: '#999999',
                        opacity: 0.4,
                        fillOpacity: 0.85,
                        // Store stripe info for custom rendering
                        className: colorInfo.striped ? 'striped-poll' : ''
                    };
                },
                onEachFeature: (feature, layer) => {
                    // Apply stripes if needed
                    const results = feature.properties.pollResults;
                    const colorInfo = this.getPollColorInfo(results);

                    if (colorInfo.striped && colorInfo.colors) {
                        // Create diagonal stripe pattern using canvas
                        layer.on('add', () => {
                            const path = layer._path;
                            if (path) {
                                this.applyStripedPattern(path, colorInfo.colors);
                            }
                        });
                    }

                    layer.on('click', () => {
                        const results = feature.properties.pollResults;
                        const props = feature.properties;
                        const pdNum = props.PD_NUM || props.PDNUM;

                        console.log('Poll clicked, layer:', layer);
                        console.log('Layer path:', layer._path);
                        console.log('Current classes:', layer._path ? layer._path.getAttribute('class') : 'no path');

                        // Highlight this poll
                        this.highlightSelectedPoll(layer);

                        // Build content for side panel
                        let content = '';

                        if (results && results.winner) {
                            const winner = results.winner;
                            content += `
                                <div class="info-election-winner">
                                    <div class="info-party-badge" style="background-color: ${this.getPartyColor(winner.party)}"></div>
                                    <div class="info-winner-info">
                                        <div class="info-winner-name">${winner.name}</div>
                                        <div class="info-winner-party">${winner.party}</div>
                                    </div>
                                </div>
                                <div class="info-election-stats">
                                    <div class="info-stat">
                                        <div class="info-stat-label">Poll Location</div>
                                        <div class="info-stat-value">${results.pollName || 'N/A'}</div>
                                    </div>
                                    <div class="info-stat">
                                        <div class="info-stat-label">Total Votes</div>
                                        <div class="info-stat-value">${results.totalVotes.toLocaleString()}</div>
                                    </div>
                                    <div class="info-stat">
                                        <div class="info-stat-label">Electors</div>
                                        <div class="info-stat-value">${results.electors > 0 ? results.electors.toLocaleString() : 'N/A'}</div>
                                    </div>
                                    <div class="info-stat">
                                        <div class="info-stat-label">Turnout</div>
                                        <div class="info-stat-value">${results.electors > 0 ? ((results.totalVotes / results.electors) * 100).toFixed(1) + '%' : 'N/A'}</div>
                                    </div>
                                </div>`;

                            if (results.candidates && results.candidates.length > 0) {
                                content += `<div class="info-all-candidates"><strong>Results by Candidate</strong>`;
                                results.candidates.forEach(candidate => {
                                    const indicator = candidate.party === winner.party ? ' ★' : '';
                                    content += `
                                        <div class="info-candidate-row">
                                            <span class="info-candidate-party" style="color: ${this.getPartyColor(candidate.party)}">${candidate.party}</span>
                                            <span class="info-candidate-votes">${candidate.votes} (${candidate.percentage}%)${indicator}</span>
                                        </div>`;
                                });
                                content += `</div>`;
                            }
                        } else {
                            content += `<div class="info-panel-hint">No poll data available</div>`;
                        }

                        // Update side panel
                        UIManager.updateElectionInfo(`Poll ${pdNum} - Riding ${ridingNumber}`, content);
                    });
                }
            }).addTo(this.map);

            // Only fit bounds on initial load
            if (!preserveView) {
                try {
                    const bounds = this.electionLayer.getBounds();
                    if (bounds.isValid()) {
                        this.map.fitBounds(bounds, { padding: [20, 20] });
                    }
                } catch (e) {
                    console.warn('Could not fit bounds:', e);
                }
            }
        },

        displayAdvanceResults(advData, ridingNumber, preserveView = false) {
            if (this.electionLayer) {
                this.map.removeLayer(this.electionLayer);
                this.electionLayer = null;
            }

            this.electionLayer = L.geoJSON(advData, {
                pane: 'electionPane',
                style: feature => {
                    const results = feature.properties.advResults;
                    const colorInfo = this.getPollColorInfo(results);

                    return {
                        fillColor: colorInfo.color || '#E5E7EB',
                        weight: 0.5,
                        color: '#999999',
                        opacity: 0.4,
                        fillOpacity: 0.85,
                        // Store stripe info for custom rendering
                        className: colorInfo.striped ? 'striped-poll' : ''
                    };
                },
                onEachFeature: (feature, layer) => {
                    // Apply stripes if needed
                    const results = feature.properties.advResults;
                    const colorInfo = this.getPollColorInfo(results);

                    if (colorInfo.striped && colorInfo.colors) {
                        // Create diagonal stripe pattern using canvas
                        layer.on('add', () => {
                            const path = layer._path;
                            if (path) {
                                this.applyStripedPattern(path, colorInfo.colors);
                            }
                        });
                    }

                    layer.on('click', () => {
                        const results = feature.properties.advResults;
                        const props = feature.properties;
                        // Handle both property names: ADV_POLL_N (2021) and ADVPDNUM (2019)
                        const advPollNum = props.ADV_POLL_N || props.ADVPDNUM;

                        // Highlight this advance poll
                        this.highlightSelectedPoll(layer);

                        // Build content for side panel
                        let content = '';

                        if (results && results.winner) {
                            const winner = results.winner;
                            content += `
                                <div class="info-election-winner">
                                    <div class="info-party-badge" style="background-color: ${this.getPartyColor(winner.party)}"></div>
                                    <div class="info-winner-info">
                                        <div class="info-winner-name">${winner.name}</div>
                                        <div class="info-winner-party">${winner.party}</div>
                                    </div>
                                </div>
                                <div class="info-election-stats">
                                    <div class="info-stat">
                                        <div class="info-stat-label">Advance Poll Location</div>
                                        <div class="info-stat-value">${results.pollName || 'N/A'}</div>
                                    </div>
                                    <div class="info-stat">
                                        <div class="info-stat-label">Total Votes</div>
                                        <div class="info-stat-value">${results.totalVotes.toLocaleString()}</div>
                                    </div>
                                    <div class="info-stat">
                                        <div class="info-stat-label">Electors</div>
                                        <div class="info-stat-value">${results.electors > 0 ? results.electors.toLocaleString() : 'N/A'}</div>
                                    </div>
                                    <div class="info-stat">
                                        <div class="info-stat-label">Turnout</div>
                                        <div class="info-stat-value">${results.electors > 0 ? ((results.totalVotes / results.electors) * 100).toFixed(1) + '%' : 'N/A'}</div>
                                    </div>
                                </div>`;

                            if (results.candidates && results.candidates.length > 0) {
                                content += `<div class="info-all-candidates"><strong>Results by Candidate</strong>`;
                                results.candidates.forEach(candidate => {
                                    const indicator = candidate.party === winner.party ? ' ★' : '';
                                    content += `
                                        <div class="info-candidate-row">
                                            <span class="info-candidate-party" style="color: ${this.getPartyColor(candidate.party)}">${candidate.party}</span>
                                            <span class="info-candidate-votes">${candidate.votes} (${candidate.percentage}%)${indicator}</span>
                                        </div>`;
                                });
                                content += `</div>`;
                            }
                        } else {
                            content += `<div class="info-panel-hint">No advance poll data available</div>`;
                        }

                        // Update side panel
                        UIManager.updateElectionInfo(`Advance Poll ${advPollNum} - Riding ${ridingNumber}`, content);
                    });
                }
            }).addTo(this.map);

            // Only fit bounds on initial load
            if (!preserveView) {
                try {
                    const bounds = this.electionLayer.getBounds();
                    if (bounds.isValid()) {
                        this.map.fitBounds(bounds, { padding: [20, 20] });
                    }
                } catch (e) {
                    console.warn('Could not fit bounds:', e);
                }
            }
        },

        getPartyColor(party) {
            const partyColors = {
                'Liberal': '#DC2626',
                'Conservative': '#2563EB',
                'NDP': '#F97316',
                'Bloc Québécois': '#06B6D4',
                'Green': '#16A34A',
                'PPC': '#6B21A8',
                'Independent': '#6B7280'
            };
            return partyColors[party] || '#9CA3AF';
        },

        getPollColorInfo(results) {
            if (!results || !results.candidates || results.candidates.length === 0) {
                return { color: '#E5E7EB', striped: false }; // Light gray for no data
            }

            // Sort candidates by votes to get all tied candidates
            const sortedCandidates = [...results.candidates].sort((a, b) => b.votes - a.votes);
            const topVotes = sortedCandidates[0].votes;

            // Find all candidates tied for first place
            const tiedCandidates = sortedCandidates.filter(c => c.votes === topVotes);

            // If it's a tie (2 or more candidates with same votes), return striped pattern
            if (tiedCandidates.length >= 2) {
                return {
                    color: null,
                    striped: true,
                    colors: tiedCandidates.slice(0, 3).map(c => this.getPartyColor(c.party)) // Max 3 colors
                };
            }

            const winner = sortedCandidates[0];
            const runnerUp = sortedCandidates[1];

            if (!runnerUp || results.totalVotes === 0) {
                // Only one candidate or no votes - use full party color
                return { color: this.getPartyColor(winner.party), striped: false };
            }

            // Calculate margin percentage (winner's lead over runner-up as % of total votes)
            const marginPercent = ((winner.votes - runnerUp.votes) / results.totalVotes) * 100;

            // Get base color for winner
            const winnerColor = this.hexToRgb(this.getPartyColor(winner.party));

            // Define intensity based on margin
            let intensity;
            if (marginPercent < 5) {
                // Very close race - light color
                intensity = 0.3 + (marginPercent / 5) * 0.2; // 0.3 to 0.5
            } else if (marginPercent < 15) {
                // Slight win - light to medium
                intensity = 0.5 + ((marginPercent - 5) / 10) * 0.2; // 0.5 to 0.7
            } else if (marginPercent < 30) {
                // Comfortable win - medium to strong
                intensity = 0.7 + ((marginPercent - 15) / 15) * 0.2; // 0.7 to 0.9
            } else {
                // Landslide - full color
                intensity = 0.9 + Math.min((marginPercent - 30) / 30, 0.1); // 0.9 to 1.0
            }

            // Lighten the winner's color based on intensity
            const r = Math.round(255 - (255 - winnerColor.r) * intensity);
            const g = Math.round(255 - (255 - winnerColor.g) * intensity);
            const b = Math.round(255 - (255 - winnerColor.b) * intensity);

            return { color: this.rgbToHex(r, g, b), striped: false };
        },

        hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 0, g: 0, b: 0 };
        },

        rgbToHex(r, g, b) {
            return "#" + [r, g, b].map(x => {
                const hex = x.toString(16);
                return hex.length === 1 ? "0" + hex : hex;
            }).join('');
        },

        applyStripedPattern(path, colors) {
            // Create SVG pattern for stripes
            const svg = path.ownerSVGElement || document.querySelector('svg');
            if (!svg) return;

            // Create unique pattern ID based on colors
            const patternId = `stripe-${colors.join('-').replace(/#/g, '')}`;

            // Check if pattern already exists
            let pattern = document.getElementById(patternId);
            if (!pattern) {
                // Create new pattern
                const defs = svg.querySelector('defs') || svg.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svg.firstChild);
                pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
                pattern.setAttribute('id', patternId);
                pattern.setAttribute('width', '10');
                pattern.setAttribute('height', '10');
                pattern.setAttribute('patternUnits', 'userSpaceOnUse');
                pattern.setAttribute('patternTransform', 'rotate(45)');

                // Create stripes based on number of colors
                const stripeWidth = 10 / colors.length;
                colors.forEach((color, i) => {
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', i * stripeWidth);
                    rect.setAttribute('width', stripeWidth);
                    rect.setAttribute('height', '10');
                    rect.setAttribute('fill', color);
                    pattern.appendChild(rect);
                });

                defs.appendChild(pattern);
            }

            // Apply pattern to path
            path.setAttribute('fill', `url(#${patternId})`);
        },

        highlightSelectedPoll(layer) {
            console.log('highlightSelectedPoll called');
            console.log('Layer:', layer);
            console.log('Layer._path:', layer._path);

            // Remove highlight from previously selected poll
            if (this.selectedPollLayer && this.selectedPollLayer._path) {
                console.log('Removing highlight from previous poll');
                this.selectedPollLayer._path.classList.remove('selected-poll');
                // Reset the stroke style
                this.selectedPollLayer.setStyle({
                    weight: 0.5,
                    color: '#999999',
                    opacity: 0.4
                });
            }

            // Add highlight to newly selected poll
            this.selectedPollLayer = layer;
            if (layer._path) {
                console.log('Adding highlight class and style');
                console.log('Classes before:', layer._path.getAttribute('class'));
                layer._path.classList.add('selected-poll');
                console.log('Classes after:', layer._path.getAttribute('class'));

                // Also set the style directly to ensure it shows
                layer.setStyle({
                    weight: 4,
                    color: '#FFD700',
                    opacity: 1
                });
                console.log('Style set, stroke should be:', layer.options.color);
            } else {
                console.log('WARNING: No _path found on layer!');
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
            electionDisplay: document.getElementById('election-display'),
            electionYear: document.getElementById('election-year'),
            changeElectionBtn: document.getElementById('change-election-btn'),
            toggle2019Btn: document.getElementById('toggle-2019-btn'),
            toggle2021Btn: document.getElementById('toggle-2021-btn'),
            toggleRidingViewBtn: document.getElementById('toggle-riding-view-btn'),
            togglePollViewBtn: document.getElementById('toggle-poll-view-btn'),
            toggleAdvViewBtn: document.getElementById('toggle-adv-view-btn'),
            viewLevelToggle: document.getElementById('view-level-toggle'),
            controlPanel: document.getElementById('control-panel'),
            panelCloseBtn: document.getElementById('panel-close'),
            controlsContainer: document.getElementById('controls-container'),
            legendWrapper: document.getElementById('legend-wrapper'),
            openControlsBtn: document.getElementById('open-controls-btn'),
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),
            electionInfoPanel: document.getElementById('election-info-panel'),
            infoPanelTitle: document.getElementById('info-panel-title'),
            infoPanelContent: document.getElementById('info-panel-content'),
            infoPanelClose: document.getElementById('info-panel-close'),
        },

        initialize() {
            this.renderProvinceSelector();
            this.elements.panelCloseBtn.addEventListener('click', () => this.setPanelOpen(false));
            this.elements.openControlsBtn.addEventListener('click', () => this.setPanelOpen(true));
            this.elements.changeProvinceBtn.addEventListener('click', () => App.returnToWelcome());

            // Add election button listeners
            const election2019Btn = document.getElementById('view-2019-election-btn');
            const election2021Btn = document.getElementById('view-2021-election-btn');
            if (election2019Btn) {
                election2019Btn.addEventListener('click', () => App.loadElectionResults('2019'));
            }
            if (election2021Btn) {
                election2021Btn.addEventListener('click', () => App.loadElectionResults('2021'));
            }

            // Add election toggle listeners
            if (this.elements.toggle2019Btn) {
                this.elements.toggle2019Btn.addEventListener('click', () => App.toggleElectionYear('2019'));
            }
            if (this.elements.toggle2021Btn) {
                this.elements.toggle2021Btn.addEventListener('click', () => App.toggleElectionYear('2021'));
            }
            if (this.elements.changeElectionBtn) {
                this.elements.changeElectionBtn.addEventListener('click', () => App.returnToWelcome());
            }

            // Add view level toggle listeners
            if (this.elements.toggleRidingViewBtn) {
                this.elements.toggleRidingViewBtn.addEventListener('click', () => App.toggleViewLevel('riding'));
            }
            if (this.elements.togglePollViewBtn) {
                this.elements.togglePollViewBtn.addEventListener('click', () => App.toggleViewLevel('poll'));
            }
            if (this.elements.toggleAdvViewBtn) {
                this.elements.toggleAdvViewBtn.addEventListener('click', () => App.toggleViewLevel('advance'));
            }

            // Add info panel close listener
            if (this.elements.infoPanelClose) {
                this.elements.infoPanelClose.addEventListener('click', () => this.hideElectionInfo());
            }

            StateService.subscribe(this.handleStateChange.bind(this));
        },

        showElectionInfo() {
            this.elements.electionInfoPanel.classList.remove('hidden');
        },

        hideElectionInfo() {
            this.elements.electionInfoPanel.classList.add('hidden');
        },

        updateElectionInfo(title, content) {
            this.elements.infoPanelTitle.textContent = title;
            this.elements.infoPanelContent.innerHTML = content;
            this.showElectionInfo();
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
                this.elements.electionDisplay.classList.add('hidden');
            } else {
                this.elements.provinceDisplay.classList.add('hidden');
            }

            // Update Election Display
            if (state.showingElections && state.currentElectionYear) {
                this.elements.electionYear.textContent = `${state.currentElectionYear} Election`;
                this.elements.electionDisplay.classList.remove('hidden');
                this.elements.provinceDisplay.classList.add('hidden');

                // Update active button state
                this.elements.toggle2019Btn.classList.toggle('active', state.currentElectionYear === '2019');
                this.elements.toggle2021Btn.classList.toggle('active', state.currentElectionYear === '2021');

                // Show/hide loading state on toggle buttons
                if (state.isTogglingElection) {
                    this.elements.toggle2019Btn.disabled = true;
                    this.elements.toggle2021Btn.disabled = true;
                    this.elements.toggle2019Btn.classList.add('loading');
                    this.elements.toggle2021Btn.classList.add('loading');
                } else {
                    this.elements.toggle2019Btn.disabled = false;
                    this.elements.toggle2021Btn.disabled = false;
                    this.elements.toggle2019Btn.classList.remove('loading');
                    this.elements.toggle2021Btn.classList.remove('loading');
                }

                // Update view level toggle - always visible when showing elections
                const viewLevel = state.currentViewLevel || 'riding';
                this.elements.toggleRidingViewBtn.classList.toggle('active', viewLevel === 'riding');
                this.elements.togglePollViewBtn.classList.toggle('active', viewLevel === 'poll');
                this.elements.toggleAdvViewBtn.classList.toggle('active', viewLevel === 'advance');

                // Disable poll and advance buttons when in riding view (no riding selected yet)
                this.elements.togglePollViewBtn.disabled = !state.currentRidingNumber;
                this.elements.togglePollViewBtn.style.opacity = state.currentRidingNumber ? '1' : '0.5';
                this.elements.toggleAdvViewBtn.disabled = !state.currentRidingNumber;
                this.elements.toggleAdvViewBtn.style.opacity = state.currentRidingNumber ? '1' : '0.5';
            } else {
                this.elements.electionDisplay.classList.add('hidden');
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

        async loadElectionResults(year, isToggle = false) {
            try {
                // For toggles, show inline loading; for initial load, show full screen loading
                if (isToggle) {
                    StateService.setState({ isTogglingElection: true });
                } else {
                    StateService.setState({ isLoading: true, loadingMessage: `Loading ${year} election results...` });
                    UIManager.showWelcome(false);
                }

                // Load the election data with boundaries
                const electionData = await DataService.fetchGeoJSON(`election_boundaries_19-25/${year}_boundaries/geojson/${year}_riding_with_results_min.json`);

                StateService.setState({
                    electionData,
                    currentElectionYear: year,
                    currentViewLevel: 'riding',
                    currentRidingNumber: isToggle ? StateService.getState().currentRidingNumber : null,
                    isLoading: false,
                    isTogglingElection: false,
                    showingElections: true
                });

                // Display the election results on the map, preserving view if toggling
                MapService.displayElectionResults(electionData, isToggle);

            } catch (error) {
                console.error("Failed to load election data:", error);
                StateService.setState({ isLoading: false, isTogglingElection: false });
                if (!isToggle) {
                    UIManager.showWelcome(true);
                }
                alert(`Failed to load ${year} election results. Please check the console for details.`);
            }
        },

        async toggleElectionYear(year) {
            const state = StateService.getState();

            // Check if we're in poll view
            if (state.currentViewLevel === 'poll' && state.currentRidingNumber) {
                // Reload poll data for the same riding in the new year
                try {
                    StateService.setState({
                        isTogglingElection: true,
                        currentElectionYear: year
                    });

                    // Load poll data for this riding in the new year
                    const pollData = await DataService.fetchGeoJSON(
                        `election_boundaries_19-25/${year}_boundaries/geojson/poll_by_riding/${state.currentRidingNumber}_${year}_poll.json`
                    );

                    StateService.setState({
                        isTogglingElection: false
                    });

                    // Display poll results, preserving view
                    MapService.displayPollResults(pollData, state.currentRidingNumber, true);

                } catch (error) {
                    console.error("Failed to load poll data for new year:", error);
                    StateService.setState({ isTogglingElection: false });
                    alert(`Failed to load ${year} poll data. Please try again.`);
                }
            } else if (state.currentViewLevel === 'advance' && state.currentRidingNumber) {
                // Reload advance poll data for the same riding in the new year
                try {
                    StateService.setState({
                        isTogglingElection: true,
                        currentElectionYear: year
                    });

                    // Load advance poll data for this riding in the new year
                    const advData = await DataService.fetchGeoJSON(
                        `election_boundaries_19-25/${year}_boundaries/geojson/adv_by_riding/${state.currentRidingNumber}_${year}_adv.json`
                    );

                    StateService.setState({
                        isTogglingElection: false
                    });

                    // Display advance results, preserving view
                    MapService.displayAdvanceResults(advData, state.currentRidingNumber, true);

                } catch (error) {
                    console.error("Failed to load advance poll data for new year:", error);
                    StateService.setState({ isTogglingElection: false });
                    alert(`Failed to load ${year} advance poll data. Please try again.`);
                }
            } else {
                // We're in riding view, use the normal toggle
                await this.loadElectionResults(year, true);
            }
        },

        async viewPollByPoll(ridingNumber) {
            try {
                const state = StateService.getState();
                const year = state.currentElectionYear;

                StateService.setState({ isTogglingElection: true });

                // Close any open popups
                MapService.map.closePopup();

                // Load poll data for this riding
                const pollData = await DataService.fetchGeoJSON(
                    `election_boundaries_19-25/${year}_boundaries/geojson/poll_by_riding/${ridingNumber}_${year}_poll.json`
                );

                StateService.setState({
                    currentViewLevel: 'poll',
                    currentRidingNumber: ridingNumber,
                    isTogglingElection: false
                });

                MapService.displayPollResults(pollData, ridingNumber);

            } catch (error) {
                console.error("Failed to load poll data:", error);
                StateService.setState({ isTogglingElection: false });
                alert('Failed to load poll-by-poll data. Please try again.');
            }
        },

        async viewAdvancePolls(ridingNumber) {
            try {
                const state = StateService.getState();
                const year = state.currentElectionYear;

                StateService.setState({ isTogglingElection: true });

                // Close any open popups
                MapService.map.closePopup();

                // Load advance poll data for this riding
                const advData = await DataService.fetchGeoJSON(
                    `election_boundaries_19-25/${year}_boundaries/geojson/adv_by_riding/${ridingNumber}_${year}_adv.json`
                );

                StateService.setState({
                    currentViewLevel: 'advance',
                    currentRidingNumber: ridingNumber,
                    isTogglingElection: false
                });

                MapService.displayAdvanceResults(advData, ridingNumber);

            } catch (error) {
                console.error("Failed to load advance poll data:", error);
                StateService.setState({ isTogglingElection: false });
                alert('Failed to load advance poll data. Please try again.');
            }
        },

        async toggleViewLevel(level) {
            const state = StateService.getState();

            if (level === 'riding') {
                // Switch back to riding view
                await this.loadElectionResults(state.currentElectionYear, true);
                StateService.setState({ currentViewLevel: 'riding', currentRidingNumber: null });
            } else if (level === 'poll' && state.currentRidingNumber) {
                // Re-load poll view
                await this.viewPollByPoll(state.currentRidingNumber);
            } else if (level === 'advance' && state.currentRidingNumber) {
                // Load advance poll view
                await this.viewAdvancePolls(state.currentRidingNumber);
            }
        },

        returnToWelcome() {
            MapService.clearLayers();
            StateService.setState({
                currentProvinceId: null,
                currentElectionYear: null,
                showingElections: false,
                currentVisualization: null,
                currentRidingNumber: null,
                currentViewLevel: 'riding'
            });
            UIManager.hideElectionInfo();
            UIManager.resetToWelcome();
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

    // Expose App for inline onclick handlers
    window.App = App;

    App.initialize();
});