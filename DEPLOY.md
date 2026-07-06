# How to put the Kline Tool online
Total time: about 15 minutes. You need a free account on 3 websites.

---

## PART 1 — Set up the database (Google Apps Script)
*This is where all allocations get saved. Takes 5 minutes.*

1. Go to **https://script.google.com** and sign in with your Google account

2. Click **New project** (top left)

3. You will see a code editor with some text in it. Select all of it and delete it.

4. Open the file **kline-database.gs** (it's in your `Kline Facility Selector` folder on the Desktop)
   - Open it with Notepad
   - Press Ctrl+A to select everything, then Ctrl+C to copy

5. Click back in the script.google.com window and paste (Ctrl+V)

6. Click the floppy disk icon (Save). When it asks for a name, type **Kline Database**

7. Click **Deploy** (top right) → **New deployment**
   - Click the gear icon next to "Type" → choose **Web app**
   - "Execute as" → **Me**
   - "Who has access" → **Anyone**
   - Click **Deploy**
   - It may ask you to sign in / grant permission — click Allow

8. You will see a box with a long URL starting with `https://script.google.com/macros/s/...`
   **Copy this URL and save it somewhere** (you will need it in Part 3)

---

## PART 2 — Put the tool on GitHub
*GitHub is just an online folder that Vercel reads from. Takes 3 minutes.*

1. Go to **https://github.com** and sign in

2. Click the **+** button (top right) → **New repository**
   - Name it: `kline-tool`
   - Click **Private**
   - Click **Create repository**

3. On the next page, click **uploading an existing file**

4. Open File Explorer on your computer, go to your Desktop, open the **kline-web** folder
   - Select everything inside it (Ctrl+A)
   - Drag it all into the GitHub upload page

5. Scroll down, click **Commit changes** (the green button)

---

## PART 3 — Deploy on Vercel
*Vercel reads from GitHub and gives you a live URL. Takes 5 minutes.*

1. Go to **https://vercel.com** → click **Sign up** → choose **Continue with GitHub**

2. Click **Add New Project** → you should see `kline-tool` in the list → click **Import**

3. Leave everything as is → click **Deploy**
   - Wait about 1 minute — you will see a success screen with a URL like `https://kline-tool-abc.vercel.app`
   - **This is your tool's URL — share it with your team**

4. Now add your Zoho credentials so the CRM sync works:
   - In Vercel, go to your project → click **Settings** (top menu) → **Environment Variables**
   - Add these one by one (click **Add** for each):

     | Name | Value |
     |------|-------|
     | `ZOHO_CLIENT_ID` | `1000.P3LABKZMGUB0OB33BJHNXQ87SP4JHN` |
     | `ZOHO_CLIENT_SECRET` | `f0e1ad775c5e8286d6c5baf8e5fde08d42c839f53c` |
     | `ZOHO_REFRESH_TOKEN` | *(ask Claude — this is the refresh token from your Cowork session)* |

5. After adding all 3 → go to **Deployments** → click the **⋯** menu → **Redeploy** → confirm

---

## PART 4 — Connect the database inside the tool
*One-time setup, takes 1 minute.*

1. Open your tool URL (from Part 3 step 3)

2. Click **Allocation History** in the left menu

3. Click the ⚙ settings icon (top right of the page)

4. Paste the Google Apps Script URL you saved in Part 1 step 8

5. Click **Connect** — you should see "Connected!"

---

## Done!

Your tool is now online. Everyone on your team can:
- Open the URL in any browser — no installation, no files to send
- See live CRM data in Manufacturing Tickets (syncs automatically)
- Submit allocations that everyone else can see in Allocation History

## Making changes later

If you need to update anything in the tool:
1. Change the file on your computer
2. Go to GitHub → your repository → find the file → click the pencil icon → paste the new version
3. Vercel automatically updates in about 1 minute
