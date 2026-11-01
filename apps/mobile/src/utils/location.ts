import * as Location from 'expo-location';

/**
 * Where the phone is, for a check-in: asks for location while the app is in use, and gives up after ten
 * seconds. Null when it is refused, switched off or too slow; the server decides whether a check-in without a
 * position is allowed at the site.
 */
export async function checkInPosition(): Promise<{ lat: number; lng: number; accuracyM: number | undefined } | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);
    if (!fix) return null;
    const { latitude, longitude, accuracy } = fix.coords;
    return { lat: Number(latitude.toFixed(6)), lng: Number(longitude.toFixed(6)), accuracyM: accuracy == null ? undefined : Math.round(accuracy) };
  } catch {
    return null;
  }
}

/** Metres as "120 m" or "1.4 km". */
export const metres = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
