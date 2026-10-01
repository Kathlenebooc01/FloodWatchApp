import * as Location from 'expo-location';

export interface FullAddress {
    /** Complete formatted address, e.g. "Zone 1, Buaya, Lapu-Lapu City" */
    full: string;
    /** Short version: barangay + city, e.g. "Buaya, Lapu-Lapu City" */
    short: string;
    /** City/municipality only in uppercase, e.g. "LAPU-LAPU CITY" */
    city: string;
    /** Latitude from GPS */
    latitude: number;
    /** Longitude from GPS */
    longitude: number;
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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout to allow full barangay resolution

        const response = await fetch(url, {
            headers: {
                // Nominatim requires a User-Agent identifying your app
                'User-Agent': 'FloodWatchApp/1.0 (flood-watch-cebu)',
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const data = await response.json();
        const a = data?.address;
        if (!a) return null;

        // Nominatim address fields for Philippine residential areas:
        //   city_district / quarter / neighbourhood / suburb / village → barangay
        //   city / town / municipality                 → city
        //   province / state                           → province
        //   road                                       → street
        //   house_number                               → zone/house

        const barangay =
            a.city_district  ||
            a.quarter        ||
            a.neighbourhood  ||
            a.suburb         ||
            a.village        ||
            a.hamlet         ||
            a.residential    ||
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

        return { zone, barangay, city, province };
    } catch {
        return null;
    }
}

/**
 * Calls BigDataCloud free reverse geocoding API.
 * Parses the localityInfo.administrative array to find the exact barangay (adminLevel 9/10).
 */
async function fetchBigDataCloudGeocode(lat: number, lng: number): Promise<{ barangay: string; city: string; province: string } | null> {
    try {
        const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const data = await response.json();
        const adminList: Array<{name: string; adminLevel: number}> = data?.localityInfo?.administrative || [];

        // Philippine admin levels:
        //  2  = Country
        //  3  = Region  
        //  6  = Province/City
        //  9  = Municipality/City (lower)
        //  10 = Barangay
        // Sort by highest adminLevel (most specific) first
        const sorted = [...adminList].sort((a, b) => b.adminLevel - a.adminLevel);

        // Barangay is the most specific level (10), then 9
        const barangayEntry = sorted.find(a => a.adminLevel >= 9);
        const barangay = barangayEntry?.name || '';

        // City is adminLevel 6
        const cityEntry = adminList.find(a => a.adminLevel === 6);
        const city = fixCityName(cityEntry?.name || data.city || '');

        const province = data.principalSubdivision?.replace(/\s*\(.*?\)/, '').trim() || '';

        console.log('🌍 BigDataCloud result:', { barangay, city, province, adminList });
        return { barangay, city, province };
    } catch {
        return null;
    }
}

/**
 * Assembles the final address string from Nominatim + BigDataCloud + expo-location data.
 * Nominatim is primary (has barangay); BigDataCloud is secondary; expo-location is fallback.
 */
function assembleAddress(
    nom: Awaited<ReturnType<typeof fetchNominatimGeocode>>,
    bigData: Awaited<ReturnType<typeof fetchBigDataCloudGeocode>>,
    expo: Location.LocationGeocodedAddress,
    latitude: number = 0,
    longitude: number = 0,
): FullAddress {
    const parts: string[] = [];

    const zone     = nom?.zone     || '';
    const barangay = nom?.barangay || bigData?.barangay || expo.district || '';
    const city     = nom?.city     || bigData?.city     || fixCityName(expo.city || expo.subregion || '');
    const province = nom?.province || bigData?.province || '';

    // expo street info as fallback
    const expoName = (expo.name && !isPlusCode(expo.name)) ? expo.name.trim() : '';
    const street   = expo.street || '';
    const streetNo = expo.streetNumber || '';

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

    // Barangay
    if (barangay) parts.push(barangay);

    // City
    if (city) parts.push(city);

    // Province — skip island groups
    const skipList = ['central visayas', 'metro manila', 'ncr', city.toLowerCase(), ''];
    if (province && !skipList.includes(province.toLowerCase())) {
        parts.push(province);
    }

    const full  = parts.length > 0 ? parts.join(', ') : 'Location Unavailable';
    const short = [barangay, city].filter(Boolean).join(', ') || full;

    return { full, short, city: city.toUpperCase(), latitude, longitude };
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
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('PERMISSION_DENIED');

        // Force high accuracy GPS for the text address to get the exact barangay and street
        const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Highest,
        });

        const { latitude, longitude } = position.coords;

        // Run all three in parallel — Nominatim, BigDataCloud, and expo-location fallback
        const [expoResults, nominatimData, bigDataCloudData] = await Promise.all([
            Location.reverseGeocodeAsync({ latitude, longitude }).catch(e => {
                console.warn('Expo reverse geocoding failed', e);
                return null;
            }),
            fetchNominatimGeocode(latitude, longitude),
            fetchBigDataCloudGeocode(latitude, longitude),
        ]);

        if (!expoResults?.length && !nominatimData && !bigDataCloudData) throw new Error('NO_RESULTS');

        const expoGeo = expoResults?.[0] ?? ({} as Location.LocationGeocodedAddress);
        const result = assembleAddress(nominatimData, bigDataCloudData, expoGeo, latitude, longitude);

        // Store in cache for all future calls
        _cachedAddress = result;
        _pendingPromise = null;
        return result;
    })();

    return _pendingPromise;
}

/** Call this to force a fresh location fetch (e.g. user taps a refresh button) */
export function clearLocationCache(): void {
    _cachedAddress = null;
    _pendingPromise = null;
}

export function buildFullAddress(geo: Location.LocationGeocodedAddress): FullAddress {
    return assembleAddress(null, null, geo, 0, 0);
}

/** 
 * Skips the slow reverse geocoding process and ONLY returns the coordinates.
 * This is used for weather fetching so it can be completely instant.
 */
export async function getFastCoordinates(): Promise<{ latitude: number; longitude: number }> {
    // If we already have a cached address, use its exact coordinates immediately!
    if (_cachedAddress && _cachedAddress.latitude && _cachedAddress.longitude) {
        return { latitude: _cachedAddress.latitude, longitude: _cachedAddress.longitude };
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('PERMISSION_DENIED');

    try {
        const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
        });
        return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch {
        const lastPos = await Location.getLastKnownPositionAsync();
        if (lastPos?.coords?.latitude && lastPos?.coords?.longitude) {
            return { latitude: lastPos.coords.latitude, longitude: lastPos.coords.longitude };
        }
        // Lapu-Lapu City default coordinates
        return { latitude: 10.3157, longitude: 123.9789 };
    }
}
