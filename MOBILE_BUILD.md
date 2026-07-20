# UNDRAL native mobile build

This project now includes a Capacitor Android shell. It produces a real APK/AAB
installed by Android; it is not a PWA. The game renderer remains the existing
WebGL2 client running inside Android System WebView, while orientation,
fullscreen display, lifecycle and packaging are controlled by the native app.

## Required production values

Create `.env.production.local` before the build:

```env
VITE_API_URL=https://api.undral.game
CAPACITOR_HOSTNAME=app.undral.game
```

On the backend, use HTTPS and secure cookies, and allow both web and mobile
origins as a comma-separated value:

```env
COOKIE_SECURE=true
CORS_ORIGIN=https://game.undral.game,https://app.undral.game,capacitor://app.undral.game
```

The API hostname in `VITE_API_URL` must be reachable from the phone. `localhost`
on a phone means the phone itself, not the development computer.

## Android

```bash
npm ci
npm run android:debug
```

Debug APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

For Google Play, configure a release signing key and run:

```bash
npm run android:bundle
```

Release bundle:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## Sync after web changes

```bash
npm run mobile:sync
```


## Build an APK with GitHub Actions

The included workflow `.github/workflows/android-apk.yml` builds and uploads an
installable debug APK without requiring Android Studio on your computer. Open
**Actions → Build installable Android APK → Run workflow**, enter the public API
URL and app hostname, then download the `undral-android-debug-apk` artifact.

## iOS

Capacitor configuration is already compatible with iOS, but generating and
signing the iOS project requires macOS, Xcode and an Apple Developer account.
On macOS install `@capacitor/ios`, run `npx cap add ios`, then `npx cap sync ios`.
