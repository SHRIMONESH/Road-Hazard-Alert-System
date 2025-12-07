// Import dotenv and configure it to load .env.local
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from project root (one level up from dist/)
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Import dependencies
import { createClient } from '@supabase/supabase-js'
import * as turf from '@turf/turf'
import { LineString } from 'geojson'; 

// --- Configuration ---
const CONFIG = {
    CLUSTER_EPS_METERS: parseFloat(process.env.CLUSTER_EPS_METERS || '15'),
    CLUSTER_MIN_SAMPLES: parseInt(process.env.CLUSTER_MIN_SAMPLES || '2'),
    
    // Retry configuration
    MAX_RETRIES: 5,
    BASE_DELAY: 2000,
    MAX_DELAY: 60000,
    TIMEOUT: 120000,
    
    // Batch sizes
    OSM_BATCH_SIZE: 500,
    DB_INSERT_BATCH_SIZE: 500,
    MAPILLARY_BATCH_SIZE: 500,
    MAPILLARY_PAGE_LIMIT: 2000, // Maximum images per page
    DETECTION_FETCH_BATCH_SIZE: 20, // Fetch detections for N images concurrently
    DELAY_BETWEEN_BATCHES: 500, // ms delay between detection batches
    
    // Chennai bounding box
    CHENNAI_BBOX: {
        lat_min: 13.0350,
        lon_min: 80.2250,
        lat_max: 13.0650,
        lon_max: 80.2550,
    },
};

// --- Environment Validation ---
console.log('Environment check:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Loaded' : '✗ MISSING');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Loaded' : '✗ MISSING');
console.log('MAPILLARY_API_KEY:', process.env.MAPILLARY_API_KEY ? '✓ Loaded' : '✗ MISSING');
console.log('OVERPASS_API_URL:', process.env.OVERPASS_API_URL ? '✓ Loaded' : '✗ MISSING');

const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MAPILLARY_API_KEY', 'OVERPASS_API_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('\n❌ ERROR: Missing required environment variables:', missingEnvVars);
    process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const mapillaryApiKey = process.env.MAPILLARY_API_KEY!;
const overpassApiUrl = process.env.OVERPASS_API_URL!;

console.log('\n✓ All environment variables loaded successfully\n');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- Enhanced Fetch with Exponential Backoff ---
async function safeFetch(url: string, options: RequestInit = {}, maxRetries = CONFIG.MAX_RETRIES): Promise<Response> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
        
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(CONFIG.BASE_DELAY * Math.pow(2, attempt - 1), CONFIG.MAX_DELAY);
                console.log(`   ⏸️  Rate limited. Waiting ${Math.round(delay / 1000)}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            if (response.status >= 500) {
                if (attempt < maxRetries) {
                    const delay = Math.min(CONFIG.BASE_DELAY * Math.pow(2, attempt - 1), CONFIG.MAX_DELAY);
                    console.log(`   ⚠️  Server error ${response.status}. Retry ${attempt}/${maxRetries} in ${Math.round(delay / 1000)}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw new Error(`Server error ${response.status}: ${response.statusText}`);
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
            
        } catch (error: any) {
            clearTimeout(timeout);
            if (attempt >= maxRetries) throw error;
            const delay = Math.min(CONFIG.BASE_DELAY * Math.pow(2, attempt - 1), CONFIG.MAX_DELAY);
            console.log(`   ⚠️  Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
            console.log(`   ⏳ Retrying in ${Math.round(delay / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('All fetch attempts failed');
}

// --- OSM Data Fetching ---
async function fetchAndStoreOSMWays(bbox: string): Promise<boolean> {
    console.log('📍 Fetching OSM ways...');
    
    const overpassQuery = `
        [out:json][timeout:90];
        (way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service)$"](${bbox}););
        out geom;
    `;

    try {
        const response = await safeFetch(overpassApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: overpassQuery,
        }, 3);

        const osmData = await response.json();
        const ways = osmData.elements.filter((e: any) => e.type === 'way');

        if (ways.length === 0) {
            console.log('   ⚠️  No OSM ways found\n');
            return false;
        }

        console.log(`   ✓ Found ${ways.length} OSM ways`);

        const records = ways
            .map((way: any) => {
                if (!way.geometry || way.geometry.length < 2) return null;
                const tags = way.tags || {};
                return {
                    way_id: way.id,
                    geom: turf.lineString(way.geometry.map((g: any) => [g.lon, g.lat])).geometry,
                    highway: tags.highway || 'unknown',
                    tags_json: tags,
                };
            })
            .filter((r: any) => r !== null);

        for (let i = 0; i < records.length; i += CONFIG.OSM_BATCH_SIZE) {
            const batch = records.slice(i, i + CONFIG.OSM_BATCH_SIZE);
            const { error } = await supabase.from('osm_ways').upsert(batch);
            if (error) {
                console.error(`   ❌ Error inserting OSM batch:`, error);
                return false;
            }
        }

        console.log(`   ✓ Inserted ${records.length} OSM ways\n`);
        return true;

    } catch (error: any) {
        console.error('   ❌ OSM fetch failed:', error.message, '\n');
        return false;
    }
}

// --- Mapillary: Fetch Image Metadata ---
async function fetchMapillaryImages(bbox: string, startDate: string): Promise<any[]> {
    console.log('📷 Fetching Mapillary images...');
    const allImages: any[] = [];
    let page = 1;
    
    // CRITICAL: Use correct fields - NO detections field here
    let nextUrl: string | null = `https://graph.mapillary.com/images?fields=id,geometry,captured_at,sequence,thumb_256_url&bbox=${bbox}&start_captured_at=${startDate}&limit=2000&access_token=${mapillaryApiKey}`;
    
    while (nextUrl) {
        console.log(`   📄 Page ${page}...`);
        
        try {
            const response = await safeFetch(nextUrl);
            const data = await response.json();
            
            if (data.data && Array.isArray(data.data)) {
                allImages.push(...data.data);
                console.log(`      ✓ ${data.data.length} images (Total: ${allImages.length})`);
            }
            
            nextUrl = data.paging?.next || null;
            page++;
            
            if (nextUrl) await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error: any) {
            console.error(`   ❌ Page ${page} failed:`, error.message);
            if (allImages.length > 0) {
                console.log(`   ⚠️  Continuing with ${allImages.length} images\n`);
                break;
            }
            throw error;
        }
    }
    
    return allImages;
}

// --- Mapillary: Fetch Detections for Single Image ---
async function fetchImageDetections(imageId: string): Promise<any[]> {
    const url = `https://graph.mapillary.com/${imageId}/detections?fields=id,value,created_at,geometry&access_token=${mapillaryApiKey}`;
    
    try {
        const response = await safeFetch(url, {}, 2); // Fewer retries for individual images
        const data = await response.json();
        return Array.isArray(data.data) ? data.data : [];
    } catch (error) {
        // Silently fail individual images - don't break the whole batch
        return [];
    }
}

// --- Mapillary: Fetch ALL Detections in Batches ---
async function fetchAllImageDetections(images: any[]): Promise<Map<string, any[]>> {
    console.log(`\n🔍 Fetching detections for ${images.length} images...`);
    console.log(`   Batch size: ${CONFIG.DETECTION_FETCH_BATCH_SIZE} concurrent requests`);
    
    const detectionsMap = new Map<string, any[]>();
    let totalDetections = 0;
    let imagesWithDetections = 0;
    let processed = 0;
    
    for (let i = 0; i < images.length; i += CONFIG.DETECTION_FETCH_BATCH_SIZE) {
        const batch = images.slice(i, i + CONFIG.DETECTION_FETCH_BATCH_SIZE);
        const batchNum = Math.floor(i / CONFIG.DETECTION_FETCH_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(images.length / CONFIG.DETECTION_FETCH_BATCH_SIZE);
        
        // Fetch detections concurrently for this batch
        const results = await Promise.all(
            batch.map(async (img) => ({
                imageId: img.id,
                detections: await fetchImageDetections(img.id)
            }))
        );
        
        // Process results
        for (const { imageId, detections } of results) {
            if (detections.length > 0) {
                detectionsMap.set(imageId, detections);
                imagesWithDetections++;
                totalDetections += detections.length;
            }
        }
        
        processed += batch.length;
        console.log(`   📦 Batch ${batchNum}/${totalBatches}: Processed ${processed}/${images.length} (${imagesWithDetections} with detections, ${totalDetections} total)`);
        
        // Delay between batches to avoid rate limits
        if (i + CONFIG.DETECTION_FETCH_BATCH_SIZE < images.length) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_BATCHES));
        }
    }
    
    console.log(`\n   📊 Detection Summary:`);
    console.log(`      - Images processed: ${images.length}`);
    console.log(`      - Images with detections: ${imagesWithDetections} (${Math.round(imagesWithDetections / images.length * 100)}%)`);
    console.log(`      - Total detections found: ${totalDetections}`);
    
    return detectionsMap;
}

// --- Store Detections to Database ---
async function storeDetections(images: any[], detectionsMap: Map<string, any[]>): Promise<boolean> {
    console.log('\n💾 Storing detections to database...');
    
    const records: any[] = [];
    const detectionTypes = new Map<string, number>();

    for (const img of images) {
        const detections = detectionsMap.get(img.id);
        if (!detections || detections.length === 0) continue;

        const capturedAt = typeof img.captured_at === 'number'
            ? new Date(img.captured_at).toISOString()
            : img.captured_at;

        for (const det of detections) {
            if (!det.value) continue;

            // Use detection geometry if available, otherwise use image location
            const coords = det.geometry?.coordinates || img.geometry.coordinates;
            
            records.push({
                image_id: img.id,
                lat: coords[1],
                lon: coords[0],
                geom: `POINT(${coords[0]} ${coords[1]})`,
                captured_at: capturedAt,
                feature_class: det.value,
                confidence: null, // Mapillary doesn't provide confidence in detections endpoint
                image_url: img.thumb_256_url,
            });

            detectionTypes.set(det.value, (detectionTypes.get(det.value) || 0) + 1);
        }
    }

    if (records.length === 0) {
        console.log('   ⚠️  No detections to store\n');
        return false;
    }

    console.log(`   📝 Detection types (${detectionTypes.size} unique):`);
    Array.from(detectionTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15) // Show top 15
        .forEach(([type, count]) => console.log(`      - ${type}: ${count}`));
    
    if (detectionTypes.size > 15) {
        console.log(`      ... and ${detectionTypes.size - 15} more types`);
    }

    // Insert in batches
    console.log(`\n   💾 Inserting ${records.length} detections...`);
    for (let i = 0; i < records.length; i += CONFIG.DB_INSERT_BATCH_SIZE) {
        const batch = records.slice(i, i + CONFIG.DB_INSERT_BATCH_SIZE);
        const { error } = await supabase.from('mapillary_detections').upsert(batch);

        if (error) {
            console.error(`   ❌ Insert batch ${Math.floor(i / CONFIG.DB_INSERT_BATCH_SIZE) + 1} failed:`, error);
            return false;
        }
    }

    console.log(`   ✓ Successfully stored ${records.length} detections\n`);
    return true;
}

// --- Clustering ---
async function clusterDetections(): Promise<boolean> {
    console.log('🔍 Clustering detections...');
    console.log(`   Parameters: ${CONFIG.CLUSTER_EPS_METERS}m radius, min ${CONFIG.CLUSTER_MIN_SAMPLES} points`);
    
    try {
        const { error } = await supabase.rpc('cluster_recent_detections', {
            eps_meters: CONFIG.CLUSTER_EPS_METERS,
            min_points: CONFIG.CLUSTER_MIN_SAMPLES,
        });

        if (error) {
            console.error('   ❌ Clustering error:', error);
            return false;
        }

        console.log('   ✓ Clustering completed\n');
        return true;
        
    } catch (error: any) {
        console.error('   ❌ Clustering failed:', error.message, '\n');
        return false;
    }
}

// --- Main Ingestion ---
async function runIngestion() {
    console.log('═══════════════════════════════════════════════');
    console.log('  Chennai Road Hazard Detection - Ingestion');
    console.log('═══════════════════════════════════════════════\n');

    const results = { osm: false, mapillary: false, clustering: false };

    try {
        // Get last run time
        const { data: state } = await supabase
            .from('ingestion_state')
            .select('last_run_at')
            .eq('id', 1)
            .single();

        const FORCE_START_DATE = '2024-01-01T00:00:00Z';
        const lastRunAt = FORCE_START_DATE || state?.last_run_at || new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
        
        console.log(`⚠️  MODE: ${FORCE_START_DATE ? 'FORCED BACKFILL' : 'INCREMENTAL'}`);
        console.log(`   Start date: ${lastRunAt}\n`);

        const bbox = `${CONFIG.CHENNAI_BBOX.lat_min},${CONFIG.CHENNAI_BBOX.lon_min},${CONFIG.CHENNAI_BBOX.lat_max},${CONFIG.CHENNAI_BBOX.lon_max}`;
        console.log('📍 Target: Chennai (T. Nagar), Tamil Nadu, India');
        console.log(`   Bbox: ${bbox}`);
        console.log(`   Area: ~3km × 3km\n`);

        // Step 1: OSM
        console.log('═══ STEP 1: OpenStreetMap Data ═══');
        results.osm = await fetchAndStoreOSMWays(bbox);

        // Step 2: Mapillary Images
        console.log('═══ STEP 2: Mapillary Images ═══');
        const mapillaryBbox = `${CONFIG.CHENNAI_BBOX.lon_min},${CONFIG.CHENNAI_BBOX.lat_min},${CONFIG.CHENNAI_BBOX.lon_max},${CONFIG.CHENNAI_BBOX.lat_max}`;
        const normalizedDate = new Date(lastRunAt).toISOString().replace(/\.\d{3}Z$/, 'Z');
        
        console.log(`   📍 Bbox: ${mapillaryBbox}`);
        console.log(`   📅 Since: ${normalizedDate}\n`);
        
        const images = await fetchMapillaryImages(mapillaryBbox, normalizedDate);
        
        if (images.length === 0) {
            console.log('   ℹ️  No images found in this area\n');
            results.mapillary = true;
        } else {
            console.log(`\n   ✓ Retrieved ${images.length} images`);
            
            // Step 3: Fetch Detections
            console.log('\n═══ STEP 3: Fetch Detections ═══');
            const detectionsMap = await fetchAllImageDetections(images);
            
            // Step 4: Store Detections
            console.log('═══ STEP 4: Store Detections ═══');
            if (detectionsMap.size > 0) {
                results.mapillary = await storeDetections(images, detectionsMap);
            } else {
                console.log('   ℹ️  No detections found for any images');
                console.log('   💡 Images may not have been processed by Mapillary yet\n');
                results.mapillary = true;
            }
        }

        // Step 5: Clustering
        if (results.mapillary) {
            console.log('═══ STEP 5: Clustering ═══');
            results.clustering = await clusterDetections();
        }

        // Update state
        if (!FORCE_START_DATE) {
            await supabase.from('ingestion_state').upsert(
                { id: 1, last_run_at: new Date().toISOString() },
                { onConflict: 'id' }
            );
        }

        // Summary
        console.log('═══════════════════════════════════════════════');
        console.log('📊 INGESTION SUMMARY');
        console.log('═══════════════════════════════════════════════');
        console.log(`   OSM Data:         ${results.osm ? '✓ Success' : '✗ Failed'}`);
        console.log(`   Mapillary Data:   ${results.mapillary ? '✓ Success' : '✗ Failed'}`);
        console.log(`   Clustering:       ${results.clustering ? '✓ Success' : results.mapillary ? '✗ Failed' : '○ Skipped'}`);
        console.log('═══════════════════════════════════════════════');
        
        const success = results.osm || results.mapillary;
        console.log(success ? '✓ Ingestion completed\n' : '⚠️  Ingestion completed with failures\n');
        process.exit(success ? 0 : 1);

    } catch (error: any) {
        console.error('═══════════════════════════════════════════════');
        console.error('💥 FATAL ERROR');
        console.error('═══════════════════════════════════════════════');
        console.error('Message:', error.message);
        if (error.stack) console.error('Stack:', error.stack);
        console.error('═══════════════════════════════════════════════\n');
        process.exit(1);
    }
}

runIngestion();