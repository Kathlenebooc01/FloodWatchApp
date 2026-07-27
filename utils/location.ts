import * as Location from 'expo-location';

export interface FullAddress {
    /** Complete formatted address, e.g. "Zone 1, Buaya, Lapu-Lapu City" */
    full: string;
    /** Short version: barangay + city, e.g. "Buaya, Lapu-Lapu City" */
    short: string;
    /** City/municipality only in uppercase, e.g. "LAPU-LAPU CITY" */
    city: string;
}
    
// ─── Module-level cache ────────────────────────────────────────────────────
// Once resolved, the address is reused for the entire app session.
// GPS + Nominatim only run ONCE no matter how many screens call this.
let _cachedAddress: FullAddress | null = null;
let _pendingPromise: Promise<FullAddress> | null = null;
// ──────────────────────────────────────────────────────────────────────────

    /** Detect Google Plus Codes like "8X9V+8R8" — never show these */
function isPlusCode(value: string): boolean {
    return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/i.test(value.trim());
}

/** Fix city names that Google/Nominatim return without the "City" suffix */
function fixCityName(raw: string): string {
    if (!raw) return '';
    const lower = raw.toLowerCase().trim();
    const fixes: Record<string, string> = {
        'lapu-lapu':      'Lapu-Lapu City',
        'lapulapu':       'Lapu-Lapu City',
        'mandaue':        'Mandaue City',
        'talisay':        'Talisay City',
        'cebu':           'Cebu City',
        'naga':           'Naga City',
        'toledo':         'Toledo City',
        'carcar':         'Carcar City',
        'danao':          'Danao City',
        'bogo':           'Bogo City',
        'davao':          'Davao City',
        'makati':         'Makati City',
        'quezon':         'Quezon City',
        'pasig':          'Pasig City',
        'bacolod':        'Bacolod City',
        'iloilo':         'Iloilo City',
        'zamboanga':      'Zamboanga City',
        'cagayan de oro': 'Cagayan de Oro City',
        'general santos': 'General Santos City',
    };
    if (fixes[lower]) return fixes[lower];
    if (lower.includes('city') || lower.includes('municipality')) return raw.trim();
    return raw.trim();
}

/**
 * Calls Google Geocoding API - Most accurate for Philippine addresses
 * FREE - 40,000 requests per month
 */
async function fetchGoogleGeocode(lat: number, lng: number): Promise<{
    zone: string;
    barangay: string;
    city: string;
    province: string;
} | null> {
    try {
        // Google Geocoding API - No API key needed for basic usage
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=sublocality|locality&language=en`;
        
        console.log('🌐 Calling Google Geocoding API...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.log('⚠️ Google Geocoding HTTP error:', response.status);
            return null;
        }

        const data = await response.json();
        
        if (data.status !== 'OK' || !data.results || data.results.length === 0) {
            console.log('⚠️ Google Geocoding: No results');
            return null;
        }

        console.log('📍 Google response:', data.results[0]);

        const components = data.results[0].address_components;
        let barangay = '';
        let city = '';
        let province = '';
        let zone = '';

        // Parse address components
        for (const comp of components) {
            const types = comp.types;
            
            // Barangay is usually "sublocality_level_1" or "neighborhood"
            if (types.includes('sublocality_level_1') || types.includes('sublocality') || types.includes('neighborhood')) {
                barangay = comp.long_name;
            }
            // City
            else if (types.includes('locality')) {
                city = comp.long_name;
            }
            // Province
            else if (types.includes('administrative_area_level_2')) {
                province = comp.long_name;
            }
            // Zone might be in premise or subpremise
            else if (types.includes('premise') || types.includes('subpremise')) {
                zone = comp.long_name;
            }
        }

        city = fixCityName(city);
        
        console.log(`✅ Google parsed: Barangay="${barangay}", City="${city}", Zone="${zone}"`);
        return { zone, barangay, city, province };
    } catch (error: any) {
        console.log('❌ Google Geocoding error:', error.message);
        return null;
    }
}

/**
 * Calls Nominatim (OpenStreetMap) reverse geocoding API.
 * FREE — no API key, no billing required.
 *
 * Nominatim returns an `address` object with fields like:
 *   village / suburb / neighbourhood → barangay
 *   city / town / municipality       → city
 *   province / state                 → province
 */
async function fetchNominatimGeocode(lat: number, lng: number): Promise<{
    zone: string;
    barangay: string;
    city: string;
    province: string;
} | null> {
    try {
        const url =
            `https://nominatim.openstreetmap.org/reverse` +
            `?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=en`;

        console.log('🌐 Calling Nominatim API...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'FloodWatchApp/1.0 (flood-watch-cebu)',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.log('⚠️ Nominatim HTTP error:', response.status);
            return null;
        }

        const data = await response.json();
        const a = data?.address;
        if (!a) {
            console.log('⚠️ Nominatim: No address data');
            return null;
        }

        console.log('📍 Nominatim response:', data);

        // Nominatim address fields for Philippine residential areas:
        //   quarter / neighbourhood / suburb / village → barangay
        //   city / town / municipality                 → city
        //   province / state                           → province
        //   road                                       → street
        //   house_number                               → zone/house

        const barangay =
            a.quarter        ||
            a.neighbourhood  ||
            a.suburb         ||
            a.village        ||
            a.hamlet         ||
            '';

        const city = fixCityName(
            a.city           ||
            a.town           ||
            a.municipality   ||
            a.county         ||
            ''
        );

        const province =
            a.province ||
            a.state    ||
            '';

        // zone: house_number in PH residential areas is often the zone/purok
        const houseNum = a.house_number ?? '';
        const zone = houseNum
            ? (/^\d+$/.test(houseNum.trim()) ? `Zone ${houseNum.trim()}` : houseNum)
            : '';

        console.log(`✅ Nominatim parsed: Barangay="${barangay}", City="${city}", Zone="${zone}"`);
        return { zone, barangay, city, province };
    } catch (error: any) {
        console.log('❌ Nominatim error:', error.message);
        return null;
    }
}

/**
 * Assembles the final address string from Nominatim + expo-location data.
 * Nominatim is primary (has barangay); expo-location is fallback.
 */
function assembleAddress(
    nom: Awaited<ReturnType<typeof fetchNominatimGeocode>>,
    expo: Location.LocationGeocodedAddress
): FullAddress {
    const parts: string[] = [];

    const zone     = nom?.zone     || '';
    const barangay = nom?.barangay || expo.district || expo.subregion || '';
    const city     = nom?.city     || fixCityName(expo.city || expo.subregion || '');
    const province = nom?.province || '';

    // expo street info as fallback
    const expoName = (expo.name && !isPlusCode(expo.name)) ? expo.name.trim() : '';
    const street   = expo.street || '';
    const streetNo = expo.streetNumber || '';

    console.log('🏗️ Building address from:', { 
        zone, barangay, city, street, streetNo, expoName,
        expoDistrict: expo.district,
        expoRegion: expo.region,
        expoSubregion: expo.subregion
    });

    // --- Build parts ---
    // Zone / Purok
    if (zone && zone !== barangay && zone !== city) {
        parts.push(zone);
    } else if (!zone && expoName && expoName !== barangay && expoName !== city) {
        // fallback: use expo name if not a plus code
        const cleaned = /^\d+$/.test(expoName) ? `Zone ${expoName}` : expoName;
        parts.push(cleaned);
    }

    // Street
    if (streetNo && street) {
        parts.push(`${streetNo} ${street}`);
    } else if (street) {
        parts.push(street);
    }

    // Barangay - more aggressive fallback
    if (barangay) {
        parts.push(barangay);
    } else if (expo.district) {
        parts.push(expo.district);
    } else if (expo.subregion && expo.subregion !== city) {
        parts.push(expo.subregion);
    }

    // City
    if (city) parts.push(city);

    // Province — skip island groups
    const skipList = ['central visayas', 'metro manila', 'ncr', city.toLowerCase(), ''];
    if (province && !skipList.includes(province.toLowerCase())) {
        parts.push(province);
    }

    const full  = parts.length > 0 ? parts.join(', ') : 'Location Unavailable';
    const short = [barangay, city].filter(Boolean).join(', ') || city || full;

    console.log('✅ Final address:', { full, short, city: city.toUpperCase() });

    return { full, short, city: city.toUpperCase() };
}

/**
 * Main export — gets current GPS position and resolves a full Philippine address.
 *
 * CACHED — GPS + Nominatim only run once per app session.
 * Every subsequent call returns instantly from memory.
 */
export async function getCurrentFullAddress(): Promise<FullAddress> {
    // Return cached result immediately — no GPS, no network
    if (_cachedAddress) return _cachedAddress;

    // If a fetch is already in-flight (e.g. dashboard + profile both called at startup),
    // share the same promise instead of making two GPS requests
    if (_pendingPromise) return _pendingPromise;

    _pendingPromise = (async () => {
        try {
            console.log('📍 Requesting location permission...');
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.log('❌ Location permission denied');
                throw new Error('PERMISSION_DENIED');
            }

            console.log('📡 Getting GPS position...');
            const positionPromise = Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High, // Use HIGH for most accurate GPS
            });

            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('GPS_TIMEOUT')), 15000) // 15 seconds for GPS
            );

            const position = await Promise.race([positionPromise, timeoutPromise]);
            const { latitude, longitude } = position.coords;
            console.log(`✅ GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);

            // Strategy: Try Google first (fast + accurate), then Nominatim, then expo-location
            let geocodeData = null;

            // 1. Try Google Geocoding (best for Philippines)
            console.log('🔍 Step 1: Trying Google Geocoding (most accurate)...');
            try {
                geocodeData = await fetchGoogleGeocode(latitude, longitude);
                if (geocodeData && geocodeData.barangay) {
                    console.log('✅ Google found barangay:', geocodeData.barangay);
                }
            } catch (err: any) {
                console.log('⚠️ Google failed:', err.message);
            }

            // 2. If Google didn't get barangay, try Nominatim
            if (!geocodeData || !geocodeData.barangay) {
                console.log('🔍 Step 2: Trying Nominatim as backup...');
                try {
                    const nominatimData = await fetchNominatimGeocode(latitude, longitude);
                    if (nominatimData && nominatimData.barangay) {
                        geocodeData = nominatimData;
                        console.log('✅ Nominatim found barangay:', nominatimData.barangay);
                    }
                } catch (err: any) {
                    console.log('⚠️ Nominatim failed:', err.message);
                }
            }

            // 3. Always get expo-location as final fallback
            console.log('🔍 Step 3: Getting expo-location data...');
            let expoResults: Location.LocationGeocodedAddress[] = [];
            try {
                expoResults = await Location.reverseGeocodeAsync({ latitude, longitude });
                console.log('✅ Expo geocode success');
            } catch (err: any) {
                console.log('⚠️ Expo geocode failed:', err.message);
            }

            // Assemble address with best available data
            if (geocodeData && geocodeData.barangay) {
                // We have barangay from Google or Nominatim!
                const expoGeo = expoResults?.[0] ?? ({} as Location.LocationGeocodedAddress);
                const result = assembleAddress(geocodeData, expoGeo);
                console.log('✅ Final location with barangay:', result.full);
                _cachedAddress = result;
                _pendingPromise = null;
                return result;
            }

            // Fallback: Use expo-location only (no barangay)
            if (expoResults && expoResults.length > 0) {
                const result = assembleAddress(null, expoResults[0]);
                console.log('⚠️ Final location (no barangay):', result.full);
                _cachedAddress = result;
                _pendingPromise = null;
                return result;
            }

            // Last resort: use coordinates
            console.log('⚠️ No geocoding results, using coordinates');
            const result: FullAddress = {
                full: `GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
                short: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
                city: 'LAPU-LAPU CITY'
            };
            _cachedAddress = result;
            _pendingPromise = null;
            return result;
        } catch (error: any) {
            console.error('❌ Location error:', error.message);
            _pendingPromise = null;
            throw error;
        }
    })();

    return _pendingPromise;
}

/** Call this to force a fresh location fetch (e.g. user taps a refresh button) */
export function clearLocationCache(): void {
    _cachedAddress = null;
    _pendingPromise = null;
}

export function buildFullAddress(geo: Location.LocationGeocodedAddress): FullAddress {
    return assembleAddress(null, geo);
}
