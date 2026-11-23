# APK build and web deploy

Capacitor wraps the production web build in an Android app. The `android/` project, icons, splash screen and
deep-link filter are already generated and committed. **The APK was not built on the machine that wrote this
(no Java or Android SDK), so build it on yours and report any error.**

App name: JDK Learning System. Application id: `ph.edu.pclu.jdklearn`. Custom URL scheme: `ph.edu.pclu.jdklearn://`.

## One-time setup (Windows)

1. Install **Android Studio** (it includes the JDK 21 and Android SDK). Open it once and accept the SDK licences.
2. Make sure `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is public and is baked into the web build and APK; never use service_role).
3. `npm install`

## Supabase redirect URLs (do this before testing email links)

Supabase dashboard > Authentication > URL Configuration:

- **Site URL**: your web address, for example `https://navi-learn.vercel.app`
- **Redirect URLs**, add all of:
  - `http://localhost:5173/**` (development)
  - `https://navi-learn.vercel.app/**` (your real web domain)
  - `ph.edu.pclu.jdklearn://**` (the Android app)

Without the last line, password-reset and confirm-email links will not open the app.

## Build a debug APK (install on your own phone)

```bash
npm run build:icons     # only if you change the icon art in scripts/make-icons.mjs
npm run cap:assets      # regenerates Android launcher icons and splash from assets/
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

## Web deploy (Vercel, Netlify or Cloudflare Pages)

1. Push the project to GitHub.
2. Create the site, build command `npm run build`, output folder `dist`.
3. Add the two environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Add a rewrite so every path serves `index.html` (single page app).
   Vercel: `vercel.json` with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.
   Netlify: a `public/_redirects` file containing `/* /index.html 200`.
5. Put the final HTTPS address in the Supabase Site URL and Redirect URLs above.
6. HTTPS is required for the service worker and "install app" on phones.
