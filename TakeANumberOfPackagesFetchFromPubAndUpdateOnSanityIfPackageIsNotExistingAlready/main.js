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
  
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error.message);
        break;
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

    async function createPackage(packageData) {
        try {
          let packageImage = null;
          if (packageData.thumbnail) {
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
            packageImage: packageImage,
            subCategories: [
              {
                _key: "b67722e94ec1",
                _ref: "7a9c3d73-c421-49a9-9b16-2f3b4a96416c",
                _type: "reference"
              }
            ],
            platforms: packageData.platform_data.map(platform => platform.toLowerCase()),
            lastUpdate: new Date(packageData.last_update).toISOString(),
            likesCount: parseInt(packageData.likes),
            pubPoint: parseInt(packageData.points),
            tutorialIncluded: true,
            tags: packageData.hashtags,
            description: packageData.description
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
async function createAllPackages() {
    const packagesData = JSON.parse(fs.readFileSync('packages.json', 'utf8'));
      for (const packageData of packagesData) {
        try {
          await createPackage(packageData);
        } catch (error) {
          console.error('Failed to create package:', packageData.title);
          console.error('Error:', error);
          return; // Stop processing if there's an error
        }
      }
    console.log('All packages created successfully');
}

async function main() {
  console.log('Starting the script...');
  const packageNames = await fetchPackageNames(howManyPackagesToFetchFromPub / 10);
  console.log('packageNames', packageNames);
  const packageData = await fetchAndAppendPackages(packageNames);
  console.log('packageData', packageData);
  createAllPackages();
}

main();