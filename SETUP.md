# Bill Sender: setup (about 15 minutes, one time)

The app sends email through the Gmail API as **chakrabartibishnupriya@gmail.com**
to **bishnupriya.chakrabarti@in.ey.com**. Bills are stored on the phone only.

## 1. Put the app online (Vercel)
1. Unzip `bill-sender.zip`. Put the folder in a new GitHub repo (or drag the folder into vercel.com/new).
2. Import it in Vercel. Framework preset: **Other**. No build command, no output directory. Deploy.
3. Note your URL, e.g. `https://bill-sender-xyz.vercel.app` (no trailing slash).

## 2. Google Cloud project
Use the Gmail account **chakrabartibishnupriya@gmail.com** for all of this.
1. Go to console.cloud.google.com, create a project called "Bill Sender".
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (may appear as "Google Auth Platform"):
   - User type: **External**. App name: Bill Sender. Support email and developer email: her Gmail.
   - Scopes: add `https://www.googleapis.com/auth/gmail.send`.
   - Publishing status: leave as **Testing**.
   - **Test users → Add users**: `chakrabartibishnupriya@gmail.com`.

## 3. Create the Client ID
1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorised JavaScript origins**: add your Vercel URL from step 1.3. Leave redirect URIs empty.
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
5. Open `config.js` in the project, paste it into `CLIENT_ID`, commit/redeploy.

## 4. Install on the phone
1. On her Android phone open the Vercel URL in **Chrome**.
2. Menu (⋮) → **Add to Home screen / Install app**.
3. First send: tap **Send**, then **Send now**. Google shows a sign-in popup.
   - Pick chakrabartibishnupriya@gmail.com.
   - You will see "Google hasn't verified this app". This is expected in Testing mode. Tap **Advanced → Go to Bill Sender (unsafe) → Allow**. It only gets permission to *send* email, not read it.

## Things to know
- **Testing mode:** Google may ask for sign-in again each time (access lasts about 1 hour). Just tap through the popup.
- **Storage:** bills live in Chrome's storage on that phone. Clearing Chrome's site data, or uninstalling, deletes them. Send before clearing.
- **Size rule:** each zip is capped at 7 MB (~9.6 MB as email). A single PDF over ~6.9 MB is rejected on adding. Photos are auto-compressed to about 0.3–1 MB.
- **Sent status:** after all emails go out the project shows **Sent**. Adding or editing a bill changes it to "Changed since sent". You can always **Send again**.
- **If one email in a series fails:** the earlier ones were already sent. Tap **Retry** to continue from the failed one (does not resend the earlier ones).
- **Updating the app:** redeploy on Vercel; the phone picks it up next time it is opened online.
