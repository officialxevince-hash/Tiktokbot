// Use local network IP for device access, localhost for simulator/web
// For physical devices, use your local IP: http://192.168.40.29:3000
// For simulator/web, localhost works fine
// Update this IP if your network changes
const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  const defaultUrl = __DEV__ ? 'http://192.168.40.29:3000' : 'http://localhost:3000';
  const finalUrl = envUrl || defaultUrl;
  
  console.log('[API Config] EXPO_PUBLIC_API_URL:', envUrl);
  console.log('[API Config] Default URL:', defaultUrl);
  console.log('[API Config] Final API_BASE_URL:', finalUrl);
  console.log('[API Config] __DEV__:', __DEV__);
  
  return finalUrl;
};

export const API_BASE_URL = getApiUrl();


