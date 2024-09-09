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

// configurations
const howManyPackagesToFetchFromPub = 400;

async function uniquePackages(packageNames) {
    // fetch from sanity
    const sanityPackages = await client.fetch(`*[_type == "package"] {
        "name": name,
        "slug": slug.current
    }`);
    return packageNames.filter(packageName => !sanityPackages.some(sanityPackage => sanityPackage.name === packageName));
}

async function fetchPackageNames(maxPages) {
    let allPackages = [];
  
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://pub.dev/packages?page=${page}`;
      console.log(`Fetching packages from page ${page}...`);
  
      let retries = 100;
      while (retries > 0) {
        try {
          const response = await axios.get(url);
          const $ = cheerio.load(response.data);
  
          const packages = $('.packages-item')
            .map((_, element) => {
              const packageName = $(element).find('.packages-title a').text().trim();
              return packageName;
            })
            .get();
  
          allPackages = allPackages.concat(packages);
  
          console.log(`Found ${packages.length} packages on page ${page}`);
          break;
        } catch (error) {
          console.error(`Error fetching page ${page}:`, error.message);
          retries--;
          if (retries === 0) {
            console.error(`Failed to fetch page ${page} after 3 retries. Skipping...`);
          } else {
            console.log(`Retrying page ${page}... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
          }
        }
      }
    }

    fs.writeFileSync('packageNamesRepeated.json', JSON.stringify(allPackages, null, 2));
    allPackages = await uniquePackages(allPackages);
    fs.writeFileSync('packageNames.json', JSON.stringify(allPackages, null, 2));
    return allPackages;
  }

// Function to scrape package data from pub.dev
async function scrapePackageData(packageName) {
    const url = `https://pub.dev/packages/${packageName}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
  
    // Helper function to parse numbers, removing any non-digit characters
    const parseNumber = (str) => {
      const digitsOnly = str.replace(/\D/g, '');
      const halfLength = Math.floor(digitsOnly.length / 2);
      // return parseInt(digitsOnly.slice(0, halfLength)) || 0;
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
      last_version: $('h1.title').text().match(/(\d+\.\d+\.\d+)/)[1],
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
  }

    async function fetchAndAppendPackages(packageNames) {
    let packagesData = [];
    if (fs.existsSync('packages.json')) {
        packagesData = JSON.parse(fs.readFileSync('packages.json', 'utf8'));
    }

    for (const packageName of packageNames) {
        console.log(`Fetching data for ${packageName}...`);
        const packageData = await scrapePackageData(packageName);
        packagesData.push(packageData);
    }

    fs.writeFileSync('packages.json', JSON.stringify(packagesData, null, 2));
    console.log('packages.json updated successfully');
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
      console.error('Error uploading image:', error);
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
          console.error('Error creating package:', error.message);
          if (error.response) {
            console.error('Response details:', error.response);
          }
        }
      }

// Create all packages
let universalCount = 0;
async function createAllPackages() {
    const packagesData = JSON.parse(fs.readFileSync('packages.json', 'utf8'));
    const serverPackages = await client.fetch(`*[_type == "package"]`);
      for (const packageData of packagesData) {
        if (serverPackages.some(serverPackage => serverPackage.name === packageData.title)) {
          console.log(`Package ${packageData.title} already exists on server`);
          continue;
        }
        try {
          // load extractedDataPackages.json
      const extractedDataPackages = JSON.parse(fs.readFileSync('extractedDataPackages.json', 'utf8'));
          await createPackage(packageData, extractedDataPackages.filter(item => item.packageName === packageData.title)[0]);
        } catch (error) {
          console.error('Failed to create package:', packageData.title);
          console.error('Error:', error);
          return; // Stop processing if there's an error
        }
      }
    console.log('All packages created successfully');
}

async function main() {
//   // Fetch packages with undefined tutorials
//   packagesWithoutTutorials = await client.fetch(`*[_type == "package"]`);
//   packagesWithoutTutorials = packagesWithoutTutorials.filter(pkg =>  pkg.tutorial == undefined);
  
//   console.log(`Found ${packagesWithoutTutorials.length} packages without tutorials`);

//   // Log the names of packages without tutorials
//   packagesWithoutTutorials.forEach(pkg => {
//     // console.log(`Package without tutorial: ${pkg.name}`);
//   });

//   // Uncomment the following lines if you want to delete these packages
//   let deletedPackages = [];
//   for (const package of packagesWithoutTutorials) {
//     // await client.delete(package._id);
//     // console.log(`Deleted package: ${package.name}`);
//     deletedPackages.push(package.name);
//   }
//   deletedPackages.sort();
//   console.log(deletedPackages);

//   let items = []
// console.log(items.length);
// const packagesWithTutorials = await client.fetch(`*[_type == "package"]`);
// console.log(packagesWithTutorials);
// const listOfPackagesWithTutorials = packagesWithTutorials.map(item => item.name);
// console.log(listOfPackagesWithTutorials.length);

// // filter items for items which are not in packagesWithTutorials
// finalList = [];
// console.log(listOfPackagesWithTutorials);
// for (const item of items) {
//   if (!listOfPackagesWithTutorials.includes(item.packageName)) {
//     finalList.push(item);
//   }
// }
// console.log(finalList);
// onlyPackageNames = finalList.map(item => item.packageName);
// // write finalList to a file
// fs.writeFileSync('finalList.json', JSON.stringify(onlyPackageNames, null, 2));

  // // await createMetadata();

  // // // Uncomment if you want to recreate packages after deletion
  // await fetchPackageNames(1000);

  // // // Fetch updated count after operations
  // const updatedPackagesCount = await client.fetch(`count(*[_type == "package"])`);
  // console.log(`Total packages after operation: ${updatedPackagesCount}`);
}

main();