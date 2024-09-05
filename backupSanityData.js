// node -r dotenv/config .scripts/backupSanityData.js

const { createClient } = require('@sanity/client');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const axios = require('axios');

// Check for required environment variables
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !dataset || !token) {
  console.error('Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

// Sanity client configuration
const client = createClient({
  projectId,
  dataset,
  apiVersion: '2023-05-03',
  token,
  useCdn: false,
});

const documentTypes = [
  'user', 'account', 'category', 'home', 'package',
  'plateform', 'subCategory', 'verification-token'
];

async function fetchAllDocuments(type) {
  return await client.fetch(`*[_type == "${type}"]`);
}

function getImageUrl(image) {
  if (!image || !image.asset || !image.asset._ref) {
    return null;
  }
  const [, id, dimensions, format] = image.asset._ref.split('-');
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dimensions}.${format}`;
}

async function downloadImage(url, outputPath) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Failed to download image from ${url}: ${error.message}`);
  }
}

async function backupData() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const backupDir = path.join(__dirname, 'backups', `backup-${date}-${time}`);
  const imagesDir = path.join(backupDir, 'images');
  
  await fsPromises.mkdir(backupDir, { recursive: true });
  await fsPromises.mkdir(imagesDir, { recursive: true });

  for (const docType of documentTypes) {
    console.log(`Fetching ${docType} documents...`);
    const documents = await fetchAllDocuments(docType);
    
    const backupPath = path.join(backupDir, `${docType}.json`);
    await fsPromises.writeFile(backupPath, JSON.stringify(documents, null, 2));
    
    console.log(`Backed up ${documents.length} ${docType} documents to ${backupPath}`);

    // Download images for relevant document types
    if (['package', 'subCategory', 'plateform'].includes(docType)) {
      for (const doc of documents) {
        const imageFields = ['packageImage', 'subcategoryImage', 'plateFormImage'];
        for (const field of imageFields) {
          if (doc[field]) {
            const imageUrl = getImageUrl(doc[field]);
            if (imageUrl) {
              const imagePath = path.join(imagesDir, `${docType}_${doc._id}_${field}.${imageUrl.split('.').pop()}`);
              await downloadImage(imageUrl, imagePath);
              console.log(`Downloaded ${field} for ${docType} ${doc._id}`);
            }
          }
        }
        
        if (doc.gallery) {
          for (let i = 0; i < doc.gallery.length; i++) {
            const imageUrl = getImageUrl(doc.gallery[i]);
            if (imageUrl) {
              const imagePath = path.join(imagesDir, `${docType}_${doc._id}_gallery_${i}.${imageUrl.split('.').pop()}`);
              await downloadImage(imageUrl, imagePath);
              console.log(`Downloaded gallery image ${i} for ${docType} ${doc._id}`);
            }
          }
        }
      }
    }
  }

  console.log('Backup completed successfully!');
}

backupData().catch(console.error);

module.exports = {
  backupData
};