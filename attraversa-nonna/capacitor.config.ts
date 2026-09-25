import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Deve coincidere con il Bundle ID registrato su developer.apple.com
  appId: 'it.favalli.attraversanonna',
  appName: 'Attraversa, Nonna!',
  webDir: 'dist',
  backgroundColor: '#8fd3f4',
  ios: {
    // Il gioco gestisce da sé i gesti: niente scroll/rimbalzo della WebView
    scrollEnabled: false,
    contentInset: 'never',
    backgroundColor: '#8fd3f4',
  },
};

export default config;
