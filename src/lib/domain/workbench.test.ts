import { describe, expect, it } from 'vitest';
import { haversineM, pickWorkbench, quantityError } from './workbench';

// Two places about 1.1 km apart.
const home = { id: 'home', geoLat: 55.75, geoLng: 37.6, geoRadiusM: 200 };
const garage = { id: 'garage', geoLat: 55.76, geoLng: 37.6, geoRadiusM: 200 };

describe('haversineM', () => {
	it('is zero for the same point and ~111 km per degree of latitude', () => {
		expect(haversineM({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
		expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
	});
});

describe('pickWorkbench', () => {
	it('picks the bench whose zone contains the position', () => {
		expect(pickWorkbench([home, garage], { lat: 55.7601, lng: 37.6 }, 'home')).toBe('garage');
	});

	it('picks the nearest centre when zones overlap', () => {
		const wideHome = { ...home, geoRadiusM: 5000 };
		const wideGarage = { ...garage, geoRadiusM: 5000 };
		expect(pickWorkbench([wideHome, wideGarage], { lat: 55.752, lng: 37.6 }, null)).toBe('home');
		expect(pickWorkbench([wideHome, wideGarage], { lat: 55.758, lng: 37.6 }, null)).toBe('garage');
	});

	it('falls back to the last used bench outside all zones or without a position', () => {
		expect(pickWorkbench([home, garage], { lat: 50, lng: 30 }, 'garage')).toBe('garage');
		expect(pickWorkbench([home, garage], null, 'garage')).toBe('garage');
	});

	it('falls back to the first bench when the last used one is gone', () => {
		expect(pickWorkbench([home, garage], null, 'deleted')).toBe('home');
		expect(pickWorkbench([home, garage], null, null)).toBe('home');
	});

	it('ignores benches without a zone and returns null without benches', () => {
		const noZone = { id: 'plain' };
		expect(pickWorkbench([noZone, garage], { lat: 55.76, lng: 37.6 }, 'plain')).toBe('garage');
		expect(pickWorkbench([noZone], { lat: 55.76, lng: 37.6 }, null)).toBe('plain');
		expect(pickWorkbench([], null, null)).toBeNull();
	});
});

describe('quantityError', () => {
	it('accepts whole numbers within the available quantity', () => {
		expect(quantityError(10, 1)).toBeNull();
		expect(quantityError(10, 10)).toBeNull();
		expect(quantityError(10, 0)).not.toBeNull();
		expect(quantityError(10, 1.5)).not.toBeNull();
		expect(quantityError(10, 11)).toBe('Можно не больше 10');
	});
});
