import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth } from 'firebase/auth'

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
  apiKey:            "AIzaSyDe5P6egFe_daslLugVS7D_rFwX8-20oU0",
  authDomain:        "allgeier-tree.firebaseapp.com",
  databaseURL:       "https://allgeier-tree-default-rtdb.firebaseio.com",
  projectId:         "allgeier-tree",
  storageBucket:     "allgeier-tree.firebasestorage.app",
  messagingSenderId: "454590773802",
  appId:             "1:454590773802:web:72dce81a4b15cc16286153",
}

export const firebaseApp = initializeApp(firebaseConfig)
export const database    = getDatabase(firebaseApp)
export const auth        = getAuth(firebaseApp)
