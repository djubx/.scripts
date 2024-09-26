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

function generateRandomKey(length = 8) {
	return Math.random().toString(36).substring(2, length + 2);
}

async function updateSanityPackagesWithSubCategories() {
  const specialCasePackagesPath = path.join(__dirname, 'SpecialCasePackageAndSubcategoryFinalUpdateSexy.json');
  const specialCasePackages = JSON.parse(fs.readFileSync(specialCasePackagesPath, 'utf8'));

  const serverPackages = await client.fetch(`*[_type == "package"]`);

  let counter = 0;
  for(const package of specialCasePackages) {
    const serverPackage = serverPackages.find(serverPackage => serverPackage.name === package.name);
    if(serverPackage) {
      let subCategories = [];
      for(const category of package.categories) {
        subCategories.push({
          _type: 'reference',
          _ref: category.id,
          _key: generateRandomKey()
        })
      }
      await client.patch(serverPackage._id).set({
        subCategories: subCategories
      }).commit();
      console.log(`Updated package ${package.name} ${counter++}`);
    } else {
      console.log(`Package ${package.name} does not exist on Sanity.`);
    }
  }
}

updateSanityPackagesWithSubCategories();