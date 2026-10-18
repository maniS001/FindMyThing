/**
 * Location and Proximity Test Suite
 * Tests Haversine distance, boundary filtering, and reverse geocoding formatting.
 */

// Haversine formula implementation matching LocationPicker
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatAddressParts(parts: {
    landmark?: string;
    road?: string;
    subLocality?: string;
    town?: string;
    district?: string;
    postcode?: string;
}): string {
    const list = [
        parts.landmark,
        parts.road,
        parts.subLocality,
        parts.town,
        parts.district,
        parts.postcode
    ].filter(Boolean);

    const unique: string[] = [];
    for (const p of list) {
        if (!unique.includes(p!)) unique.push(p!);
    }
    return unique.join(', ');
}

describe('Location & Proximity Calculation', () => {
    const chidambaram = { lat: 11.3992, lon: 79.6935 };
    const kumaramangalam = { lat: 11.4120, lon: 79.6810 };
    const cuddalore = { lat: 11.7480, lon: 79.7714 };
    const chennai = { lat: 13.0827, lon: 80.2707 };

    test('should return 0 km for identical coordinates', () => {
        const dist = getDistanceKm(chidambaram.lat, chidambaram.lon, chidambaram.lat, chidambaram.lon);
        expect(dist).toBe(0);
    });

    test('should accurately calculate nearby village distance (< 5 km)', () => {
        const dist = getDistanceKm(chidambaram.lat, chidambaram.lon, kumaramangalam.lat, kumaramangalam.lon);
        expect(dist).toBeGreaterThan(0.5);
        expect(dist).toBeLessThan(5.0);
    });

    test('should properly identify places within 50 km radius', () => {
        const distToCuddalore = getDistanceKm(chidambaram.lat, chidambaram.lon, cuddalore.lat, cuddalore.lon);
        // Cuddalore is approximately 40-45 km from Chidambaram
        expect(distToCuddalore).toBeLessThanOrEqual(50);
        expect(distToCuddalore).toBeGreaterThan(30);
    });

    test('should properly filter out places outside 50 km radius', () => {
        const distToChennai = getDistanceKm(chidambaram.lat, chidambaram.lon, chennai.lat, chennai.lon);
        // Chennai is approximately ~190-200 km from Chidambaram
        expect(distToChennai).toBeGreaterThan(50);
        expect(distToChennai).toBeGreaterThan(150);
    });
});

describe('Address Formatting and Deduplication', () => {
    test('should combine all address components without duplicates', () => {
        const formatted = formatAddressParts({
            landmark: 'Thillai Nataraja Temple',
            road: 'South Car Street',
            town: 'Chidambaram',
            district: 'Cuddalore',
            postcode: '608001'
        });

        expect(formatted).toBe('Thillai Nataraja Temple, South Car Street, Chidambaram, Cuddalore, 608001');
    });

    test('should remove duplicate strings if town and district are identical', () => {
        const formatted = formatAddressParts({
            road: 'Main Road',
            town: 'Chidambaram',
            district: 'Chidambaram',
            postcode: '608002'
        });

        expect(formatted).toBe('Main Road, Chidambaram, 608002');
    });

    test('should gracefully handle empty or undefined parts', () => {
        const formatted = formatAddressParts({
            town: 'Chidambaram',
            postcode: '608002'
        });

        expect(formatted).toBe('Chidambaram, 608002');
    });
});
