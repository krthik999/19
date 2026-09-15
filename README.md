# Karthik Reddy — Cursor Tracking Portfolio V2

This version removes the horizontal MP4-scrubbing/mirroring issue.

## What changed

- Left/right tracking now uses pre-extracted transparent character frames instead of repeatedly seeking the video.
- Only the character is mirrored for the opposite horizontal direction; the yellow/green background never flips.
- The movement is time-smoothed and returns naturally to center when the cursor is idle.
- Up/down tracking also uses cached frame sequences for consistent responsiveness.
- Added Education section.
- Added clickable Email and Phone contact section.

## Run locally

Open PowerShell inside this folder and run:

```powershell
py -m http.server 8080
```

Then visit:

http://localhost:8080

## Contact details currently shown

- Email: karthikreddypalkonda@gmail.com
- Phone: +1 (314) 313-4037

## Education currently shown

- Master of Science in Information Systems — Saint Louis University, St. Louis, Missouri
- Bachelor of Business Administration — ICFAI Business School, Hyderabad, India


V3 notes: corrected left/right tracking direction, added neutral crossfade for smoother horizontal tracking, removed Projects section, renamed undergraduate degree label to Undergraduation, and kept email on one line.


V5 update: smoother blended cursor-tracking motion and softer pose transitions.


Mobile-ready V5 update:
- desktop V5 cursor motion preserved
- responsive hero layout for phones
- touch-and-drag character tracking on mobile/tablet
- mobile-safe contact/education layout


UNIFIED BUILD: One URL automatically uses mouse/cursor tracking on desktop and touch-drag tracking on phones/tablets. No separate mobile URL is required.
