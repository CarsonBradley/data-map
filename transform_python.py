#!/usr/bin/env python3
import json
import sys
from pyproj import Transformer

# Create transformer from EPSG:3347 to EPSG:4326
transformer = Transformer.from_crs("EPSG:3347", "EPSG:4326", always_xy=True)

def transform_coords(coords):
    """Recursively transform coordinates"""
    if isinstance(coords[0], list):
        for c in coords:
            transform_coords(c)
    elif isinstance(coords[0], (int, float)) and isinstance(coords[1], (int, float)):
        lon, lat = transformer.transform(coords[0], coords[1])
        coords[0] = lon
        coords[1] = lat

if len(sys.argv) != 3:
    print("Usage: python3 transform_python.py <code> <abbr>")
    sys.exit(1)

code, abbr = sys.argv[1], sys.argv[2]
input_path = f"new_boundaries/provinces/da_{code}_{abbr}.geojson"
output_path = f"new_boundaries/provinces/da_{code}_{abbr}_wgs84.geojson"

print(f"Transforming {abbr}...")
print("Reading and parsing JSON...")

with open(input_path, 'r') as f:
    geo_data = json.load(f)

print(f"Transforming {len(geo_data['features'])} features...")
for i, feature in enumerate(geo_data['features']):
    if feature.get('geometry') and feature['geometry'].get('coordinates'):
        transform_coords(feature['geometry']['coordinates'])
    if (i + 1) % 1000 == 0:
        print(f"  Progress: {i + 1}/{len(geo_data['features'])}", end='\r')

print(f"\n  Transformed all features")
print("Writing output...")

with open(output_path, 'w') as f:
    json.dump(geo_data, f)

print(f"Saved {output_path}")
