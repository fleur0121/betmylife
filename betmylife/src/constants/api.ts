// On a physical phone, localhost means the phone itself. Set EXPO_PUBLIC_API_URL
// to the Mac's LAN address in .env.local when testing on iOS.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
