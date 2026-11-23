# APK build and web deploy

Capacitor wraps the production web build in an Android app. The `android/` project, icons, splash screen and
deep-link filter are committed. Released APKs are attached to the repository's **Releases** on GitHub.

App name: JDK Learning System. Application id: `ph.edu.pclu.jdklearn`. Custom URL scheme: `ph.edu.pclu.jdklearn://`.

## One-time setup (Windows)

1. Install **Android Studio** (it includes the Android SDK). Open it once and accept the SDK licences.
   Gradle here needs **Java 17–21**: Android Studio's own Java 25 is too new. Use a JDK 21 (for example the one
   Android Studio/IntelliJ downloads to `C:\Users\<you>\.jdks\`) and set `JAVA_HOME` to it before building.
2. Make sure `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is public and is baked into the web build and APK; never use service_role).
3. `npm install`

## Supabase redirect URLs (do this before testing email links)

Supabase dashboard > Authentication > URL Configuration:

- **Site URL**: your web address, for example `https://jdk-elearning.learningjdk28.workers.dev`
- **Redirect URLs**, add all of:
  - `http://localhost:5173/**` (development)
  - `https://jdk-elearning.learningjdk28.workers.dev/**` (your real web domain)
  - `ph.edu.pclu.jdklearn://**` (the Android app)

Without the last line, password-reset and confirm-email links will not open the app.

## Build a debug APK (install on your own phone)

```bash
npm run cap:assets      # only if you changed assets/icon-only.png or assets/splash.png
npm run cap:sync        # builds the web app and copies it into android/
cd android
./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to the phone and install (allow "unknown sources").
Or run `npm run cap:open`, then press Run in Android Studio with a phone or emulator connected.

## Build a signed release for Google Play

The upload key and its passwords are outside git: the key in `C:\Users\<you>\jdklearn-signing\`, the passwords in
`android/keystore.properties` (both ignored). **Back up both.** Every update must be signed with the same upload key.

```
npm run cap:sync
cd android
set JAVA_HOME=C:\Users\<you>\.jdks\jbr-21.0.11     (Gradle 8.14 needs Java 17-24; Android Studio's own Java 25 is too new)
gradlew bundleRelease assembleRelease
```

- For Google Play: `android/app/build/outputs/bundle/release/app-release.aab`
- To share directly: `android/app/build/outputs/apk/release/app-release.apk`

Before each new upload, raise `versionCode` (and `versionName`) in `android/app/build.gradle`.

## After every change to the web code

`npm run cap:sync` then rebuild. (`npm run build` alone does not update the APK.)

## Android behaviours already handled

| Need | How |
|---|---|
| Hardware back button | `NativeBridge` goes back in the app and exits only from Home, Dashboard or Login |
| Notch / status bar / gesture bar | `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on the header and bottom tab bar |
| Keyboard covering inputs | `android:windowSoftInputMode="adjustResize"` in the manifest |
| No connection | Header shows Offline; login pages show a banner; learning works offline |
| Email links open the app | Intent filter for `ph.edu.pclu.jdklearn://` in `AndroidManifest.xml`, handled in `NativeBridge` |
| Launcher icon and splash | Generated into `android/app/src/main/res` from `assets/` |

## Web deploy (Cloudflare Workers)

1. Connect the GitHub repository in Cloudflare (Workers & Pages). It builds with `npm run build` and serves `dist/`
   as described in `wrangler.jsonc`, which also sends every path to `index.html` (single page app).
2. Under Settings > Build > Variables, add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_PUBLIC_URL`.
3. Every push to `main` redeploys.
4. Put the final HTTPS address in the Supabase Site URL and Redirect URLs above.
   HTTPS is required for the service worker and "install app" on phones.
