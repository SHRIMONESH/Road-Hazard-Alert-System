'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Route, AlertTriangle } from 'lucide-react';
import MapGL, { Source, Layer, Marker } from 'react-map-gl';

type LatLng = { lat: number; lon: number };
type Hazard = {
  cluster_id: string;
  lat: number;
  lon: number;
  score: number;
  count_detections: number;
};
type RouteResponse = {
  route: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  hazards: Hazard[];
};

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  'pk.eyJ1IjoiY29kZWJyYWluZGV2IiwiYSI6ImNsbmp3dmdjNzA3NTgycW4wc3Z6cjE0dzcifQ.x-2U7V0R2kY5rI71yB8y1A';

const BBOX = {
  lat_min: 13.035,
  lon_min: 80.225,
  lat_max: 13.065,
  lon_max: 80.255,
};

type Detection = {
  id: string;
  image_id: string;
  lat: number;
  lon: number;
  feature_class: string;
  image_url: string | null;
  captured_at: string;
  problem_title: string;
};

type BboxDetectionsResponse = {
  bbox: { lat_min: number; lon_min: number; lat_max: number; lon_max: number };
  detections: Detection[];
};

const BBOX_START: LatLng = { lat: BBOX.lat_min, lon: BBOX.lon_min };
const BBOX_END: LatLng = { lat: BBOX.lat_max, lon: BBOX.lon_max };
const BBOX_CENTER: LatLng = {
  lat: (BBOX.lat_min + BBOX.lat_max) / 2,
  lon: (BBOX.lon_min + BBOX.lon_max) / 2,
};

const Map = dynamic(() => Promise.resolve(MapGL), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center h-full text-gray-500">Loading Map...</div>
  ),
});

const HazardMapApp = () => {
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [viewState, setViewState] = useState({
    longitude: BBOX_CENTER.lon,
    latitude: BBOX_CENTER.lat,
    zoom: 13,
  });

  const handleSelectDetection = (d: Detection) => {
    setViewState((prev) => ({
      ...prev,
      longitude: d.lon,
      latitude: d.lat,
      zoom: 16,
    }));
  };

  const fetchHazards = async () => {
    setError(null);

    if (!MAPBOX_TOKEN) {
      setError('Mapbox access token is missing.');
      return;
    }

    setIsLoading(true);
    setRouteData(null);
    setDetections([]);

    const url = `/api/v1/route/hazards?start_lat=${BBOX_START.lat}&start_lng=${BBOX_START.lon}&end_lat=${BBOX_END.lat}&end_lng=${BBOX_END.lon}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `API request failed with status ${response.status}`);
      }

      const data: RouteResponse = await response.json();
      setRouteData(data);

      if (data.route && data.route.coordinates.length > 0) {
        setViewState((prev) => ({
          ...prev,
          longitude: BBOX_CENTER.lon,
          latitude: BBOX_CENTER.lat,
        }));
      }

      // Fetch detailed detections within bbox
      try {
        const detRes = await fetch('/api/v1/hazards/bbox-detections');
        if (!detRes.ok) {
          const detErrorText = await detRes.text();
          console.error('Failed to load detection details:', detErrorText);
        } else {
          const detJson: BboxDetectionsResponse = await detRes.json();
          setDetections(detJson.detections);
        }
      } catch (detErr: any) {
        console.error('Error loading detection details:', detErr);
      }
    } catch (err: any) {
      console.error(err);
      setError(`Failed to load hazards for bbox: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHazards();
  }, []);

  const mapLayers = useMemo(() => {
    if (!routeData) return [] as any[];

    const routeSource = {
      id: 'route-source',
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: routeData.route,
      },
    };

    const routeLayer = {
      id: 'route-layer',
      type: 'line',
      source: 'route-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#4F46E5',
        'line-width': 6,
        'line-opacity': 0.75,
      },
    };

    const hazardFeatures = routeData.hazards.map((h) => ({
      type: 'Feature',
      properties: {
        id: h.cluster_id,
        score: h.score,
        count: h.count_detections,
      },
      geometry: {
        type: 'Point',
        coordinates: [h.lon, h.lat],
      },
    }));

    const hazardSource = {
      id: 'hazard-source',
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: hazardFeatures,
      },
    };

    const hazardLayer = {
      id: 'hazard-layer',
      type: 'circle',
      source: 'hazard-source',
      paint: {
        'circle-color': '#EF4444',
        'circle-radius': ['get', 'count'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#B91C1C',
        'circle-opacity': 0.85,
      },
    };

    return [routeSource, routeLayer, hazardSource, hazardLayer];
  }, [routeData]);

  const renderHazardMarkers = () => {
    if (!routeData || routeData.hazards.length === 0) return null;

    return routeData.hazards.map((h) => (
      <Marker key={h.cluster_id} latitude={h.lat} longitude={h.lon} anchor="bottom">
        <AlertTriangle
          className="text-red-500 hover:text-red-700 transition duration-150 cursor-pointer shadow-lg"
          size={h.count_detections * 6 + 18}
          fill="rgba(239, 68, 68, 0.5)"
        />
      </Marker>
    ));
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="w-full md:w-80 bg-white p-6 shadow-xl flex flex-col z-10">
        <h1 className="text-3xl font-bold text-indigo-700 mb-2 flex items-center">
          <Route className="mr-2" size={28} />
          Chennai Road Hazards
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          View detected road hazards within the configured bbox area.
        </p>
        <div className="mb-4 text-xs text-gray-600 space-y-1">
          <p>
            <span className="font-semibold">Target:</span> Chennai (T. Nagar)
          </p>
          <p>
            <span className="font-semibold">Bbox:</span> {BBOX.lat_min},{BBOX.lon_min} – {BBOX.lat_max},{BBOX.lon_max}
          </p>
        </div>

        <button
          onClick={fetchHazards}
          disabled={isLoading}
          className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-150 disabled:bg-indigo-400 flex items-center justify-center mb-4"
        >
          {isLoading ? 'Loading hazards5' : (
            <>
              <Route size={20} className="mr-2" /> Reload Hazards
            </>
          )}
        </button>

        <div className="mt-6 pt-4 border-t border-gray-200">
          {error && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md text-sm mb-4">
              <strong>Error:</strong> {error}
            </div>
          )}
          {routeData && (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-700">Search Complete</p>
              <div
                className={`p-3 rounded-lg ${
                  routeData.hazards.length > 0 ? 'bg-red-50' : 'bg-green-50'
                }`}
              >
                <p className="text-sm">
                  <span className="font-bold">{routeData.hazards.length}</span> active hazards found
                  within bbox.
                </p>
                {routeData.hazards.length > 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    Highest Score: {Math.max(...routeData.hazards.map((h) => h.score)).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          )}

          {detections.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Active problems in bbox ({detections.length})
              </p>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {detections.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleSelectDetection(d)}
                    className="w-full text-left border border-gray-200 rounded-lg p-2 hover:border-indigo-400 hover:bg-indigo-50 transition"
                  >
                    <div className="flex space-x-2">
                      {d.image_url ? (
                        <img
                          src={d.image_url}
                          alt={d.problem_title}
                          className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-md bg-gray-200 flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0">
                          No image
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {d.problem_title}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {d.feature_class}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-1">
                          Lat {d.lat.toFixed(5)}, Lon {d.lon.toFixed(5)}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(d.captured_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-grow">
        <Map
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {mapLayers.map((item: any) =>
            item.type === 'geojson' ? (
              <Source key={item.id} id={item.id} type="geojson" data={item.data as any} />
            ) : (
              <Layer key={item.id} {...(item as any)} />
            ),
          )}
          {renderHazardMarkers()}
        </Map>
      </div>
    </div>
  );
};

export default HazardMapApp;
