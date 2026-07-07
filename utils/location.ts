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

        const response = await fetch(url, {
            headers: {
                // Nominatim requires a User-Agent identifying your app
                'User-Agent': 'FloodWatchApp/1.0 (flood-watch-cebu)',
            },
        });

        if (!response.ok) return null;

        const data = await response.json();
        const a = data?.address;
        if (!a) return null;

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

        return { zone, barangay, city, province };
    } catch {
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
    const barangay = nom?.barangay || expo.district || '';
    const city     = nom?.city     || fixCityName(expo.city || expo.subregion || '');
    const province = nom?.province || '';

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
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('PERMISSION_DENIED');

        const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
        });

        const { latitude, longitude } = position.coords;

        // Run both in parallel — Nominatim for barangay, expo-location as fallback
        const [expoResults, nominatimData] = await Promise.all([
            Location.reverseGeocodeAsync({ latitude, longitude }),
            fetchNominatimGeocode(latitude, longitude),
        ]);

        if (!expoResults?.length && !nominatimData) throw new Error('NO_RESULTS');

        const expoGeo = expoResults?.[0] ?? ({} as Location.LocationGeocodedAddress);
        const result = assembleAddress(nominatimData, expoGeo);

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
    return assembleAddress(null, geo);
}
