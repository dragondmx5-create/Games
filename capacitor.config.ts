import type { CapacitorConfig } from '@capacitor/cli';
import { loadEnv } from 'vite';

const fileEnv = loadEnv('production', process.cwd(), '');
const hostname = (process.env.CAPACITOR_HOSTNAME || fileEnv.CAPACITOR_HOSTNAME || 'app.undral.game').trim();

const config: CapacitorConfig = {
  appId: 'game.undral.mobile',
  appName: 'UNDRAL',
  webDir: 'dist',
  server: {
    hostname,
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  android: {
    backgroundColor: '#090a0d',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
    },
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#090a0d',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
