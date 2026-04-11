// ==========================================
// WorkFlow Pro — Geofence Utilities
// ==========================================

import type { GeofenceResult, Branch, GPSCoordinates } from './types';

/**
 * Calculate distance between two GPS points using Haversine formula
 */
export function calculateDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if current position is within the geofence of a branch
 */
export function checkGeofence(
  coordinates: GPSCoordinates,
  branch: Branch
): GeofenceResult {
  const distance = calculateDistance(
    coordinates.latitude,
    coordinates.longitude,
    branch.latitude,
    branch.longitude
  );

  return {
    isWithinGeofence: distance <= branch.geofence_radius_meters,
    distanceMeters: Math.round(distance),
    branchName: branch.name,
    allowedRadius: branch.geofence_radius_meters,
  };
}

/**
 * Find the nearest branch from a list
 */
export function findNearestBranch(
  coordinates: GPSCoordinates,
  branches: Branch[]
): { branch: Branch; distance: number } | null {
  if (branches.length === 0) return null;

  let nearest = branches[0];
  let minDistance = calculateDistance(
    coordinates.latitude, coordinates.longitude,
    nearest.latitude, nearest.longitude
  );

  for (let i = 1; i < branches.length; i++) {
    const d = calculateDistance(
      coordinates.latitude, coordinates.longitude,
      branches[i].latitude, branches[i].longitude
    );
    if (d < minDistance) {
      minDistance = d;
      nearest = branches[i];
    }
  }

  return { branch: nearest, distance: Math.round(minDistance) };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} ม.`;
  return `${(meters / 1000).toFixed(1)} กม.`;
}
