// you just need to copy into extractedDataPackages.json and run this script, 
// it will automatically create extractedDataPubDataFinalDataCreated.json, 
// scrape pub and create the packages in sanity

require('dotenv').config({ path: '../../.env' }); // Load environment variables from .env file
const { createClient } = require('@sanity/client');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
});

async function scrapePackageData(packageName) {
    try {
        // read this package if it is already existing in extractedDataPubDataFinalDataCreated.json
        const extractedDataPubDataFinalDataCreated = JSON.parse(fs.readFileSync('./extractedDataPubDataFinalDataCreated.json', 'utf8'));
        const existingPackage = extractedDataPubDataFinalDataCreated.find(package => package.title === packageName);
        if (existingPackage) {
            console.log(`Package ${packageName} already exists in extractedDataPubDataFinalDataCreated.json`);
            return existingPackage;
        }

        const url = `https://pub.dev/packages/${packageName}`;
        let response;
        let retries = 0;
        const maxRetries = 10;

        while (retries < maxRetries) {
            try {
                response = await axios.get(url);
                break;
            } catch (error) {
                console.error(`Error fetching ${packageName}. Retrying in 1 second... (Attempt ${retries + 1}/${maxRetries})`);
                console.error(`Error details: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                retries++;
            }
        }

        if (!response) {
            console.error(`Failed to fetch ${packageName} after ${maxRetries} attempts.`);
            return null;
        }

        const $ = cheerio.load(response.data);
        // Helper function to parse numbers, removing any non-digit characters
        const parseNumber = (str) => {
          const digitsOnly = str.replace(/\D/g, '');
          const halfLength = Math.floor(digitsOnly.length / 2);
          return digitsOnly.slice(0, halfLength);
        };
      
        return {
          title: packageName,
          likes: parseNumber($('.packages-score-like .packages-score-value-number').text().trim()),
          points: parseNumber($('.packages-score-health .packages-score-value-number').text().trim()),
          popularity: parseNumber($('.packages-score-popularity .packages-score-value-number').text().trim()),
          description: $('.detail-lead-text').text().trim(),
          thumbnail: 'https://pub.dev/' + ($('.thumbnail-container').data('thumbnail')?.split(',')[0] || $('.detail-image img').attr('src')),
          hashtags: [...new Set($('.title:contains("Topics")').next('p').find('a').map((_, el) => $(el).text().trim()).get())],
          last_update: $('.-x-ago').attr('title') || 'Unknown',
          last_version: $('h1.title').text().match(/(\d+\.\d+\.\d+)/)?.[1] || 'Unknown',
          publisher: $('.-pub-publisher').text().trim(),
          dart_3_compatible: $('.package-badge').text().includes('Dart 3 compatible'),
          sdk_data: $('.tag-badge-sub')
            .filter((_, el) => $(el).prev().text().trim() === 'SDK')
            .map((_, el) => $(el).text().trim())
            .get(),
          platform_data: $('.tag-badge-sub')
            .filter((_, el) => $(el).parent().find('.tag-badge-main').text().trim() === 'Platform')
            .map((_, el) => $(el).text().trim())
            .get(),
        };
    } catch (error) {
        console.error(`Error in scrapePackageData for ${packageName}: ${error.message}`);
        return null;
    }
}

async function scrapeThesepackagesFromPub(packageNames) {
    let packagesData = [];

    for (const packageName of packageNames) {
        console.log(`Fetching data for ${packageName}...`);
        const packageData = await scrapePackageData(packageName);
        if (packageData) {
            packagesData.push(packageData);
        } else {
            console.error(`Failed to fetch data for ${packageName}`);
        }
    }

    try {
        fs.writeFileSync('extractedDataPubDataFinalDataCreated.json', JSON.stringify(packagesData, null, 2));
        console.log('extractedDataPubDataFinalDataCreated.json updated successfully');
    } catch (error) {
        console.error(`Error writing to extractedDataPubDataFinalDataCreated.json: ${error.message}`);
    }
    return packagesData;
}

async function uploadImageToSanity(imageUrl) {
    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data, 'binary');
      const asset = await client.assets.upload('image', buffer);
      return {
        _type: 'image',
        asset: { _type: 'reference', _ref: asset._id }
      };
    } catch (error) {
      console.error(`Error uploading image from ${imageUrl}: ${error.message}`);
      return null;
    }
}

async function createPackage(packageData, metadata) {
    try {
      let packageImage = null;
      if (packageData.thumbnail && packageData.thumbnail !== 'https://pub.dev/undefined') {
        packageImage = await uploadImageToSanity(packageData.thumbnail);
      }
  
      const result = await client.create({
        _type: 'package',
        name: packageData.title,
        slug: {
          _type: 'slug',
          current: packageData.title.toLowerCase().replace(/\s+/g, "-").slice(0, 96)
        },
        author: packageData.publisher,
        shortDescription: packageData.description,
        description: metadata.description,
        tutorial: metadata.tutorial,
        example: metadata.main,
        packageImage: packageImage,
        platforms: packageData.platform_data.map(platform => platform.toLowerCase()),
        lastUpdate: new Date(packageData.last_update).toISOString(),
        likesCount: parseInt(packageData.likes),
        pubPoint: parseInt(packageData.points),
        tutorialIncluded: true,
        tags: packageData.hashtags
      });
      console.log(`Created package with ID: ${result._id}`);
    } catch (error) {
      console.error(`Error creating package ${packageData.title}: ${error.message}`);
      if (error.response) {
        console.error('Response details:', JSON.stringify(error.response.data, null, 2));
      }
    }
}
  
async function fetchServerPackageNames() {
    try {
        const fullPackages = await client.fetch(`*[_type == "package"]`);
        return fullPackages.map(package => package.name);
    } catch (error) {
        console.error(`Error fetching server package names: ${error.message}`);
        return [];
    }
}

async function fetchExtractedDataPackages() {
    try {
        return JSON.parse(fs.readFileSync('./extractedDataPackages.json', 'utf8'));
    } catch (error) {
        console.error(`Error reading extractedDataPackages.json: ${error.message}`);
        return [];
    }
}

async function finalPackagesTobeAddedToSanity() {
    const serverPackageNames = await fetchServerPackageNames();
    const extractedDataPackages = await fetchExtractedDataPackages();
    return extractedDataPackages.filter(package => !serverPackageNames.includes(package.packageName));
}

async function main() {
    try {
        const extractedPackageMetas = await finalPackagesTobeAddedToSanity();
        console.log(`Final packages to be added to sanity: ${extractedPackageMetas.length}`);
        const finalpackageNames = extractedPackageMetas.map(package => package.packageName);
        const pubPackagesData = await scrapeThesepackagesFromPub(finalpackageNames);

        for (let i = 0; i < extractedPackageMetas.length; i++) {
            const packageMeta = extractedPackageMetas[i];
            const packageData = pubPackagesData[i];
            if (!packageData) {
                console.error(`No pub data found for package: ${packageMeta.packageName}`);
                continue;
            }
            if (packageMeta.packageName !== packageData.title) {
                console.error(`Package name mismatch: ${packageMeta.packageName} != ${packageData.title}`);
                continue;
            }
            await createPackage(packageData, packageMeta);
        }
        const serverPackageNames = await fetchServerPackageNames();
        console.log(`Total packages in Sanity after update: ${serverPackageNames.length}`);
    } catch (error) {
        console.error(`Error in main function: ${error.message}`);
    }
}

main();

async function FetchList() {
  try {
    const categories = await client.fetch(`*[_type == "category"]`);
    const subCategories = await client.fetch(`*[_type == "subCategory"]`);
    let dict = {};
    for (const subCategory of subCategories) {
      dict[subCategory.name] = subCategory.category._ref;
    }
    for (const [key, value] of Object.entries(dict)) {
      dict[key] = categories.find(category => category._id === value).name;
    }
    
    let newMap = {};
    for (const [key, value] of Object.entries(dict)) {
      newMap[value] = [];
    }
    for (const [key, value] of Object.entries(dict)) {
      newMap[value].push(key);
    }

    // filter only alphabets and remove ending spaces if present
    const subcats = subCategories.map(subCategory => subCategory.name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''));

    const serverPackages = JSON.parse(fs.readFileSync('./serverPackages.json', 'utf8'));

    for (let i = 0; i < serverPackages.length; i++) {
      if (!subcats.includes(serverPackages[i].subcategory)) {
        console.error(`Issue with package ${serverPackages[i].name}: subcategory "${serverPackages[i].subcategory}" not found`);
      }
    }
  } catch (error) {
    console.error(`Error in FetchList: ${error.message}`);
  }
}

async function unlinkPackages() {
  try {
    const packages = await client.fetch(`*[_type == "package"]`);
    for (const package of packages) {
      await client.patch(package._id).unset([
        'subCategories',
        'tags'
      ]).commit();
    }
    console.log('Successfully unlinked all packages');
  } catch (error) {
    console.error(`Error in unlinkPackages: ${error.message}`);
  }
}

async function unlinkSubCategories() {
  try {
    const subCategories = await client.fetch(`*[_type == "subCategory"]`);
    for (const subCategory of subCategories) {
      await client.patch(subCategory._id).unset([
        'category'
      ]).commit();
    }
    console.log('Successfully unlinked all subCategories');
  } catch (error) {
    console.error(`Error in unlinkSubCategories: ${error.message}`);
  }
}

async function deleteCategoryAndSubcategory() {
  try {
    const categories = await client.fetch(`*[_type == "category"]`);
    for (const category of categories) {
      await client.delete(category._id);
    } 
    const subCategories = await client.fetch(`*[_type == "subCategory"]`);
    for (const subCategory of subCategories) {
      try {
        await client.delete(subCategory._id);
      } catch (error) {
        console.error(`Error deleting subCategory: ${subCategory.name}. Error: ${error.message}`);
      }
    }
    console.log('Successfully deleted all categories and subcategories');
  } catch (error) {
    console.error(`Error in deleteCategoryAndSubcategory: ${error.message}`);
  }
}

async function createCategories() {
  try {
    const serverPackageNames = JSON.parse(fs.readFileSync('./serverPackageNames.json', 'utf8'));
    let cats = Object.keys(serverPackageNames);

    const categories = cats.map((category, index) => ({
      _type: 'category',
      name: category,
      order: index
    }));

    console.log('Categories to be created:', categories);

    // Fetch existing categories
    const existingCategories = await client.fetch('*[_type == "category"]');

    for (const category of categories) {
      // Check if the category already exists
      const existingCategory = existingCategories.find(c => c.name === category.name);
      if (existingCategory) {
        console.log(`Category already exists: ${category.name}`);
      } else {
        const result = await client.create(category);
        console.log(`Created category: ${result.name}`);
      }
    }
    console.log('All categories processed successfully');
  } catch (error) {
    console.error(`Error in createCategories: ${error.message}`);
  }
}
// async function redoSanity() {
//   const extractedDataPackages = await fetchExtractedDataPackages();
//   // for each package update the main in sanity
//   for (const package of extractedDataPackages) {
//     const sanityPackage = await client.fetch(`*[_type == "package" && name == "${package.packageName}"]`);
//     if (sanityPackage) {
//       console.log(`Package found ${package.packageName} found in sanity`);
//       await client.patch(sanityPackage[0]._id).set({ example: package.main }).commit();
//     } else {
//       console.log(`Package not-found${package.packageName} not found in sanity`);
//     }
//   }
// }
// redoSanity();