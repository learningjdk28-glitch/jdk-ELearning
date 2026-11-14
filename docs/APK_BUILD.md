# APK build and web deploy

Capacitor wraps the production web build in an Android app. The `android/` project, icons, splash screen and
deep-link filter are already generated and committed. **The APK was not built on the machine that wrote this
(no Java or Android SDK), so build it on yours and report any error.**

App name: JDK Learning System. Application id: `com.navilearn.app`. Custom URL scheme: `com.navilearn.app://`.

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
  - `com.navilearn.app://**` (the Android app)

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

## Build a signed release APK (to share)

1. Create a keystore once (keep it safe, never commit it):
   `keytool -genkey -v -keystore navi-learn.jks -keyalg RSA -keysize 2048 -validity 10000 -alias navi`
2. In Android Studio: Build > Generate Signed Bundle / APK > APK > choose the keystore > release.
3. Output: `android/app/release/app-release.apk`.

For Google Play use a Bundle (AAB) instead of APK from the same menu.

## After every change to the web code

`npm run cap:sync` then rebuild. (`npm run build` alone does not update the APK.)

## Android behaviours already handled

| Need | How |
|---|---|
| Hardware back button | `NativeBridge` goes back in the app and exits only from Home, Dashboard or Login |
| Notch / status bar / gesture bar | `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on the header and bottom tab bar |
| Keyboard covering inputs | `android:windowSoftInputMode="adjustResize"` in the manifest |
| No connection | Header shows Offline; login pages show a banner; learning works offline |
| Email links open the app | Intent filter for `com.navilearn.app://` in `AndroidManifest.xml`, handled in `NativeBridge` |
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
