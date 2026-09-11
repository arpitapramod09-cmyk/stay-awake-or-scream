# Stay Awake or Beep 👁️🔔

A "useless project": your webcam watches your eyes. Close them for **2 seconds**
and the app sounds a long alarm beep and flashes the screen red.

Everything runs **locally in the browser**. No server code, no API keys,
no audio files, nothing gets uploaded anywhere. The beep is generated live
by the Web Audio API — there's nothing extra to add or configure.

## Files
- `index.html` — page layout
- `style.css` — styling
- `app.js` — camera + eye-tracking + scream logic

## How to run it in VS Code (important — read this)

Browsers block camera access on plain `file://` pages in many setups, so you
need to open this through a local server. The easiest way:

1. Open the `eye-scream-app` folder in VS Code (`File > Open Folder`).
2. Install the **Live Server** extension (by Ritwick Dey) from the
   Extensions tab (`Ctrl+Shift+X`, search "Live Server").
3. Right-click `index.html` in the file explorer →
   **"Open with Live Server"**.
4. Your browser opens something like `http://127.0.0.1:5500/index.html`.
5. Click the **"Enable Camera"** button on the page.
6. Allow camera access when the browser asks.
7. Sit normally facing the camera in decent lighting, then close your eyes
   for 2 seconds and wait for it to scream.

If you don't want to install an extension, you can instead run this in a
terminal from inside the folder (Python is usually already installed):

```bash
python -m http.server 5500
```

Then open `http://localhost:5500` in your browser.

## Troubleshooting

- **"Could not access camera"** → make sure you opened the page via
  `http://localhost...` (Live Server), not by double-clicking the HTML file.
- **It never detects "closed"** → lighting matters. Face a window or lamp,
  and open `app.js`, then raise `EAR_THRESHOLD` slightly (e.g. from `0.21`
  to `0.24`) if it's too strict, or lower it if it triggers too easily even
  with eyes open. Watch the live "EAR" number on the page while blinking to
  find a good cutoff for your face/lighting.
- **No sound** → check your system volume; some browsers need one click
  on the page before audio is allowed to play (the "Enable Camera" click
  satisfies this since it's a user gesture).

## How it works (quick version)

1. `@mediapipe/face_mesh` (loaded from a CDN) finds 468 points on your face
   every frame.
2. Six points around each eye are used to compute the **Eye Aspect Ratio
   (EAR)** — a number that drops sharply when your eyelid closes.
3. If EAR stays below the threshold for 2 continuous seconds, the app
   triggers a screen flash and a long synthesized beep (Web Audio API),
   repeating the beep for as long as your eyes stay closed.
