// One-time script to create the admins collection document
// Run with: node setup-admin.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize with default credentials (uses firebase login credentials)
initializeApp({ projectId: 'gtd-capture' });
const db = getFirestore();

async function setupAdmin() {
  try {
    // Create admins collection with matt's email as document ID
    await db.collection('admins').doc('matt@encantobuilders.com').set({
      role: 'owner',
      createdAt: new Date().toISOString()
    });
    console.log('Admin document created for matt@encantobuilders.com');

    // Verify it was created
    const doc = await db.collection('admins').doc('matt@encantobuilders.com').get();
    console.log('Verified:', doc.exists ? doc.data() : 'NOT FOUND');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

setupAdmin();
