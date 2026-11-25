import { API_URL } from '../constants/api';

export interface LocationResult {
    place_id: string | number;
    googlePlaceId?: string;
    display_name: string;
    main_text?: string;
    secondary_text?: string;
    lat: string;
    lon: string;
    distanceKm?: number;
    isCustom?: boolean;
    source?: string;
}

export const GOOGLE_MAPS_CLIENT_KEY =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    'AIzaSyBfBd_6W9AndpyPJW0gPsBUvlyiG21UWjc';

export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Reverse geocode coords via backend (Google Geocoding + Nearby POI first, OSM fallback)
 */
export async function fetchAddressForCoords(lat: number, lon: number): Promise<string> {
    try {
        const res = await fetch(`${API_URL}/places/geocode?lat=${lat}&lng=${lon}`);
        if (res.ok) {
            const data = await res.json();
            if (data?.address) return data.address;
        }
    } catch {}

    // Direct client fallback if backend unreachable
    try {
        const nomRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`,
            { headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' } }
        );
        if (nomRes.ok) {
            const data = await nomRes.json();
            if (data?.address) {
                const a = data.address;
                const parts = [
                    data.name || a.amenity || a.building || a.shop || a.place,
                    a.road || a.street,
                    a.suburb || a.village || a.neighbourhood,
                    a.town || a.city || a.county,
                    a.state_district || a.district,
                    a.postcode,
                ].filter(Boolean);
                const uniq: string[] = [];
                for (const p of parts) {
                    if (!uniq.includes(p)) uniq.push(p);
                }
                if (uniq.length >= 2) return uniq.join(', ');
                if (data.display_name) return data.display_name;
            }
        }
    } catch {}

    return `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
}

/**
 * Resolve Google Place ID to coordinates
 */
export async function resolveGooglePlaceDetails(
    placeId: string
): Promise<{ lat: number; lon: number; display_name: string } | null> {
    try {
        const res = await fetch(`${API_URL}/places/details?placeId=${encodeURIComponent(placeId)}`);
        if (res.ok) {
            const data = await res.json();
            if (typeof data?.lat === 'number' && typeof data?.lon === 'number') {
                return data;
            }
        }
    } catch {}
    return null;
}

/**
 * Fetch nearby POIs/landmarks immediately around GPS coordinates
 */
export async function fetchNearbyPlaces(lat: number, lon: number): Promise<LocationResult[]> {
    try {
        const res = await fetch(`${API_URL}/places/nearby?lat=${lat}&lng=${lon}`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.results)) {
                return data.results;
            }
        }
    } catch {}
    return [];
}

/**
 * Search places via backend Google Places + OSM fallback with proximity bias and custom typed option
 */
export async function searchPlacesWithFallback(
    text: string,
    coords: { lat: number; lon: number } | null
): Promise<LocationResult[]> {
    const trimmed = text.trim();
    const cleanQuery = trimmed
        .replace(/busstand/gi, 'bus stand')
        .replace(/railwaystation/gi, 'railway station')
        .replace(/policestation/gi, 'police station');

    const customOption: LocationResult = {
        place_id: 'custom-user-input',
        display_name: trimmed,
        isCustom: true,
        lat: String(coords?.lat || 11.3992),
        lon: String(coords?.lon || 79.6935),
        distanceKm: coords ? 0 : undefined,
    };

    try {
        let url = `${API_URL}/places/autocomplete?input=${encodeURIComponent(cleanQuery)}`;
        if (coords) {
            url += `&lat=${coords.lat}&lng=${coords.lon}`;
        }
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.results) && data.results.length > 0) {
                const results: LocationResult[] = data.results.map((r: any) => ({
                    place_id: r.place_id,
                    googlePlaceId: r.googlePlaceId,
                    display_name: r.display_name,
                    main_text: r.main_text,
                    secondary_text: r.secondary_text,
                    lat: r.lat ? String(r.lat) : String(coords?.lat || 11.3992),
                    lon: r.lon ? String(r.lon) : String(coords?.lon || 79.6935),
                    distanceKm: r.distanceKm,
                    source: r.source,
                }));

                // Only distance-sort non-Google fallback results that have explicit coords
                if (data.provider !== 'google' && coords) {
                    const seen = new Set<string>();
                    const deduped: LocationResult[] = [];
                    for (const item of results) {
                        const key = `${parseFloat(item.lat).toFixed(3)}_${parseFloat(item.lon).toFixed(3)}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            deduped.push(item);
                        }
                    }
                    deduped.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
                    return [customOption, ...deduped];
                }

                return [customOption, ...results];
            }
        }
    } catch {}

    // Offline / direct fallback
    return [customOption];
}
