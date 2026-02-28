import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

// ---------------------------------------------------------------------------
// Firebase configuration
// ---------------------------------------------------------------------------
// To set this up:
//   1. Go to https://console.firebase.google.com
//   2. Create a project (or open an existing one)
//   3. Click "Add app" → Web (</>)
//   4. Register the app — you'll see the config object below
//   5. In the left sidebar, go to Build → Realtime Database
//   6. Click "Create database" → Start in test mode → Enable
//   7. Replace the placeholder values below with your real config
//   8. Save this file and push to GitHub
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://REPLACE_WITH_YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID",
}

export const firebaseApp = initializeApp(firebaseConfig)
export const database    = getDatabase(firebaseApp)
