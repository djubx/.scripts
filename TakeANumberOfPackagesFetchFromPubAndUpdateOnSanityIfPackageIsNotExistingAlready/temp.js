require('dotenv').config({ path: '../../.env' }); // Load environment variables from .env file
const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');

// Update the client initialization
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
  apiVersion: '2021-03-25', // Use the latest API version or the one you prefer
});

async function mergeSubCategoryNameArrayWithArrayOfCategories () {
  const subCategoryNameArrayPath = path.join(__dirname, '25thSept', 'subCategoryNameArray.json');
  const subCategoryNameArray = JSON.parse(fs.readFileSync(subCategoryNameArrayPath, 'utf8'));

  const arrayOfCategoriesPath = path.join(__dirname, '25thSept', 'arrayOfCategories.json');
  const arrayOfCategories = JSON.parse(fs.readFileSync(arrayOfCategoriesPath, 'utf8'));

  for(let i = 0; i < arrayOfCategories.length; i++) {
    const subCategoryNameWithEmoji = subCategoryNameArray[i];
    arrayOfCategories[i].subCategoryName = subCategoryNameWithEmoji;
  }

  const mergedArrayPath = path.join(__dirname, '25thSept', 'mergedArray.json');
  fs.writeFileSync(arrayOfCategoriesPath, JSON.stringify(arrayOfCategories, null, 2));
}

mergeSubCategoryNameArrayWithArrayOfCategories();
