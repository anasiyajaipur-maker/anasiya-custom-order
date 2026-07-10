import fs from 'node:fs';
import path from 'node:path';
import { Client, Databases } from 'node-appwrite';

const envPath = path.resolve(process.cwd(), '.env.setup');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || '6a454ec900060f12e3ec';
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || 'anasiya_custom_order';

if (!apiKey) {
  console.error('Error: APPWRITE_API_KEY is missing from .env.setup');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);

async function addStringAttribute(key, size) {
  try {
    await db.createStringAttribute(databaseId, 'orders', key, size, false);
    console.log(`Created string attribute: ${key} (size: ${size})`);
  } catch (err) {
    if (err.code === 409) {
      console.log(`Attribute ${key} already exists.`);
    } else {
      console.error(`Failed to create ${key}:`, err.message);
    }
  }
}

async function addBoolAttribute(key) {
  try {
    await db.createBooleanAttribute(databaseId, 'orders', key, false, false);
    console.log(`Created boolean attribute: ${key}`);
  } catch (err) {
    if (err.code === 409) {
      console.log(`Attribute ${key} already exists.`);
    } else {
      console.error(`Failed to create ${key}:`, err.message);
    }
  }
}

async function run() {
  console.log('Updating Appwrite "orders" collection schema...');
  
  await addStringAttribute('shopifyOrderNumber', 255);
  await addStringAttribute('customerName', 255);
  await addStringAttribute('customerPhone', 255);
  await addStringAttribute('customerEmail', 255);
  await addStringAttribute('shippingAddress', 2048);
  await addBoolAttribute('osPulled');

  console.log('Schema update commands submitted successfully. Waiting for attributes to index...');
  
  // Wait for attributes to become available
  const attributes = ['shopifyOrderNumber', 'customerName', 'customerPhone', 'customerEmail', 'shippingAddress', 'osPulled'];
  for (const attr of attributes) {
    let success = false;
    for (let i = 0; i < 30; i++) {
      try {
        const attribute = await db.getAttribute(databaseId, 'orders', attr);
        if (attribute.status === 'available') {
          success = true;
          break;
        }
      } catch (e) {
        // Ignored
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (success) {
      console.log(`Attribute ${attr} is now available.`);
    } else {
      console.warn(`Warning: Attribute ${attr} is still indexing or failed to become available.`);
    }
  }
  
  console.log('Database schema update complete!');
}

run().catch(console.error);
