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

function removeEmojiAndSpaces(str) {
  return str
    .replace(/[^a-zA-Z]/g, '')
    .trim();
}

async function fetchCategoriesAndSubcategories() {
  try {
    const serverPackageNames = JSON.parse(fs.readFileSync(path.join(__dirname, 'serverPackageNames.json'), 'utf8'));
    const serverPackages = JSON.parse(fs.readFileSync(path.join(__dirname, 'serverPackages.json'), 'utf8'));

    console.log('Total packages in serverPackages.json:', serverPackages.length);

    const categories = await client.fetch('*[_type == "category"]');

    const subcategories = [];

    for (const [categoryName, subcategoryList] of Object.entries(serverPackageNames)) {
      const categoryDoc = categories.find(c => c.name === categoryName);
      if (!categoryDoc) {
        console.warn(`Category not found in Sanity: ${categoryName}`);
        continue;
      }

      const categoryId = categoryDoc._id;

      for (const subcategory of subcategoryList) {
        const subcategoryName = subcategory.name;
        const subcategoryNameWithoutEmojiAndSpaces = removeEmojiAndSpaces(subcategoryName);
        console.log('Processing subcategory:', subcategoryName);
        console.log('Processed subcategory name:', subcategoryNameWithoutEmojiAndSpaces);
        
        const matchingPackages = serverPackages.filter(p => 
          removeEmojiAndSpaces(p.subcategory) === subcategoryNameWithoutEmojiAndSpaces
        );
        console.log('Matching packages:', matchingPackages.length);
        
        if (matchingPackages.length === 0) {
          console.log('No matching packages found. Available subcategories in serverPackages:',
            [...new Set(serverPackages.map(p => p.subcategory))]);
        }

        const tags = [...new Set([
          ...subcategory.tags,
          ...matchingPackages.flatMap(p => p.tags || []),
          ...matchingPackages.map(p => p.name)
        ])];

        subcategories.push({
          name: subcategoryName,
          reference: categoryId,
          slug: subcategoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          tags,
          packageCount: matchingPackages.length,
          description: subcategory.description,
        });
      }
    }

    return subcategories;
  } catch (error) {
    console.error('Error in fetchCategoriesAndSubcategories:', error);
    throw error;
  }
}

fetchCategoriesAndSubcategories()
  .then(subcategories => {
    console.log(JSON.stringify(subcategories, null, 2));
    // write to file
    fs.writeFileSync(path.join(__dirname, 'sept11subcategories.json'), JSON.stringify(subcategories, null, 2));
    // Update subcategories on Sanity
    for (const subcategory of subcategories) {
      const result = client.patch(subcategory._id).set({
        name: subcategory.name,
        reference: subcategory.reference,
        slug: subcategory.slug,
        tags: subcategory.tags,
        packageCount: subcategory.packageCount,
        description: subcategory.description,
      }).commit();
    }
  })
  .catch(error => {
    console.error('Error:', error);
  });


async function test() {
    // read from sept11.json
    const subcategories = JSON.parse(fs.readFileSync(path.join(__dirname, 'sept11subcategories.json'), 'utf8'));
    totalCount = 0;
    for (const subcategory of subcategories) {
        totalCount += subcategory.packageCount;
    }
    console.log('Total package count:', totalCount);

    // read from serverPackages.json
    const serverPackages = JSON.parse(fs.readFileSync(path.join(__dirname, 'serverPackages.json'), 'utf8'));
    console.log('Total packages in serverPackages.json:', serverPackages.length);

    let dict = {};
    for (const package of serverPackages) {
        dict[package.subcategory] = (dict[package.subcategory] || 0) + 1;
    }
    console.log(dict);

    // read from serverPackageNames.json
    const serverPackageNames = JSON.parse(fs.readFileSync(path.join(__dirname, 'serverPackageNames.json'), 'utf8'));
    console.log('Total packages in serverPackageNames.json:', serverPackageNames.length);

    let dict2 = {}
    for (const [categoryName, subcategoryList] of Object.entries(serverPackageNames)) {
        dict2[categoryName] = [];
        for (const subcategory of subcategoryList) {
            dict2[categoryName].push(removeEmojiAndSpaces(subcategory.name));
        }
    }
    // save to file attempt2 categorisation
    fs.writeFileSync(path.join(__dirname, 'attempt2categorisation.json'), JSON.stringify(dict2, null, 2));
}

// test();