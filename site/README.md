# Kangaroo Practice – Grades 3 & 4

Static site (GitHub Pages) + Firebase (free tier) for logins and score history.
Until you add a Firebase config it runs in **local demo mode** (accounts live in that one browser only).

## 1. Firebase (≈10 min, free Spark plan)
1. https://console.firebase.google.com → *Add project*.
2. **Build → Authentication → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** (production mode), then **Rules** tab → paste `firestore.rules` → Publish.
4. **Project settings → Your apps → Web (`</>`)** → register app → copy the config into `firebase-config.js`.
5. **Authentication → Settings → Authorized domains → Add** `YOUR-USERNAME.github.io`.

## 2. Create the first admin (once)
Students log in with a *username* + PIN; internally the email is `username@kangaroo-practice.app`.
1. Authentication → Users → **Add user**: email `admin@kangaroo-practice.app`, password (≥6 chars). Copy its **User UID**.
2. Firestore → **Start collection** `users` → document ID = that UID, fields:
   `name` (string) = your name, `username` = `admin`, `role` = `admin`, `disabled` = false (boolean).
3. Sign in on the site as `admin`; use ☰ → *Manage students* to add each child (name, username, 6+ char PIN).

## 3. Publish
Push this folder to a GitHub repo → **Settings → Pages → Deploy from branch → main / root**.
Site URL: `https://YOUR-USERNAME.github.io/REPO/`

## 4. Adding a new question paper (any year)
```
pip install pymupdf pillow           # + tesseract-ocr installed
python3 tools/extract.py --pdf NEW.pdf --pages 1-8 --id ksf2026 --cols 1 --dpi 150   # --cols 2 for USA two-column tests
# add an entry to tools/keys.json:  "ksf2026": {"year":2026,"title":"...","minutes":75,"key":"<24 letters>"}
python3 tools/build_bank.py
git add -A && git commit -m "add 2026" && git push
```
Look at the cropped images in `bank/<id>/` and fix any bad crop with `--manual Q:PAGE:Y` / `--shift Q:PX` (see `tools/run_all.sh`).
Any question listed under `"review"` in keys.json is skipped in tests until you clear it. See `ANSWER_AUDIT.md` for how every current key was verified.
Optional: add `"<paperId>:<n>": "explanation"` lines to `bank/explanations.json`.

## Known limits
* Answers are stored in static JSON, so a tech-savvy student could read them in browser dev tools. Fine for practice, not for proctored exams.
* Scores/accounts are protected by Firestore rules, but anyone with the link can load the question images.
* The questions are copyrighted by Math Kangaroo / Kangourou Sans Frontières. Keep the repo private or the site non-public unless their terms allow sharing.
